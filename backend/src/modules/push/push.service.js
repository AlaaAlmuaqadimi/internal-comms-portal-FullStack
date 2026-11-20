/**
 * Push tokens and sending (Phase D).
 *
 * Off unless PUSH_ENABLED=true and FCM_SERVICE_ACCOUNT_FILE points to a
 * Firebase service-account JSON. Registering tokens always works (so phones
 * are ready when push is turned on); sending is a no-op while push is off.
 *
 * The service-account file is a secret: keep it on the server only (the
 * default location `backend/secrets/` is git-ignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { createFcmClient, parseServiceAccount } from './fcm.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// A user rarely has more phones than this; older tokens are dropped.
export const MAX_TOKENS_PER_EMPLOYEE = 5;

let client = null;
let clientLoaded = false;

function loadClient() {
  if (clientLoaded) return client;
  clientLoaded = true;
  if (!env.push.enabled) return null;
  try {
    const file = path.isAbsolute(env.push.serviceAccountFile)
      ? env.push.serviceAccountFile
      : path.resolve(backendRoot, env.push.serviceAccountFile);
    const account = parseServiceAccount(fs.readFileSync(file, 'utf8'));
    client = createFcmClient({ serviceAccount: account });
    const { projectId } = account; // not a secret
    console.log(`[push] FCM enabled for project ${projectId}`);
  } catch (err) {
    // Never print the file contents; the message names only missing fields.
    console.error('[push] disabled: cannot load the FCM service account:', err?.message || err);
    client = null;
  }
  return client;
}

export function isPushEnabled() {
  return Boolean(loadClient());
}

/** Saves (or moves to this user) the token of the phone that is signed in. */
export async function registerPushToken(user, { token, platform }) {
  if (!user?.id || !user?.employeeId) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, 'لا يوجد موظف مرتبط بهذا الحساب.');
  }
  // A phone that changes hands moves to the new user.
  await pool.execute(
    `INSERT INTO push_tokens (user_id, employee_id, provider, platform, token, last_seen_at)
     VALUES (?, ?, 'fcm', ?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       employee_id = VALUES(employee_id),
       platform = VALUES(platform),
       last_seen_at = UTC_TIMESTAMP(3)`,
    [user.id, user.employeeId, platform, token]
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
 * Sends one data message to every phone of an employee and deletes tokens FCM
 * reports as gone. Never throws: a push failure must not break a call.
 */
export async function sendToEmployee(employeeId, data, { ttlSeconds = 60 } = {}) {
  const fcm = loadClient();
  if (!fcm || !employeeId) return { sent: 0, failed: 0, removed: 0 };
  try {
    const [rows] = await pool.execute('SELECT id, token FROM push_tokens WHERE employee_id = ?', [
      employeeId,
    ]);
    if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };

    const results = await Promise.all(
      rows.map((row) =>
        fcm.send({ token: row.token, data, ttlSeconds }).catch(() => ({ ok: false, unregistered: false }))
      )
    );

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
