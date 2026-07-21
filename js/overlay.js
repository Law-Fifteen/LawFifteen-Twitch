/**
 * Haze Overlay — Core Logic
 * Handles polling, rendering, and scene detection.
 */

// ── Helpers ──────────────────────────────────────────

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderEventItem(event, icon) {
  return `
    <div class="event-item">
      <div class="event-icon">${icon}</div>
      <div class="event-info">
        <div class="event-username">${escapeHtml(event.username)}</div>
        <div class="event-time">${timeAgo(event.followedAt || event.subscribedAt)}</div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setEventsList(containerId, items, icon) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<div class="empty-state">No recent events</div>';
    return;
  }
  el.innerHTML = items.map((e) => renderEventItem(e, icon)).join("");
}

// ── State ────────────────────────────────────────────

let lastFollowers = [];
let lastSubscribers = [];

// ── Polling ──────────────────────────────────────────

async function pollFollowers() {
  if (!CONFIG.twitch.clientId || !CONFIG.twitch.oauthToken) return;
  try {
    const followers = await twitchAPI.getFollowers(CONFIG.maxRecentEvents);
    if (followers.length > 0 && JSON.stringify(followers) !== JSON.stringify(lastFollowers)) {
      lastFollowers = followers;
      setEventsList("follows-list", followers, "♥");
    }
  } catch (e) {
    console.warn("Follower poll error:", e);
  }
}

async function pollSubscribers() {
  if (!CONFIG.twitch.clientId || !CONFIG.twitch.oauthToken) return;
  try {
    const subs = await twitchAPI.getSubscribers(CONFIG.maxRecentEvents);
    if (subs.length > 0 && JSON.stringify(subs) !== JSON.stringify(lastSubscribers)) {
      lastSubscribers = subs;
      setEventsList("subs-list", subs, "★");
    }
  } catch (e) {
    console.warn("Subscriber poll error:", e);
  }
}

// ── Music Widget (Last.fm integration) ───────────────

let lastTrackTitle = "";

async function pollMusic() {
  if (!CONFIG.lastfm.apiKey || !CONFIG.lastfm.username) return;
  try {
    const track = await lastfmAPI.getNowPlaying();
    if (!track) return;

    // Only update DOM if track changed
    if (track.title !== lastTrackTitle) {
      lastTrackTitle = track.title;
      updateMusicWidget(track.title, track.artist);
      console.log("Now playing:", track.artist, "-", track.title);
    }

    // Show "Not streaming" indicator if nothing is actively playing
    if (!track.isNowPlaying) {
      updateMusicWidget("(not playing)", "Idle");
    }
  } catch (e) {
    console.warn("Music poll error:", e);
  }
}

function updateMusicWidget(title, artist) {
  const titleEl = document.getElementById("song-title");
  const artistEl = document.getElementById("song-artist");
  const progressEl = document.getElementById("song-progress");

  if (titleEl) titleEl.textContent = title || "No track playing";
  if (artistEl) artistEl.textContent = artist || "—";

  // Last.fm doesn't provide progress/duration in getrecenttracks,
  // so we hide the progress bar when not actively streaming
  if (progressEl) {
    progressEl.style.width = title ? "100%" : "0%";
    progressEl.style.opacity = title ? "0.5" : "0";
  }
}

// ── Panel Visibility (CSS animation trigger) ─────────

function markPanelsVisible() {
  document.querySelectorAll(".panel, .events-card, .music-widget, .camera-frame").forEach((el) => {
    el.classList.add("visible");
  });
}

// ── Init ─────────────────────────────────────────────

function init() {
  markPanelsVisible();

  // Detect which scene we're in and start polling
  const isChatting = !!document.getElementById("chatting-scene");
  const isGameplay = !!document.getElementById("gameplay-scene");

  // Poll music on both scenes
  pollMusic();
  setInterval(pollMusic, CONFIG.refreshIntervals.music);

  if (isChatting) {
    pollFollowers();
    pollSubscribers();
    setInterval(pollFollowers, CONFIG.refreshIntervals.followers);
    setInterval(pollSubscribers, CONFIG.refreshIntervals.subscribers);
  }

  // Mark panels visible after a short delay for CSS animation
  setTimeout(() => {
    document.querySelectorAll(".fade-in").forEach((el) => {
      el.classList.add("visible");
    });
  }, 100);

  console.log("Haze overlay initialized —", isChatting ? "Chatting Scene" : "Gameplay Scene");
}

document.addEventListener("DOMContentLoaded", init);
