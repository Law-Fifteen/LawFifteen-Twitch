/**
 * Haze Overlay — Core Logic
 * Handles polling, rendering, effects, and inline control bar.
 * All selectors are scoped to the active scene.
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

function setEventsList(selector, items, icon) {
  const el = document.querySelector(selector);
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
let activeScene = "gameplay";

// ── Active Scene Helpers ─────────────────────────────

function getActiveSceneEl() {
  return document.querySelector(".scene.active");
}

function queryActive(selector) {
  const scene = getActiveSceneEl();
  return scene ? scene.querySelector(selector) : null;
}

function queryActiveAll(selector) {
  const scene = getActiveSceneEl();
  return scene ? scene.querySelectorAll(selector) : [];
}

// ── Control Bar ──────────────────────────────────────

function initControlBar() {
  ["music", "camera", "bokeh", "sweep", "subs", "follows", "progress"].forEach((feature) => {
    const saved = localStorage.getItem(`haze-${feature}`);
    if (saved === "false") {
      applyToggle(feature, false);
      const toggle = document.querySelector(`[data-toggle="${feature}"]`);
      if (toggle) toggle.checked = false;
    }
  });

  const saved = localStorage.getItem("haze-scene");
  if (saved && document.getElementById(`${saved}-scene`)) {
    switchScene(saved);
  }

  const bar = document.getElementById("control-bar");
  if (bar) {
    bar.classList.add("visible");
    setTimeout(() => bar.classList.remove("visible"), 2500);
  }

  document.addEventListener("click", (e) => {
    const bar = document.getElementById("control-bar");
    if (!bar) return;
    if (bar.contains(e.target)) return;
    bar.classList.toggle("visible");
  });
}

function switchScene(scene) {
  document.querySelectorAll(".scene").forEach((el) => {
    el.classList.remove("active");
  });
  const target = document.getElementById(`${scene}-scene`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".ctrl-btn[data-scene]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scene === scene);
  });

  activeScene = scene;
  localStorage.setItem("haze-scene", scene);

  // Re-apply saved toggles to the new scene
  ["music", "camera", "bokeh", "progress"].forEach((feature) => {
    const saved = localStorage.getItem(`haze-${feature}`);
    if (saved === "false") applyToggle(feature, false);
  });

  // Re-run music setup for new scene
  if (lastTrackTitle) {
    startProgressAnimation(lastTrackTitle, lastTrackImage, "", true);
  }

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
      queryActiveAll(".music-widget").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
    case "camera":
      queryActiveAll(".camera-frame").forEach((el) => {
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
      queryActiveAll(".recent-subs").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
    case "follows":
      queryActiveAll(".recent-follows").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
    case "progress":
      queryActiveAll(".progress-bar-track").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
  }
}

// ── Polling ──────────────────────────────────────────

async function pollFollowers() {
  if (!CONFIG.twitch.clientId || !CONFIG.twitch.oauthToken) return;
  try {
    const followers = await twitchAPI.getFollowers(CONFIG.maxRecentEvents);
    if (followers.length > 0 && JSON.stringify(followers) !== JSON.stringify(lastFollowers)) {
      lastFollowers = followers;
      document.querySelectorAll(".subs-list").forEach((el) => {
        el.innerHTML = followers.map((e) => renderEventItem(e, "\u2665")).join("") || '<div class="empty-state">No recent events</div>';
      });
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
      document.querySelectorAll(".subs-list").forEach((el) => {
        el.innerHTML = subs.map((e) => renderEventItem(e, "\u2605")).join("") || '<div class="empty-state">No recent events</div>';
      });
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
      updateAllMusicWidgets("No song playing.. Suggest one in the chat!", "Idle", "", false);
    }
  } catch (e) {
    console.warn("Music poll error:", e);
  }
}

function startProgressAnimation(title, artist, imageUrl) {
  stopProgressAnimation();
  updateAllMusicWidgets(title, artist, imageUrl, true);

  document.querySelectorAll(".song-progress").forEach((el) => {
    el.style.width = "0%";
    el.style.opacity = "1";
  });

  progressInterval = setInterval(() => {
    const elapsed = Date.now() - trackStartTime;
    const pct = Math.min((elapsed / trackEstimatedDuration) * 100, 95);
    document.querySelectorAll(".song-progress").forEach((el) => {
      el.style.width = `${pct}%`;
    });
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
  el.style.transform = "";
  if (el._marqueeRAF) cancelAnimationFrame(el._marqueeRAF);
  if (el._marqueeTimeout) clearTimeout(el._marqueeTimeout);
  el._marqueeRAF = null;
  el._marqueeTimeout = null;

  const containerWidth = el.parentElement.clientWidth;
  const textWidth = el.scrollWidth;

  if (textWidth <= containerWidth + 4) return;

  const scrollPx = textWidth - containerWidth + 20;
  const speed = 40;
  const holdMs = 2000;
  const totalMs = (scrollPx / speed) * 1000;

  function runMarquee() {
    el.style.transition = "none";
    el.style.transform = "translateX(0)";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${totalMs}ms linear`;
        el.style.transform = `translateX(-${scrollPx}px)`;

        el._marqueeTimeout = setTimeout(() => {
          el.style.transition = "none";
          el.style.transform = "translateX(0)";
          el._marqueeTimeout = setTimeout(runMarquee, 300);
        }, totalMs + holdMs);
      });
    });
  }

  runMarquee();
}

let lastScrollTitle = "";

function updateAllMusicWidgets(title, artist, imageUrl, isActive) {
  const newTitle = title || "No song playing.. Suggest one in the chat!";

  document.querySelectorAll(".scene .song-title").forEach((el) => {
    if (el.textContent !== newTitle) {
      el.textContent = newTitle;
    }
    if (newTitle !== lastScrollTitle) {
      setupScrollText(el);
    }
  });

  lastScrollTitle = newTitle;

  document.querySelectorAll(".scene .song-artist").forEach((el) => {
    el.textContent = artist || "\u2014";
  });

  document.querySelectorAll(".scene .album-art").forEach((el) => {
    if (imageUrl) {
      el.src = imageUrl;
      el.classList.add("loaded");
    } else {
      el.src = "";
      el.classList.remove("loaded");
    }
  });

  if (!isActive) {
    document.querySelectorAll(".song-progress").forEach((el) => {
      el.style.width = "0%";
      el.style.opacity = "0";
    });
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

  pollMusic();
  setInterval(pollMusic, CONFIG.refreshIntervals.music);

  pollFollowers();
  pollSubscribers();
  setInterval(pollFollowers, CONFIG.refreshIntervals.followers);
  setInterval(pollSubscribers, CONFIG.refreshIntervals.subscribers);

  setTimeout(() => {
    document.querySelectorAll(".fade-in").forEach((el) => {
      el.classList.add("visible");
    });
  }, 100);

  console.log("Haze overlay initialized");
}

document.addEventListener("DOMContentLoaded", init);
