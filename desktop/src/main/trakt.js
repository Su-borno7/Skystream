'use strict';
/**
 * Trakt.tv sync — device-code sign-in + scrobble reporting.
 *
 * The app ships WITHOUT baked-in Trakt credentials: each user registers a
 * free Trakt API app (https://trakt.tv/oauth/applications) and pastes its
 * Client ID / Secret into Settings → Explore & tracking. The device flow is
 * used so no redirect/browser hand-off is needed — the same public-client
 * approach akashdh11's Cinelab uses.
 *
 * Access tokens live in the secrets store, never in the renderer-facing
 * settings payload. Refresh is automatic (Trakt access tokens last ~3
 * months; refresh tokens rotate).
 */
const { postJson, fetchJson } = require('./http');
const tmdb = require('./tmdb');

const BASE = 'https://api.trakt.tv';
const TOKEN_KEY = 'traktOauth';
const PROFILE_KEY = 'traktProfile';

function getCredentials(state) {
  const s = state?.getSettings() || {};
  const clientId = String(s.traktClientId || '').trim();
  const clientSecret = String(s.traktClientSecret || '').trim();
  return { clientId, clientSecret, configured: !!(clientId && clientSecret) };
}

function isExpired(tokens) {
  return !tokens || !tokens.expiresAt || Date.now() > tokens.expiresAt - 60 * 1000;
}

async function fetchProfile(state, accessToken) {
  const { clientId } = getCredentials(state);
  const data = await fetchJson(`${BASE}/users/settings`, {
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = data?.user || {};
  return { username: user.username || null, name: user.name || user.username || null, vip: !!user.vip };
}

function status(state) {
  const { configured } = getCredentials(state);
  const tokens = state.getSecret(TOKEN_KEY, null);
  const profile = state.getSecret(PROFILE_KEY, null);
  return {
    configured,
    signedIn: !!(configured && tokens && tokens.access_token),
    user: profile && profile.username ? profile : null,
  };
}

function saveTokens(state, tokenResponse) {
  const created = Number(tokenResponse.created_at || Math.floor(Date.now() / 1000));
  const expiresIn = Number(tokenResponse.expires_in || 7200);
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    scope: tokenResponse.scope || 'public',
    createdAt: created * 1000,
    expiresAt: created * 1000 + expiresIn * 1000,
  };
  state.setSecret(TOKEN_KEY, tokens);
  return tokens;
}

/**
 * Step 1 of device sign-in. Returns the user code + where to enter it, and
 * begins background polling (events surface via onChange / trakt:changed).
 */
async function beginDeviceSignIn(state, { onChanged } = {}) {
  const { clientId, clientSecret, configured } = getCredentials(state);
  if (!configured) {
    const err = new Error('Trakt is not configured — add your Client ID and Secret in Settings → Explore & tracking.');
    err.code = 'TRAKT_NOT_CONFIGURED';
    throw err;
  }
  const { status: httpStatus, data } = await postJson(`${BASE}/oauth/device/code`, { client_id: clientId });
  if (httpStatus !== 200 || !data?.device_code) {
    throw new Error(`Trakt device code request failed (HTTP ${httpStatus})`);
  }
  // Poll in the background; the renderer gets the code immediately.
  pollForToken(state, { deviceCode: data.device_code, interval: Number(data.interval || 5), expiresIn: Number(data.expires_in || 600), clientId, clientSecret, onChanged })
    .catch(() => { /* polling errors surface via onChanged({error}) */ });
  return {
    userCode: data.user_code,
    verificationUrl: data.verification_url || 'https://trakt.tv/activate',
    expiresIn: Number(data.expires_in || 600),
    interval: Number(data.interval || 5),
  };
}

async function pollForToken(state, { deviceCode, interval, expiresIn, clientId, clientSecret, onChanged }) {
  const deadline = Date.now() + expiresIn * 1000;
  let waitMs = Math.max(1, interval) * 1000;
  for (;;) {
    if (Date.now() > deadline) {
      onChanged?.({ signedIn: false, error: 'Device code expired — please try again.' });
      return;
    }
    await new Promise((r) => setTimeout(r, waitMs));
    let res;
    try {
      res = await postJson(`${BASE}/oauth/device/token`,
        { code: deviceCode, client_id: clientId, client_secret: clientSecret },
        { acceptedStatuses: [400, 404, 409, 410, 418, 429] });
    } catch {
      onChanged?.({ signedIn: false, error: 'Network error while contacting Trakt.' });
      return;
    }
    if (res.status === 200 && res.data?.access_token) {
      saveTokens(state, res.data);
      let profile = null;
      try {
        profile = await fetchProfile(state, res.data.access_token);
        state.setSecret(PROFILE_KEY, profile);
      } catch { /* profile is a nicety; tokens are what matter */ }
      onChanged?.({ signedIn: true, user: profile });
      return;
    }
    const code = String(res.data?.error || '');
    if (code === 'authorization_pending') continue;
    if (code === 'slow_down') { waitMs += 5000; continue; }
    if (code === 'expired_token') { onChanged?.({ signedIn: false, error: 'Device code expired — please try again.' }); return; }
    if (code === 'denied') { onChanged?.({ signedIn: false, error: 'Authorization was denied on Trakt.' }); return; }
    if (res.status === 404 || code === 'invalid_device_code') { onChanged?.({ signedIn: false, error: 'Invalid device code.' }); return; }
    if (res.status === 429) { waitMs += 10000; continue; }
    onChanged?.({ signedIn: false, error: `Trakt authorization failed (${code || res.status}).` });
    return;
  }
}

/** Fresh access token, refreshing if needed. null when signed out / refresh fails. */
async function freshAccessToken(state) {
  const { clientId, clientSecret, configured } = getCredentials(state);
  if (!configured) return null;
  const tokens = state.getSecret(TOKEN_KEY, null);
  if (!tokens?.access_token) return null;
  if (!isExpired(tokens)) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  try {
    const { status: httpStatus, data } = await postJson(`${BASE}/oauth/token`, {
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', // ignored by Trakt for device tokens; required-shaped
    });
    if (httpStatus === 200 && data?.access_token) {
      return saveTokens(state, data).access_token;
    }
  } catch { /* fall through */ }
  state.deleteSecret(TOKEN_KEY);
  return null;
}

async function signOut(state) {
  const { clientId, clientSecret } = getCredentials(state);
  const tokens = state.getSecret(TOKEN_KEY, null);
  if (tokens?.access_token && clientId && clientSecret) {
    try {
      await postJson(`${BASE}/oauth/revoke`, { token: tokens.access_token, client_id: clientId, client_secret: clientSecret }, { acceptedStatuses: [400, 404] });
    } catch { /* best effort — local sign-out proceeds regardless */ }
  }
  state.deleteSecret(TOKEN_KEY);
  state.deleteSecret(PROFILE_KEY);
}

function traktIds(match) {
  const ids = {};
  if (match.imdbId) ids.imdb = match.imdbId;
  if (match.id) ids.tmdb = match.id;
  return ids;
}

/**
 * Report a finished movie or episode to Trakt (scrobble/stop).
 * Best-effort: resolves the title to TMDB ids via the user's TMDB key.
 * Returns { scrobbled: boolean, reason?: string }.
 */
async function scrobbleStop(state, { title, mediaType, season, episode, runtimeMinutes } = {}) {
  const tokens = await freshAccessToken(state);
  if (!tokens) return { scrobbled: false, reason: 'not-signed-in' };
  const { clientId } = getCredentials(state);

  let match = null;
  try {
    match = await tmdb.bestMatch(state, { title });
  } catch {
    return { scrobbled: false, reason: 'tmdb-unavailable' };
  }
  if (!match || (!match.imdbId && !match.id)) return { scrobbled: false, reason: 'unresolved-title' };

  const isEpisode = episode != null && Number.isFinite(+episode) && +episode > 0;
  const body = isEpisode
    ? {
        show: { ids: traktIds(match) },
        episode: { season: Number.isFinite(+season) && +season > 0 ? Math.floor(+season) : 1, number: Math.floor(+episode) },
        progress: 100,
      }
    : {
        movie: { ids: traktIds(match) },
        progress: 100,
      };

  const { status: httpStatus } = await postJson(`${BASE}/scrobble/stop`, body, {
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId,
      Authorization: `Bearer ${tokens}`,
    },
    acceptedStatuses: [409], // 409 = already fully scrobbled at 100% — treat as success
  });
  if (httpStatus === 200 || httpStatus === 201 || httpStatus === 409) {
    const result = { scrobbled: true, resolved: { name: match.name, mediaType: match.mediaType, tmdbId: match.id } };
    if (runtimeMinutes) result.runtimeMinutes = runtimeMinutes;
    return result;
  }
  return { scrobbled: false, reason: `http-${httpStatus}` };
}

module.exports = {
  status,
  beginDeviceSignIn,
  signOut,
  scrobbleStop,
  // Exported for tests.
  _internal: { isExpired, saveTokens, freshAccessToken, TOKEN_KEY, PROFILE_KEY },
};
