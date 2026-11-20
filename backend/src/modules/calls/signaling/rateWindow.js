/**
 * Fixed-window in-memory rate limiter for socket events.
 *
 * express-rate-limit only covers HTTP routes, so socket invites need their own
 * per-user limit with the same numbers as the REST invite
 * (`CALL_INVITE_RATE_WINDOW_MINUTES` / `CALL_INVITE_RATE_MAX`).
 *
 * Pure: the clock is injectable for tests.
 */
export function createRateWindow({ windowMs, max, now = Date.now, maxKeys = 50_000 } = {}) {
  if (!(windowMs > 0) || !(max > 0)) {
    throw new Error('createRateWindow requires positive windowMs and max');
  }

  const windows = new Map();

  function prune(current) {
    for (const [key, entry] of windows) {
      if (current - entry.start >= windowMs) windows.delete(key);
    }
  }

  /** Returns true when the event is allowed and counts it. */
  function hit(key) {
    const current = now();
    let entry = windows.get(key);
    if (!entry || current - entry.start >= windowMs) {
      if (windows.size >= maxKeys) prune(current);
      entry = { start: current, count: 0 };
      windows.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= max;
  }

  return { hit, reset: (key) => windows.delete(key), size: () => windows.size };
}

export default createRateWindow;
