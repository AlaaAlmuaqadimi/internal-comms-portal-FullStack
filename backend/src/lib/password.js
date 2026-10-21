import crypto from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../config/env.js';

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: env.argon2.memoryCost,
  timeCost: env.argon2.timeCost,
  parallelism: env.argon2.parallelism,
};

export function hashPassword(password) {
  return argon2.hash(password, argonOptions);
}

export function verifyArgon2(hash, password) {
  return argon2.verify(hash, password);
}

/**
 * Legacy passwords were stored as crypto.scryptSync(password, salt, 64) with a
 * separate 16-byte hex `passwordSalt` (now `scrypt$<saltHex>$<hashHex>`). We
 * cannot rehash them offline, so we verify on login and upgrade to Argon2id.
 *
 * The deleted legacy source didn't reveal whether the salt was fed as raw
 * bytes or as the hex string, so both interpretations are tried.
 */
export async function verifyLegacyScrypt(stored, password) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;

  let expected;
  try {
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const salts = [Buffer.from(saltHex, 'hex'), Buffer.from(saltHex, 'utf8')];
  for (const salt of salts) {
    const derived = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, expected.length, (err, key) =>
        err ? reject(err) : resolve(key)
      );
    });
    if (derived.length === expected.length && crypto.timingSafeEqual(derived, expected)) {
      return true;
    }
  }
  return false;
}

/**
 * Verifies a password against the stored user record and, when the record is a
 * legacy scrypt hash, returns a fresh Argon2id hash so the caller can persist
 * it (transparent upgrade).
 *
 * @returns {Promise<{ ok: boolean, upgradedHash: string | null }>}
 */
export async function verifyPasswordForUser(userRow, password) {
  const hash = userRow.password_hash || '';
  const algo = userRow.password_algo || '';

  const isArgon = algo === 'argon2id' || hash.startsWith('$argon2');
  if (isArgon) {
    return { ok: await verifyArgon2(hash, password), upgradedHash: null };
  }

  if (algo === 'scrypt-legacy' || hash.startsWith('scrypt$')) {
    const ok = await verifyLegacyScrypt(hash, password);
    return { ok, upgradedHash: ok ? await hashPassword(password) : null };
  }

  return { ok: false, upgradedHash: null };
}

// Constant-work Argon2 verification for unknown usernames, to blunt timing
// based account enumeration.
let dummyHashPromise = null;
export async function dummyVerify(password) {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('timing-equalizer', argonOptions);
  }
  try {
    const dummy = await dummyHashPromise;
    await argon2.verify(dummy, password);
  } catch {
    // ignore
  }
}
