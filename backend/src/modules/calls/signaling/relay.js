/**
 * Pure validation and filtering for relayed WebRTC signals.
 *
 * No socket.io, database or env import: the whole module is unit tested by
 * `scripts/call-signaling-test.js`.
 *
 * The server never stores or logs these payloads. It only checks their shape
 * and size and, for relay-only (leadership) calls, removes every ICE candidate
 * that is not a TURN relay candidate. The client's `iceTransportPolicy` setting
 * is not trusted on its own.
 *
 * `sas` carries the callee's security-code commitment (a SHA-256 hex hash of
 * its DTLS fingerprint, see mobile/src/calls/securityCode.js). The server only
 * checks its shape; it cannot learn or change the code from it.
 */

export const SIGNAL_KINDS = Object.freeze(['offer', 'answer', 'ice', 'sas']);

const COMMITMENT = /^[0-9a-f]{64}$/;

export const SIGNAL_LIMITS = Object.freeze({
  sdpMaxBytes: 16 * 1024,
  candidateMaxBytes: 2 * 1024,
  sdpMidMaxLength: 64,
});

export const SIGNAL_ERROR_CODES = Object.freeze({
  INVALID_SIGNAL: 'CALL_SIGNAL_INVALID',
  SIGNAL_TOO_LARGE: 'CALL_SIGNAL_TOO_LARGE',
});

const RELAY_TYP = /\btyp\s+relay\b/i;
const CANDIDATE_LINE = /^a=candidate:/i;

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function invalid(code = SIGNAL_ERROR_CODES.INVALID_SIGNAL) {
  return Object.freeze({ ok: false, code });
}

function accepted(data) {
  return Object.freeze({ ok: true, drop: false, data });
}

function dropped() {
  return Object.freeze({ ok: true, drop: true, data: null });
}

/** True when an ICE candidate string is a TURN relay candidate. */
export function isRelayCandidate(candidate) {
  return typeof candidate === 'string' && RELAY_TYP.test(candidate);
}

/**
 * Removes every non-relay `a=candidate:` line from an SDP blob. Other lines,
 * including the line endings used by the sender, are left untouched.
 */
export function filterSdpForRelay(sdp) {
  if (typeof sdp !== 'string') return sdp;
  const newline = sdp.includes('\r\n') ? '\r\n' : '\n';
  return sdp
    .split(/\r?\n/)
    .filter((line) => !CANDIDATE_LINE.test(line) || RELAY_TYP.test(line))
    .join(newline);
}

function sanitizeDescription(kind, data, relayOnly) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid();
  if (data.type !== kind) return invalid();
  if (typeof data.sdp !== 'string' || data.sdp.length === 0) return invalid();
  if (byteLength(data.sdp) > SIGNAL_LIMITS.sdpMaxBytes) {
    return invalid(SIGNAL_ERROR_CODES.SIGNAL_TOO_LARGE);
  }

  const sdp = relayOnly ? filterSdpForRelay(data.sdp) : data.sdp;
  // Only the two standard fields are forwarded; anything else is dropped so a
  // client cannot smuggle extra data to the other participant.
  return accepted({ type: kind, sdp });
}

function sanitizeCandidate(data, relayOnly) {
  // `null` (or an empty candidate) is the standard end-of-candidates marker.
  if (data === null) return accepted(null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid();

  const { candidate, sdpMid = null, sdpMLineIndex = null } = data;
  if (typeof candidate !== 'string') return invalid();
  if (byteLength(candidate) > SIGNAL_LIMITS.candidateMaxBytes) {
    return invalid(SIGNAL_ERROR_CODES.SIGNAL_TOO_LARGE);
  }
  if (sdpMid !== null && (typeof sdpMid !== 'string' || sdpMid.length > SIGNAL_LIMITS.sdpMidMaxLength)) {
    return invalid();
  }
  if (
    sdpMLineIndex !== null &&
    (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 64)
  ) {
    return invalid();
  }

  if (candidate === '') return accepted({ candidate: '', sdpMid, sdpMLineIndex });
  if (relayOnly && !isRelayCandidate(candidate)) return dropped();

  return accepted({ candidate, sdpMid, sdpMLineIndex });
}

function sanitizeCommitment(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid();
  if (typeof data.commit !== 'string' || !COMMITMENT.test(data.commit)) return invalid();
  return accepted({ commit: data.commit });
}

/**
 * Validates one signal and returns what may be forwarded.
 *
 * @param {'offer'|'answer'|'ice'|'sas'} kind
 * @param {unknown} data   The client payload
 * @param {{relayOnly?: boolean}} [options]
 * @returns {{ok: true, drop: boolean, data: object|null} | {ok: false, code: string}}
 *   `drop: true` means the signal is valid but must not be forwarded (a
 *   non-relay candidate on a relay-only call).
 */
export function sanitizeSignal(kind, data, { relayOnly = false } = {}) {
  if (!SIGNAL_KINDS.includes(kind)) return invalid();
  if (kind === 'ice') return sanitizeCandidate(data, relayOnly);
  if (kind === 'sas') return sanitizeCommitment(data);
  return sanitizeDescription(kind, data, relayOnly);
}

/**
 * Who may send which signal. The caller offers, the callee answers; only the
 * callee commits to its fingerprint (before the offer).
 */
export function canSendSignal(kind, role) {
  if (kind === 'offer') return role === 'caller';
  if (kind === 'answer') return role === 'callee';
  if (kind === 'sas') return role === 'callee';
  if (kind === 'ice') return role === 'caller' || role === 'callee';
  return false;
}

export default sanitizeSignal;
