/**
 * Last.fm API Integration
 * Fetches currently playing and recent tracks.
 */
class LastFmAPI {
  constructor(config) {
    this.apiKey = config.lastfm.apiKey;
    this.username = config.lastfm.username;
    this.baseUrl = "https://ws.audioscrobbler.com/2.0/";
  }

  async getRecentTracks(limit = 1) {
    if (!this.apiKey || !this.username) return null;

    const url = `${this.baseUrl}?method=user.getrecenttracks&user=${encodeURIComponent(this.username)}&api_key=${this.apiKey}&format=json&limit=${limit}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Last.fm API ${res.status}`);
        return null;
      }
      const data = await res.json();
      return data?.recenttracks?.track || [];
    } catch (err) {
      console.error("Last.fm API request failed:", err);
      return [];
    }
  }

  /** Returns the currently playing track, or the most recent track if nothing is playing. */
  async getNowPlaying() {
    const tracks = await this.getRecentTracks(1);
    if (!tracks || tracks.length === 0) return null;

    const track = tracks[0];
    const isNowPlaying = track["@attr"]?.nowplaying === "true";

    return {
      title: track.name || "Unknown",
      artist: track.artist?.["#text"] || "Unknown",
      album: track.album?.["#text"] || "",
      image: this.getImageUrl(track.image),
      isNowPlaying,
    };
  }

  getImageUrl(images) {
    if (!images || !Array.isArray(images)) return "";
    // Prefer large or extralarge, fall back to any
    const sizes = ["extralarge", "large", "medium", "small"];
    for (const size of sizes) {
      const img = images.find((i) => i.size === size);
      if (img?.["#text"]) return img["#text"];
    }
    return images[images.length - 1]?.["#text"] || "";
  }
}

const lastfmAPI = new LastFmAPI(CONFIG);
