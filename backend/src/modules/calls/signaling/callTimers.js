/**
 * In-process timers for the signalling layer.
 *
 *   - ring timers: one per ringing call, fire at `ring_expires_at`;
 *   - grace timers: one per (employee, accepted call) after the employee's
 *     last socket disconnects.
 *
 * The timers only decide *when* to act. The callbacks run the guarded database
 * updates, so a timer that fires after the call already changed state is a
 * harmless no-op.
 *
 * Pure: the timer functions are injectable so tests can drive a fake clock.
 */

const MAX_TIMEOUT_MS = 2_147_483_647;

export function createCallTimers({
  onRingExpired,
  onGraceExpired,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof onRingExpired !== 'function' || typeof onGraceExpired !== 'function') {
    throw new Error('createCallTimers requires onRingExpired and onGraceExpired');
  }

  const ringTimers = new Map();
  const graceTimers = new Map();

  function run(callback, ...args) {
    // A failing callback must never crash the process from a timer.
    Promise.resolve()
      .then(() => callback(...args))
      .catch((err) => {
        console.error('[signaling] timer callback failed:', err?.message || err);
      });
  }

  function unref(handle) {
    if (handle && typeof handle.unref === 'function') handle.unref();
    return handle;
  }

  /** Arms (or re-arms) the ring timer for a call. `expiresAt` is a Date or ms. */
  function armRing(callId, expiresAt) {
    clearRing(callId);
    const at = expiresAt instanceof Date ? expiresAt.getTime() : Number(expiresAt);
    const delay = Math.min(Math.max(0, at - now()), MAX_TIMEOUT_MS);
    const handle = setTimer(() => {
      ringTimers.delete(callId);
      run(onRingExpired, callId);
    }, delay);
    ringTimers.set(callId, unref(handle));
  }

  function clearRing(callId) {
    const handle = ringTimers.get(callId);
    if (handle !== undefined) {
      clearTimer(handle);
      ringTimers.delete(callId);
    }
  }

  function graceKey(employeeId, callId) {
    return `${employeeId}:${callId}`;
  }

  function armGrace(employeeId, callId, graceSeconds) {
    const key = graceKey(employeeId, callId);
    if (graceTimers.has(key)) return;
    const handle = setTimer(() => {
      graceTimers.delete(key);
      run(onGraceExpired, employeeId, callId);
    }, Math.max(0, graceSeconds * 1000));
    graceTimers.set(key, unref(handle));
  }

  /** Cancels every grace timer of one employee (they reconnected). */
  function clearGraceForEmployee(employeeId) {
    const prefix = `${employeeId}:`;
    for (const [key, handle] of graceTimers) {
      if (key.startsWith(prefix)) {
        clearTimer(handle);
        graceTimers.delete(key);
      }
    }
  }

  /** Cancels every grace timer attached to a call (it ended another way). */
  function clearGraceForCall(callId) {
    const suffix = `:${callId}`;
    for (const [key, handle] of graceTimers) {
      if (key.endsWith(suffix)) {
        clearTimer(handle);
        graceTimers.delete(key);
      }
    }
  }

  function clearAll() {
    for (const handle of ringTimers.values()) clearTimer(handle);
    for (const handle of graceTimers.values()) clearTimer(handle);
    ringTimers.clear();
    graceTimers.clear();
  }

  return {
    armRing,
    clearRing,
    armGrace,
    clearGraceForEmployee,
    clearGraceForCall,
    clearAll,
    hasRing: (callId) => ringTimers.has(callId),
    hasGrace: (employeeId, callId) => graceTimers.has(graceKey(employeeId, callId)),
    counts: () => ({ ring: ringTimers.size, grace: graceTimers.size }),
  };
}

export default createCallTimers;
