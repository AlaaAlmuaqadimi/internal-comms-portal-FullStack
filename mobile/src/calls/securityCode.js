/**
 * Call security code (short authentication string).
 *
 * WebRTC always encrypts the audio (DTLS-SRTP), and the keys are created on
 * the two phones. But the phones learn each other's DTLS certificate
 * fingerprint through our signalling server, so whoever controls that server
 * could swap the fingerprints and sit in the middle. The security code lets
 * the two people detect that: both phones derive the same 6 digits from the
 * two fingerprints, and the people read them to each other.
 *
 * A short code alone could be brute-forced by a man in the middle (try many
 * certificates until the two codes match). To stop that, the callee commits to
 * its fingerprint (sends its hash) before the caller reveals its own in the
 * offer. The caller only accepts a commitment received before it sent the
 * offer, and checks it against the fingerprint in the answer. A man in the
 * middle then has to fix both of its fingerprints before seeing ours, so its
 * chance of matching codes is one in a million per call.
 *
 * Pure (no React Native imports): unit tested in Node.
 */

const CODE_PREFIX = 'internal-comms/call-sas/v1';
const COMMIT_PREFIX = 'internal-comms/call-sas-commit/v1';

export const SECURITY_CODE_STATUS = Object.freeze({
  /** Codes can be compared; for the caller the commitment also matched. */
  READY: 'ready',
  /** No code: the other phone sent no commitment (older app) or no fingerprint. */
  UNAVAILABLE: 'unavailable',
  /** The answer does not match the commitment: someone is in the middle. */
  MISMATCH: 'mismatch',
});

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4). Small and dependency-free: Hermes has no crypto.subtle.
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Bytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63)
      );
    }
  }
  return bytes;
}

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** SHA-256 of a string (UTF-8), as 32 bytes. */
export function sha256Bytes(text) {
  const bytes = utf8Bytes(String(text));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push(
    (high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255,
    (low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255
  );

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i += 1) {
    out[i * 4] = h[i] >>> 24;
    out[i * 4 + 1] = (h[i] >>> 16) & 255;
    out[i * 4 + 2] = (h[i] >>> 8) & 255;
    out[i * 4 + 3] = h[i] & 255;
  }
  return out;
}

export function sha256Hex(text) {
  return Array.from(sha256Bytes(text), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Fingerprints, commitment and code
// ---------------------------------------------------------------------------

const FINGERPRINT_LINE = /^a=fingerprint:([A-Za-z0-9-]+)[ \t]+([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2})+)[ \t]*$/m;

/**
 * The DTLS certificate fingerprint of an SDP blob, normalised
 * ("sha-256 AB:CD:..."), or null when there is none.
 */
export function extractFingerprint(sdp) {
  if (typeof sdp !== 'string') return null;
  const match = FINGERPRINT_LINE.exec(sdp);
  if (!match) return null;
  return `${match[1].toLowerCase()} ${match[2].toUpperCase()}`;
}

/** What the callee sends before the offer: the hash of its own fingerprint. */
export function commitmentFor(callId, fingerprint) {
  return sha256Hex(`${COMMIT_PREFIX}|${callId}|${fingerprint}`);
}

const COMMITMENT_SHAPE = /^[0-9a-f]{64}$/;

export function isCommitment(value) {
  return typeof value === 'string' && COMMITMENT_SHAPE.test(value);
}

/**
 * The 6-digit code both phones show. Always offer fingerprint first, then the
 * answer fingerprint, so the caller and the callee compute the same value.
 */
export function securityCodeFor(callId, offerFingerprint, answerFingerprint) {
  const digest = sha256Bytes(`${CODE_PREFIX}|${callId}|${offerFingerprint}|${answerFingerprint}`);
  const value = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  return String(value % 1_000_000).padStart(6, '0');
}

/** "482913" -> "482 913" (easier to read aloud). */
export function formatSecurityCode(code) {
  return typeof code === 'string' && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : '';
}
