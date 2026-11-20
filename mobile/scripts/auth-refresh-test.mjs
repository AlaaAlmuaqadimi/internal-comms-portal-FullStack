/**
 * Access-token refresh tests (no device, no network).
 *
 *   npm run test:auth --prefix mobile
 *
 * Covers: refresh once and retry, one refresh for many concurrent 401s (the
 * server revokes the session on refresh-token reuse), sign-out only when the
 * server rejects the session, and no sign-out on network errors / 429 / 5xx.
 */
import assert from 'node:assert/strict';
import {
  createAuthedRequest,
  createRefresher,
  isRefreshableAuthError,
} from '../src/services/authRefresh.js';

let passed = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise((resolve) => setImmediate(resolve));

const httpError = (status, code) => Object.assign(new Error(code), { status, code });

/**
 * Fake server: access tokens "a1", "a2"...; refresh tokens "r1", "r2"...
 * A refresh token can be used once; a second use is "reuse".
 */
function setup({ refreshFails = null, refreshDelay = 0, retryStill401 = false } = {}) {
  const state = {
    access: 'a1',
    refresh: 'r1',
    serverAccess: 'a1',
    usedRefresh: new Set(),
    refreshCalls: 0,
    reuse: 0,
    signOuts: 0,
    saved: [],
    requests: [],
  };

  const rawRequest = async (endpoint, options = {}) => {
    state.requests.push([endpoint, options.auth !== false ? state.access : null]);
    if (options.auth === false) return { data: { ok: true } };
    if (retryStill401 && state.access !== 'a1') throw httpError(401, 'UNAUTHORIZED');
    if (state.access !== state.serverAccess) throw httpError(401, 'TOKEN_EXPIRED');
    return { data: { endpoint } };
  };

  const callRefresh = async (token) => {
    state.refreshCalls += 1;
    if (refreshDelay) await new Promise((resolve) => setTimeout(resolve, refreshDelay));
    if (refreshFails) throw refreshFails;
    if (state.usedRefresh.has(token)) {
      state.reuse += 1;
      throw httpError(401, 'REFRESH_REUSED');
    }
    state.usedRefresh.add(token);
    const n = state.refreshCalls + 1;
    state.serverAccess = `a${n}`;
    return { accessToken: `a${n}`, refreshToken: `r${n}`, user: { id: 'u1' } };
  };

  const refresh = createRefresher({
    getRefreshToken: () => state.refresh,
    callRefresh,
    onRefreshed: async (result) => {
      state.access = result.accessToken;
      state.refresh = result.refreshToken;
      state.saved.push(result);
    },
  });

  const request = createAuthedRequest({
    rawRequest,
    getAccessToken: () => state.access,
    getRefreshToken: () => state.refresh,
    refresh,
    onUnauthorized: () => {
      state.signOuts += 1;
    },
  });

  // Simulate ACCESS_TOKEN_TTL passing on the server.
  const expire = () => {
    state.serverAccess = 'expired';
  };

  return { state, request, refresh, expire };
}

check('a valid token never refreshes', async () => {
  const { state, request } = setup();
  const res = await request('/api/me');
  assert.deepEqual(res, { data: { endpoint: '/api/me' } });
  assert.equal(state.refreshCalls, 0);
});

check('expired access token: refresh once, retry, save the rotated pair', async () => {
  const { state, request, expire } = setup();
  expire();
  const res = await request('/api/me');
  assert.deepEqual(res, { data: { endpoint: '/api/me' } });
  assert.equal(state.refreshCalls, 1);
  assert.equal(state.access, 'a2');
  assert.equal(state.refresh, 'r2');
  assert.equal(state.saved.length, 1);
  assert.equal(state.signOuts, 0);
});

check('five concurrent 401s share ONE refresh (no reuse, no sign-out)', async () => {
  const { state, request, expire } = setup({ refreshDelay: 5 });
  expire();
  const results = await Promise.all(
    ['/a', '/b', '/c', '/d', '/e'].map((endpoint) => request(endpoint))
  );
  assert.equal(results.length, 5);
  assert.equal(state.refreshCalls, 1);
  assert.equal(state.reuse, 0);
  assert.equal(state.signOuts, 0);
});

check('a 401 that arrives after another request already refreshed just retries', async () => {
  const { state, request, refresh, expire } = setup();
  expire();
  // Request leaves with a1; meanwhile something else refreshes to a2.
  const pending = request('/slow');
  await refresh();
  await pending;
  assert.equal(state.refreshCalls, 1);
  assert.equal(state.reuse, 0);
});

check('refresh token rejected by the server: sign out once', async () => {
  const { state, request, expire } = setup({ refreshFails: httpError(401, 'REFRESH_REUSED') });
  expire();
  await assert.rejects(request('/api/me'), (err) => err.status === 401);
  assert.equal(state.signOuts, 1);
});

check('network error during refresh: keep the session, no sign-out', async () => {
  const { state, request, expire } = setup({ refreshFails: httpError(0, 'NETWORK') });
  expire();
  await assert.rejects(request('/api/me'), (err) => err.code === 'NETWORK');
  assert.equal(state.signOuts, 0);
  assert.equal(state.refresh, 'r1', 'the refresh token is kept for the next try');
});

check('429 or 500 during refresh: keep the session', async () => {
  for (const error of [httpError(429, 'RATE_LIMITED'), httpError(500, 'INTERNAL')]) {
    const { state, request, expire } = setup({ refreshFails: error });
    expire();
    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(request('/api/me'), (err) => err.status === error.status);
    assert.equal(state.signOuts, 0);
  }
});

check('a refresh can be retried after a network failure', async () => {
  let fail = true;
  const state = { refresh: 'r1', calls: 0 };
  const refresh = createRefresher({
    getRefreshToken: () => state.refresh,
    callRefresh: async () => {
      state.calls += 1;
      if (fail) throw httpError(0, 'NETWORK');
      return { accessToken: 'a2', refreshToken: 'r2' };
    },
    onRefreshed: (result) => {
      state.refresh = result.refreshToken;
    },
  });
  await assert.rejects(refresh());
  fail = false;
  assert.equal(await refresh(), true);
  assert.equal(state.refresh, 'r2');
  assert.equal(state.calls, 2);
});

check('still 401 after a successful refresh: sign out, no loop', async () => {
  const { state, request, expire } = setup({ retryStill401: true });
  expire();
  await assert.rejects(request('/api/me'), (err) => err.status === 401);
  assert.equal(state.refreshCalls, 1);
  assert.equal(state.signOuts, 1);
});

check('no refresh token stored: sign out without calling the server', async () => {
  const { state, request, expire } = setup();
  state.refresh = null;
  expire();
  await assert.rejects(request('/api/me'));
  assert.equal(state.refreshCalls, 0);
  assert.equal(state.signOuts, 1);
});

check('unauthenticated calls (login) never refresh or sign out', async () => {
  let signOuts = 0;
  let refreshes = 0;
  const request = createAuthedRequest({
    rawRequest: async () => {
      throw httpError(401, 'INVALID_CREDENTIALS');
    },
    getAccessToken: () => null,
    getRefreshToken: () => 'r1',
    refresh: async () => {
      refreshes += 1;
      return true;
    },
    onUnauthorized: () => {
      signOuts += 1;
    },
  });
  await assert.rejects(request('/api/auth/login', { auth: false }));
  assert.equal(refreshes, 0);
  assert.equal(signOuts, 0);
});

check('403 and other errors pass through untouched', async () => {
  const { state } = setup();
  const request = createAuthedRequest({
    rawRequest: async () => {
      throw httpError(403, 'FORBIDDEN');
    },
    getAccessToken: () => 'a1',
    getRefreshToken: () => 'r1',
    refresh: async () => {
      state.refreshCalls += 1;
      return true;
    },
    onUnauthorized: () => {
      state.signOuts += 1;
    },
  });
  await assert.rejects(request('/x'), (err) => err.status === 403);
  assert.equal(state.refreshCalls, 0);
  assert.equal(state.signOuts, 0);
});

check('only TOKEN_EXPIRED / UNAUTHORIZED 401s are refreshable', () => {
  assert.equal(isRefreshableAuthError(httpError(401, 'TOKEN_EXPIRED')), true);
  assert.equal(isRefreshableAuthError(httpError(401, 'UNAUTHORIZED')), true);
  assert.equal(isRefreshableAuthError(httpError(401, 'REFRESH_REUSED')), false);
  assert.equal(isRefreshableAuthError(httpError(403, 'TOKEN_EXPIRED')), false);
});

for (const [name, fn] of tests) {
  try {
    // eslint-disable-next-line no-await-in-loop
    await fn();
    await tick();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log(`\n[test:auth] ${passed} checks passed`);
