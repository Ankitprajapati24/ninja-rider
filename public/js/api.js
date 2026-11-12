// Talks to the portfolio's /api. Every call fails soft so the game stays playable
// when the backend is missing (opened on its own) or unreachable.
const PLAYER_KEY = 'ninjaRider.player';
const BASE = '/api';

function loadPlayer() {
  try {
    const value = JSON.parse(localStorage.getItem(PLAYER_KEY));
    return value && typeof value.name === 'string' ? value : null;
  } catch {
    return null;
  }
}

function referrerHost() {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    return url.host === location.host ? null : url.host;
  } catch {
    return null;
  }
}

export function createApi() {
  let player = loadPlayer(); // { name, playerId?, token? }
  let online = null;          // unknown until the first call answers

  function save(value) {
    player = value;
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify(value)); } catch { /* not remembered */ }
  }

  async function call(path, body) {
    const headers = { 'content-type': 'application/json' };
    if (player?.token) headers['x-player-token'] = player.token;
    let response;
    try {
      response = await fetch(BASE + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      online = false;
      throw Object.assign(new Error('No connection to the game server.'), { status: 0 });
    }
    const data = await response.json().catch(() => null);
    // anything that is not our JSON API (a static host's 404 page, say) means there is no backend
    online = data !== null;
    if (!response.ok || data === null) {
      throw Object.assign(new Error(data?.error ?? `Request failed (${response.status})`), { status: data ? response.status : 0 });
    }
    return data;
  }

  async function register(name) {
    try {
      const data = await call('/player', { name, playerId: player?.playerId });
      save({ name: data.name, playerId: data.playerId, token: data.token ?? player?.token });
      return { ok: true };
    } catch (err) {
      // the server refused the name itself: show why
      if (err.status === 400) return { ok: false, error: err.message };
      save({ ...player, name });
      return { ok: true, offline: true };
    }
  }

  return {
    get player() { return player; },
    get online() { return online; },
    register,

    visit() {
      call('/visit', { playerId: player?.playerId ?? null, referrer: referrerHost() }).catch(() => {});
    },

    async leaderboard() {
      try { return (await call('/leaderboard')).leaderboard; } catch { return null; }
    },

    // Returns the server's id for this round, or null when it is played offline.
    async startRound() {
      if (!player?.playerId) return null;
      try {
        return (await call('/play/start', { playerId: player.playerId })).playId;
      } catch (err) {
        // the player was removed on the server: sign up again under the same name and retry once
        if (err.status !== 401) return null;
        save({ name: player.name });
        const again = await register(player.name);
        if (!again.ok || !player.playerId) return null;
        try { return (await call('/play/start', { playerId: player.playerId })).playId; } catch { return null; }
      }
    },

    // result: { score, duration, targets, gold, hurdles, orbs, bestCombo }
    async finishRound(playId, result) {
      if (!playId || !player?.playerId) return null;
      try {
        return await call('/play/finish', { playerId: player.playerId, playId, ...result });
      } catch {
        return null;
      }
    },

    async feedback(rating, message, playId) {
      if (!player?.playerId) return { ok: false, error: 'Feedback needs a connection to the game server.' };
      try {
        await call('/feedback', { playerId: player.playerId, playId: playId ?? null, rating, message });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.status ? err.message : 'Could not send feedback. Check your connection and try again.' };
      }
    },
  };
}
