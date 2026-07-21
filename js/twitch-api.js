/**
 * Twitch API Integration
 * Handles fetching followers, subscribers, and channel info.
 */
class TwitchAPI {
  constructor(config) {
    this.clientId = config.twitch.clientId;
    this.oauthToken = config.twitch.oauthToken;
    this.broadcasterId = config.twitch.broadcasterId;
    this.channelName = config.twitch.channelName;
    this.baseUrl = "https://api.twitch.tv/helix";
    this.headers = {
      "Client-ID": this.clientId,
      Authorization: `Bearer ${this.oauthToken.replace("oauth:", "")}`,
    };
  }

  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      if (!res.ok) {
        console.error(`Twitch API ${res.status}: ${await res.text()}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error("Twitch API request failed:", err);
      return null;
    }
  }

  /** Resolve broadcaster ID from channel name (auto-fills CONFIG) */
  async resolveBroadcasterId() {
    if (this.broadcasterId) return this.broadcasterId;
    const data = await this.request("/users", { login: this.channelName });
    if (data?.data?.[0]) {
      this.broadcasterId = data.data[0].id;
      CONFIG.twitch.broadcasterId = this.broadcasterId;
      return this.broadcasterId;
    }
    return null;
  }

  /** Get recent followers (up to 20) */
  async getFollowers(first = 20) {
    const broadcasterId = await this.resolveBroadcasterId();
    if (!broadcasterId) return [];

    const data = await this.request("/channels/followers", {
      broadcaster_id: broadcasterId,
      first,
    });

    if (!data?.data) return [];

    return data.data.map((f) => ({
      username: f.user_name,
      userId: f.user_id,
      followedAt: new Date(f.followed_at),
    }));
  }

  /** Get recent subscribers (requires broadcaster auth token) */
  async getSubscribers(first = 20) {
    const broadcasterId = await this.resolveBroadcasterId();
    if (!broadcasterId) return [];

    const data = await this.request("/subscriptions", {
      broadcaster_id: broadcasterId,
      first,
    });

    if (!data?.data) return [];

    return data.data.map((s) => ({
      username: s.user_name,
      userId: s.user_id,
      tier: s.tier,
      subscribedAt: new Date(s.created_at),
    }));
  }

  /** Get channel info (title, game, etc.) */
  async getChannelInfo() {
    const broadcasterId = await this.resolveBroadcasterId();
    if (!broadcasterId) return null;

    const data = await this.request("/channels", {
      broadcaster_id: broadcasterId,
    });

    return data?.data?.[0] || null;
  }
}

const twitchAPI = new TwitchAPI(CONFIG);
