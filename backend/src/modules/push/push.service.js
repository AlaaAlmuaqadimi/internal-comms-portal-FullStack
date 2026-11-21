/**
 * Push tokens and sending (Phase D).
 *
 * Off unless PUSH_ENABLED=true. Android phones get FCM data messages (needs
 * FCM_SERVICE_ACCOUNT_FILE); iPhones get APNs VoIP pushes (needs APNS_KEY_ID,
 * APNS_TEAM_ID and the .p8 key in APNS_KEY_FILE). Each half works without the
 * other. Registering tokens always works (so phones are ready when push is
 * turned on); sending is a no-op for a half that is not configured.
 *
 * Both credential files are secrets: keep them on the server only (the
 * default location `backend/secrets/` is git-ignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { createApnsClient, parseApnsKey } from './apns.js';
import { createFcmClient, parseServiceAccount } from './fcm.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// A user rarely has more phones than this; older tokens are dropped.
export const MAX_TOKENS_PER_EMPLOYEE = 5;

// Provider per platform: the app reports APNS_VOIP tokens on iPhone, FCM on Android.
export const PROVIDER_BY_PLATFORM = { android: 'fcm', ios: 'apns_voip' };

const resolveFile = (file) => (path.isAbsolute(file) ? file : path.resolve(backendRoot, file));

let fcmClient = null;
let fcmLoaded = false;
let apnsClient = null;
let apnsLoaded = false;

function loadFcm() {
  if (fcmLoaded) return fcmClient;
  fcmLoaded = true;
  if (!env.push.enabled) return null;
  try {
    const account = parseServiceAccount(fs.readFileSync(resolveFile(env.push.serviceAccountFile), 'utf8'));
    fcmClient = createFcmClient({ serviceAccount: account });
    const { projectId } = account; // not a secret
    console.log(`[push] FCM enabled for project ${projectId}`);
  } catch (err) {
    // Never print the file contents; the message names only missing fields.
    console.error('[push] Android off: cannot load the FCM service account:', err?.message || err);
    fcmClient = null;
  }
  return fcmClient;
}

function loadApns() {
  if (apnsLoaded) return apnsClient;
  apnsLoaded = true;
  const cfg = env.push.apns;
  if (!env.push.enabled || !cfg.keyId || !cfg.teamId) return null; // iPhone not set up yet
  try {
    const credentials = parseApnsKey({
      keyPem: fs.readFileSync(resolveFile(cfg.keyFile), 'utf8'),
      keyId: cfg.keyId,
      teamId: cfg.teamId,
    });
    apnsClient = createApnsClient({ credentials, bundleId: cfg.bundleId, production: cfg.production });
    // Topic and host are not secrets.
    console.log(`[push] APNs VoIP enabled: ${apnsClient.topic} (${cfg.production ? 'production' : 'sandbox'})`);
  } catch (err) {
    console.error('[push] iPhone off: cannot load the APNs key:', err?.message || err);
    apnsClient = null;
  }
  return apnsClient;
}

export function isPushEnabled() {
  return Boolean(loadFcm() || loadApns());
}

/** Saves (or moves to this user) the token of the phone that is signed in. */
export async function registerPushToken(user, { token, platform }) {
  if (!user?.id || !user?.employeeId) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, 'لا يوجد موظف مرتبط بهذا الحساب.');
  }
  // A phone that changes hands moves to the new user.
  await pool.execute(
    `INSERT INTO push_tokens (user_id, employee_id, provider, platform, token, last_seen_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       employee_id = VALUES(employee_id),
       provider = VALUES(provider),
       platform = VALUES(platform),
       last_seen_at = UTC_TIMESTAMP(3)`,
    [user.id, user.employeeId, PROVIDER_BY_PLATFORM[platform] || 'fcm', platform, token]
  );
  // Keep only the most recent phones of this employee.
  await pool.execute(
    `DELETE FROM push_tokens
      WHERE employee_id = ?
        AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM push_tokens
             WHERE employee_id = ?
             ORDER BY last_seen_at DESC
             LIMIT ${MAX_TOKENS_PER_EMPLOYEE}
          ) AS keep_rows
        )`,
    [user.employeeId, user.employeeId]
  );
  return { registered: true };
}

/** Removes this phone's token (sign-out). Only the owner can remove it. */
export async function unregisterPushToken(user, token) {
  if (!user?.id) return { removed: 0 };
  const [result] = await pool.execute('DELETE FROM push_tokens WHERE token = ? AND user_id = ?', [
    token,
    user.id,
  ]);
  return { removed: result?.affectedRows ?? 0 };
}

/**
 * Sends one push to every phone of an employee: `data` to Android (FCM),
 * `apns` to iPhones (APNs VoIP; ring pushes only, so stop pushes skip
 * iPhones). Deletes tokens the provider reports as gone. Never throws: a push
 * failure must not break a call.
 */
export async function sendToEmployee(employeeId, data, { ttlSeconds = 60, excludeTokens = [], apns = null } = {}) {
  const fcm = loadFcm();
  const voip = apns ? loadApns() : null;
  if ((!fcm && !voip) || !employeeId) return { sent: 0, failed: 0, removed: 0 };
  try {
    const [allRows] = await pool.execute(
      'SELECT id, token, provider FROM push_tokens WHERE employee_id = ?',
      [employeeId]
    );
    const excluded = new Set(excludeTokens.filter(Boolean));
    const sendOne = (row) => {
      if (row.provider === 'apns_voip') return voip ? voip.send({ token: row.token, payload: apns, ttlSeconds }) : null;
      return fcm ? fcm.send({ token: row.token, data, ttlSeconds }) : null;
    };
    const rows = [];
    const sends = [];
    for (const row of allRows) {
      if (excluded.has(row.token)) continue;
      const pending = sendOne(row);
      if (!pending) continue; // no sender for this phone (or a stop push to an iPhone)
      rows.push(row);
      sends.push(Promise.resolve(pending).catch(() => ({ ok: false, unregistered: false })));
    }
    if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };

    const results = await Promise.all(sends);

    const gone = rows.filter((_row, i) => results[i]?.unregistered).map((row) => row.id);
    if (gone.length > 0) {
      await pool.execute(
        `DELETE FROM push_tokens WHERE id IN (${gone.map(() => '?').join(', ')})`,
        gone
      );
    }
    const sent = results.filter((r) => r?.ok).length;
    return { sent, failed: results.length - sent, removed: gone.length };
  } catch (err) {
    console.error('[push] send failed:', err?.message || err);
    return { sent: 0, failed: 0, removed: 0 };
  }
}
