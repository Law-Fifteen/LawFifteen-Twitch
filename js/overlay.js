/**
 * Haze Overlay — Core Logic
 * Handles polling, rendering, scene detection, and control panel integration.
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
let lastTrackTitle = "";
let lastTrackImage = "";
let trackStartTime = 0;
let trackEstimatedDuration = 210000;
let progressInterval = null;
let sweepEnabled = true;

// ── Control Panel (BroadcastChannel) ─────────────────

function initControlPanel() {
  const channel = new BroadcastChannel("haze-overlay");

  channel.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "ping") {
      channel.postMessage({ type: "overlay-ready" });
      return;
    }

    if (msg.type === "toggle") {
      applyToggle(msg.feature, msg.enabled);
    }

    if (msg.type === "scene") {
      // Scene switching is handled by OBS switching Browser Sources.
      // This is a visual indicator only.
      console.log("Scene switch requested:", msg.scene);
      document.title = `Haze — ${msg.scene === "chatting" ? "Just Chatting" : "Gameplay"}`;
    }
  };

  // Apply saved state from localStorage
  ["music", "camera", "bokeh", "sweep", "subs", "follows", "progress"].forEach((feature) => {
    const saved = localStorage.getItem(`haze-${feature}`);
    if (saved === "false") {
      applyToggle(feature, false);
      // Sync toggle UI
      const toggle = document.querySelector(`[data-toggle="${feature}"]`);
      if (toggle) toggle.checked = false;
    }
  });
}

function applyToggle(feature, enabled) {
  localStorage.setItem(`haze-${feature}`, enabled);

  switch (feature) {
    case "music":
      toggleElement("music-widget", enabled);
      break;
    case "camera":
      toggleElement("camera", enabled);
      document.querySelectorAll(".camera-frame").forEach((el) => {
        el.style.border = enabled ? "" : "2px solid transparent";
        el.style.boxShadow = enabled ? "" : "none";
      });
      break;
    case "bokeh":
      if (enabled) {
        hazeEffects?.init();
      } else {
        hazeEffects?.stop();
        const canvas = document.getElementById("particle-canvas");
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      break;
    case "sweep":
      sweepEnabled = enabled;
      break;
    case "subs":
      toggleElement("recent-subs", enabled);
      break;
    case "follows":
      toggleElement("recent-follows", enabled);
      break;
    case "progress":
      document.querySelectorAll(".progress-bar-track").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
  }
}

function toggleElement(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? "" : "none";
}

// ── Polling ──────────────────────────────────────────

async function pollFollowers() {
  if (!CONFIG.twitch.clientId || !CONFIG.twitch.oauthToken) return;
  try {
    const followers = await twitchAPI.getFollowers(CONFIG.maxRecentEvents);
    if (followers.length > 0 && JSON.stringify(followers) !== JSON.stringify(lastFollowers)) {
      lastFollowers = followers;
      setEventsList("follows-list", followers, "\u2665");
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
      setEventsList("subs-list", subs, "\u2605");
    }
  } catch (e) {
    console.warn("Subscriber poll error:", e);
  }
}

// ── Music Widget (Last.fm integration) ───────────────

async function pollMusic() {
  if (!CONFIG.lastfm.apiKey || !CONFIG.lastfm.username) return;
  try {
    const track = await lastfmAPI.getNowPlaying();
    if (!track) return;

    if (track.title !== lastTrackTitle || track.image !== lastTrackImage) {
      lastTrackTitle = track.title;
      lastTrackImage = track.image;
      trackStartTime = Date.now();
      startProgressAnimation(track.title, track.artist, track.image);

      // Trigger sweep on song change
      if (sweepEnabled && hazeEffects?.triggerSweep) {
        hazeEffects.triggerSweep();
      }

      console.log("Now playing:", track.artist, "-", track.title);
    }

    if (!track.isNowPlaying) {
      stopProgressAnimation();
      updateMusicWidget("(not playing)", "Idle", "", false);
    }
  } catch (e) {
    console.warn("Music poll error:", e);
  }
}

function startProgressAnimation(title, artist, imageUrl) {
  stopProgressAnimation();
  updateMusicWidget(title, artist, imageUrl, true);

  const progressEl = document.getElementById("song-progress");
  if (!progressEl) return;

  progressEl.style.width = "0%";
  progressEl.style.opacity = "1";

  progressInterval = setInterval(() => {
    const elapsed = Date.now() - trackStartTime;
    const pct = Math.min((elapsed / trackEstimatedDuration) * 100, 95);
    progressEl.style.width = `${pct}%`;
  }, 1000);
}

function stopProgressAnimation() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function updateMusicWidget(title, artist, imageUrl, isActive) {
  const titleEl = document.getElementById("song-title");
  const artistEl = document.getElementById("song-artist");
  const progressEl = document.getElementById("song-progress");
  const albumArtEl = document.getElementById("album-art");

  if (titleEl) {
    titleEl.textContent = title || "No track playing";
    titleEl.classList.remove("scroll-text");
    void titleEl.offsetWidth;
    if (titleEl.scrollWidth > titleEl.clientWidth) {
      titleEl.classList.add("scroll-text");
    }
  }

  if (artistEl) {
    artistEl.textContent = artist || "\u2014";
    artistEl.classList.remove("scroll-text");
    void artistEl.offsetWidth;
    if (artistEl.scrollWidth > artistEl.clientWidth) {
      artistEl.classList.add("scroll-text");
    }
  }

  if (albumArtEl) {
    if (imageUrl) {
      albumArtEl.src = imageUrl;
      albumArtEl.classList.add("loaded");
    } else {
      albumArtEl.src = "";
      albumArtEl.classList.remove("loaded");
    }
  }

  if (progressEl && !isActive) {
    progressEl.style.width = "0%";
    progressEl.style.opacity = "0";
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
  initControlPanel();

  // Start effects system
  hazeEffects?.init();

  const isChatting = !!document.getElementById("chatting-scene");
  const isGameplay = !!document.getElementById("gameplay-scene");

  pollMusic();
  setInterval(pollMusic, CONFIG.refreshIntervals.music);

  if (isChatting) {
    pollFollowers();
    pollSubscribers();
    setInterval(pollFollowers, CONFIG.refreshIntervals.followers);
    setInterval(pollSubscribers, CONFIG.refreshIntervals.subscribers);
  }

  setTimeout(() => {
    document.querySelectorAll(".fade-in").forEach((el) => {
      el.classList.add("visible");
    });
  }, 100);

  console.log("Haze overlay initialized \u2014", isChatting ? "Chatting Scene" : "Gameplay Scene");
}

document.addEventListener("DOMContentLoaded", init);
