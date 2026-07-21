const CONFIG = {
  twitch: {
    clientId: "",        // Your Twitch Client ID
    oauthToken: "",      // Your Twitch OAuth token (starts with oauth:)
    broadcasterId: "",   // Your Twitch User ID (auto-filled after auth)
    channelName: "LawFifteen"
  },
  lastfm: {
    apiKey: "839c14e8820accf8fa7575683594f729",
    username: "AmbrosioRequiem"
  },
  refreshIntervals: {
    followers: 30000,    // Check for new followers every 30s
    subscribers: 60000,  // Check for new subscribers every 60s
    music: 5000,         // Poll Last.fm every 5s
  },
  maxRecentEvents: 5,    // Number of recent events to show
};
