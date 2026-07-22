/**
 * Haze Overlay — Core Logic
 * Handles polling, rendering, effects, and inline control bar.
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

// ── Control Bar ──────────────────────────────────────

function initControlBar() {
  // Restore saved toggle states
  ["music", "camera", "bokeh", "sweep", "subs", "follows", "progress"].forEach((feature) => {
    const saved = localStorage.getItem(`haze-${feature}`);
    if (saved === "false") {
      applyToggle(feature, false);
      const toggle = document.querySelector(`[data-toggle="${feature}"]`);
      if (toggle) toggle.checked = false;
    }
  });

  // Mark active scene button
  const scene = getActiveScene();
  document.querySelectorAll(".ctrl-btn[data-scene]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scene === scene);
  });

  // Show control bar briefly on load so user knows it's there
  const bar = document.getElementById("control-bar");
  if (bar) {
    bar.classList.add("visible");
    setTimeout(() => bar.classList.remove("visible"), 2500);
  }
}

function getActiveScene() {
  if (document.getElementById("gameplay-scene")) return "gameplay";
  if (document.getElementById("chatting-scene")) return "chatting";
  if (document.getElementById("ultrawide-scene")) return "ultrawide";
  return "gameplay";
}

function switchScene(scene) {
  // In OBS, scene switching is done by toggling Browser Source visibility.
  // This function highlights the active button and saves preference.
  document.querySelectorAll(".ctrl-btn[data-scene]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scene === scene);
  });
  localStorage.setItem("haze-scene", scene);
  console.log("Scene:", scene);
}

function applyPreset(name) {
  const presets = {
    full: { music: true, camera: true, bokeh: true, sweep: true, subs: true, follows: true, progress: true },
    minimal: { music: true, camera: true, bokeh: false, sweep: false, subs: false, follows: false, progress: true },
    off: { music: false, camera: false, bokeh: false, sweep: false, subs: false, follows: false, progress: false },
  };

  const preset = presets[name];
  if (!preset) return;

  Object.entries(preset).forEach(([feature, enabled]) => {
    applyToggle(feature, enabled);
    const toggle = document.querySelector(`[data-toggle="${feature}"]`);
    if (toggle) toggle.checked = enabled;
  });
}

function applyToggle(feature, enabled) {
  localStorage.setItem(`haze-${feature}`, enabled);

  switch (feature) {
    case "music":
      toggleElement("music-widget", enabled);
      break;
    case "camera":
      document.querySelectorAll(".camera-frame").forEach((el) => {
        el.style.display = enabled ? "" : "none";
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

      if (sweepEnabled && hazeEffects?.triggerSweep) {
        hazeEffects.triggerSweep();
      }

      console.log("Now playing:", track.artist, "-", track.title);
    }

    if (!track.isNowPlaying) {
      stopProgressAnimation();
      updateMusicWidget("No song playing.. Suggest one in the chat!", "Idle", "", false);
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

function setupScrollText(el) {
  el.classList.remove("scroll-text");
  void el.offsetWidth;

  const containerWidth = el.parentElement.clientWidth;
  const textWidth = el.scrollWidth;

  if (textWidth > containerWidth + 4) {
    const scrollPx = textWidth - containerWidth + 30;
    const duration = Math.max(8, scrollPx / 25);

    el.style.setProperty("--scroll-distance", `-${scrollPx}px`);
    el.style.setProperty("--scroll-duration", `${duration}s`);
    el.classList.add("scroll-text");
  }
}

function updateMusicWidget(title, artist, imageUrl, isActive) {
  const titleEl = document.getElementById("song-title");
  const artistEl = document.getElementById("song-artist");
  const progressEl = document.getElementById("song-progress");
  const albumArtEl = document.getElementById("album-art");

  if (titleEl) {
    titleEl.textContent = title || "No track playing";
    setupScrollText(titleEl);
  }

  if (artistEl) {
    artistEl.textContent = artist || "\u2014";
    setupScrollText(artistEl);
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

// ── Panel Visibility ─────────────────────────────────

function markPanelsVisible() {
  document.querySelectorAll(".panel, .events-card, .music-widget, .camera-frame").forEach((el) => {
    el.classList.add("visible");
  });
}

// ── Init ─────────────────────────────────────────────

function init() {
  markPanelsVisible();
  initControlBar();

  hazeEffects?.init();

  const isChatting = !!document.getElementById("chatting-scene");

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

  console.log("Haze overlay initialized");
}

document.addEventListener("DOMContentLoaded", init);
