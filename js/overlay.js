/**
 * Haze Overlay — Core Logic
 * Scene switching, toggles, music, and control bar.
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

const SCENE_DISPLAY = {
  gameplay: "flex",
  chatting: "grid",
  ultrawide: "block",
};

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

  // Restore saved scene or default to gameplay
  const saved = localStorage.getItem("haze-scene");
  if (saved && document.getElementById(`${saved}-scene`)) {
    switchScene(saved, false);
  } else {
    switchScene("gameplay", false);
  }

  // Show control bar briefly on load
  const bar = document.getElementById("control-bar");
  if (bar) {
    bar.classList.add("visible");
    setTimeout(() => bar.classList.remove("visible"), 2500);
  }

  // Click empty space to toggle control bar
  document.addEventListener("click", (e) => {
    const bar = document.getElementById("control-bar");
    if (!bar) return;
    if (bar.contains(e.target)) return;
    bar.classList.toggle("visible");
  });
}

function switchScene(scene, save = true) {
  // Hide all scenes, show the target
  ["gameplay", "chatting", "ultrawide"].forEach((name) => {
    const el = document.getElementById(`${name}-scene`);
    if (!el) return;
    if (name === scene) {
      el.style.display = SCENE_DISPLAY[name] || "block";
    } else {
      el.style.display = "none";
    }
  });

  // Update button states
  document.querySelectorAll(".ctrl-btn[data-scene]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scene === scene);
  });

  activeScene = scene;
  if (save) localStorage.setItem("haze-scene", scene);

  // Re-apply saved toggles
  ["music", "camera", "bokeh", "progress", "subs", "follows"].forEach((feature) => {
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
      document.querySelectorAll(".music-widget").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
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
      document.querySelectorAll(".recent-subs").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
    case "follows":
      document.querySelectorAll(".recent-follows").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
    case "progress":
      document.querySelectorAll(".progress-bar-track").forEach((el) => {
        el.style.display = enabled ? "" : "none";
      });
      break;
  }
}

// ── Polling ──────────────────────────────────────────

async function pollFollowers() {
  if (!CONFIG.twitch?.clientId || !CONFIG.twitch?.oauthToken) return;
  try {
    const followers = await twitchAPI.getFollowers(CONFIG.maxRecentEvents);
    if (followers.length > 0 && JSON.stringify(followers) !== JSON.stringify(lastFollowers)) {
      lastFollowers = followers;
      document.querySelectorAll(".follows-list").forEach((el) => {
        el.innerHTML = followers.map((e) => renderEventItem(e, "\u2665")).join("") || '<div class="empty-state">No recent events</div>';
      });
    }
  } catch (e) {
    console.warn("Follower poll error:", e);
  }
}

async function pollSubscribers() {
  if (!CONFIG.twitch?.clientId || !CONFIG.twitch?.oauthToken) return;
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
  if (!CONFIG.lastfm?.apiKey || !CONFIG.lastfm?.username) return;
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
  if (el._marqueeTimeout) clearTimeout(el._marqueeTimeout);
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

  document.querySelectorAll(".song-title").forEach((el) => {
    if (el.textContent !== newTitle) {
      el.textContent = newTitle;
    }
    if (newTitle !== lastScrollTitle) {
      setupScrollText(el);
    }
  });

  lastScrollTitle = newTitle;

  document.querySelectorAll(".song-artist").forEach((el) => {
    el.textContent = artist || "\u2014";
  });

  document.querySelectorAll(".album-art").forEach((el) => {
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

// ── Init ─────────────────────────────────────────────

function init() {
  document.querySelectorAll(".panel, .events-card, .music-widget, .camera-frame").forEach((el) => {
    el.classList.add("visible");
  });

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
