/**
 * Access-token refresh for the API client.
 *
 * The server rotates refresh tokens and treats a second use of an old token as
 * theft (the whole token family is revoked). So the client must never send two
 * refreshes with the same token: one refresh at a time, and every request that
 * hit a 401 while it was running waits for it and retries once.
 *
 * Pure (no React Native imports) so it can be unit tested in Node.
 */

/** 401 codes that mean "the access token is no longer valid; try refreshing". */
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHORIZED']);

export function isRefreshableAuthError(error) {
  return error?.status === 401 && REFRESHABLE_CODES.has(error?.code);
}

/** The server rejected the refresh token itself: the session is over. */
function isSessionRejected(error) {
  return error?.status === 401 || error?.status === 400;
}

/**
 * Single-flight refresh.
 *
 * @param {object} deps
 * @param {(refreshToken: string) => Promise<{accessToken: string, refreshToken: string, user?: object}>} deps.callRefresh
 * @param {(result: object) => Promise<void>|void} deps.onRefreshed  Store the new tokens (memory first, then disk)
 * @param {() => string|null} deps.getRefreshToken
 * @returns {() => Promise<boolean>} true = refreshed; false = session rejected.
 *   Network errors, timeouts, 429 and 5xx are thrown: the session is kept.
 */
export function createRefresher({ callRefresh, onRefreshed, getRefreshToken }) {
  let inFlight = null;

  async function run() {
    const token = getRefreshToken();
    if (!token) return false;
    let result;
    try {
      result = await callRefresh(token);
    } catch (error) {
      if (isSessionRejected(error)) return false;
      throw error;
    }
    if (!result?.accessToken || !result?.refreshToken) return false;
    await onRefreshed(result);
    return true;
  }

  return function refresh() {
    if (!inFlight) {
      inFlight = run().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

/**
 * Wraps the low-level request with "refresh once and retry".
 *
 * @param {object} deps
 * @param {(endpoint: string, options: object) => Promise<any>} deps.rawRequest  Throws errors with status/code
 * @param {() => string|null} deps.getAccessToken
 * @param {() => string|null} deps.getRefreshToken
 * @param {() => Promise<boolean>} deps.refresh  From createRefresher
 * @param {() => void} deps.onUnauthorized  Signs the user out
 */
export function createAuthedRequest({
  rawRequest,
  getAccessToken,
  getRefreshToken,
  refresh,
  onUnauthorized,
}) {
  const signOut = () => {
    try {
      onUnauthorized?.();
    } catch {
      // never let sign-out break the caller's error handling
    }
  };

  return async function request(endpoint, options = {}) {
    const usesAuth = options.auth !== false;
    const tokenUsed = getAccessToken();

    try {
      return await rawRequest(endpoint, options);
    } catch (error) {
      if (!usesAuth || error?.status !== 401) throw error;

      if (!isRefreshableAuthError(error) || !getRefreshToken()) {
        signOut();
        throw error;
      }

      // Another request refreshed while this one was in flight: just retry.
      const current = getAccessToken();
      if (!(current && current !== tokenUsed)) {
        const refreshed = await refresh(); // network errors propagate, session kept
        if (!refreshed) {
          signOut();
          throw error;
        }
      }

      try {
        return await rawRequest(endpoint, options);
      } catch (retryError) {
        if (retryError?.status === 401) signOut();
        throw retryError;
      }
    }
  };
}
