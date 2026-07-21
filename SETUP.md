# Haze Overlay — Setup Guide

## Quick Start (No API — works immediately)

1. Open OBS Studio
2. Add a new **Browser Source**
3. Point it to:
   - `file:///Z:/Twitch%20Resources/Scenes/index.html` (gameplay)
   - `file:///Z:/Twitch%20Resources/Scenes/chatting.html` (just chatting)
4. Set width to `1920`, height to `1080`
5. Done — the overlay renders immediately with animations

> **Note:** Without API credentials, recent events will show "Waiting for data..."
> The overlay itself, camera frame, and animations all work out of the box.

---

## Setting Up Live Data (Twitch API)

You need two things: a **Client ID** and an **OAuth Token**.

### Step 1: Create a Twitch Application

1. Go to https://dev.twitch.tv/console/apps
2. Click **Register Your Application**
3. Fill in:
   - **Name:** `Haze Overlay` (or anything)
   - **OAuth Redirect URL:** `http://localhost` (required but not used)
   - **Category:** `Application Integration`
4. Click **Create**
5. Copy the **Client ID** — paste it into `config.js` as `clientId`

### Step 2: Generate an OAuth Token

1. Go to https://twitchapps.com/tmi/
2. Click **Connect with Twitch** and authorize
3. Copy the token (starts with `oauth:`)
4. Paste it into `config.js` as `oauthToken`

> **Token permissions:** A user token from TwitchApps gives you read access to
> your followers. Subscribers require broadcaster-level permissions which the
> Twitch API now restricts — see "Subscriber Limitations" below.

### Step 3: Edit config.js

Open `config.js` and fill in:

```js
const CONFIG = {
  twitch: {
    clientId: "your_client_id_here",
    oauthToken: "oauth:your_token_here",
    broadcasterId: "",  // leave blank — auto-fills on first run
    channelName: "LawFifteen"
  },
  ...
};
```

The `broadcasterId` auto-populates from your channel name on first load.

---

## Now Playing — Last.fm Integration

The music widget pulls your currently playing track from Last.fm. You need a
free Last.fm account and an API key.

### Step 1: Get a Last.fm API Key

1. Go to https://www.last.fm/api/account/create
2. Fill in:
   - **Application Name:** `Haze Overlay` (or anything)
   - **Contact Email:** your email
3. Click **Submit**
4. Copy the **API Key** — paste it into `config.js` as `lastfm.apiKey`

### Step 2: Make Sure Scrobbling is Enabled

The overlay shows whatever your Last.fm profile reports as "now playing." Make
sure your music app (Spotify, Apple Music, etc.) is connected to Last.fm:

1. Go to https://www.last.fm/settings/applications
2. Connect your music player (Spotify, etc.)
3. Music will now appear in the overlay automatically

### Step 3: Edit config.js

```js
lastfm: {
  apiKey: "your_lastfm_api_key_here",
  username: "AmbrosioRequiem"
},
```

> **Note:** There can be a 2-4 minute delay between when you start a track and
> when Last.fm reports it. The overlay polls every 5 seconds.

---

## TwitchAlerts Integration

The overlay includes an `<div id="alert-box">` positioned center-screen.
TwitchAlerts (StreamElements/Streamlabs) can target this with a custom CSS
alert box, or you can add their widget as a separate Browser Source layered
on top.

**Recommended approach:** Add your TwitchAlerts widget as its own Browser
Source in OBS and position it over the `alert-box` area.

---

## OBS Scene Setup

### Scene: Gameplay
1. Browser Source → `index.html` (1920×1080, **check** "Shutdown source when not visible")
2. Video Capture Device → resize and position inside the camera frame
3. Game Capture / Window Capture → bottom layer

### Scene: Just Chatting
1. Browser Source → `chatting.html` (1920×1080)
2. Video Capture Device → position inside the camera frame area

### Toggling Between Scenes
In OBS, create two scenes and add the Browser Sources to each.
Switch scenes in OBS — each overlay renders independently.

---

## File Structure

```
Scenes/
├── index.html          ← Gameplay scene (camera bottom-right + music)
├── chatting.html       ← Just Chatting scene (camera + events panel)
├── config.js           ← Your API credentials (DO NOT commit this)
├── config.example.js   ← Template for others to copy
├── css/
│   └── style.css       ← All styling + animations
├── js/
│   ├── twitch-api.js   ← Twitch API integration
│   ├── lastfm-api.js   ← Last.fm now playing integration
│   └── overlay.js      ← Core logic + rendering
└── SETUP.md            ← This file
```
