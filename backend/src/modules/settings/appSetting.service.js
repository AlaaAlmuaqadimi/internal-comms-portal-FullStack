import { pool, withTransaction } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import {
  DEFAULT_REDACTED_LABELS,
  REDACTED_LABEL_KEYS,
} from '../calls/callView.service.js';

export const EDITABLE_APP_SETTING_KEYS = Object.freeze([
  REDACTED_LABEL_KEYS.director,
  REDACTED_LABEL_KEYS.deputy,
]);

/**
 * Keys the public `GET /api/settings/app` response may expose. This is an
 * allowlist, not a filter on today's known rows: any future internal key that
 * is added to `app_settings` stays invisible until it is added here.
 */
export const PUBLIC_APP_SETTING_KEYS = EDITABLE_APP_SETTING_KEYS;

const EDITABLE = new Set(EDITABLE_APP_SETTING_KEYS);
const PUBLIC = new Set(PUBLIC_APP_SETTING_KEYS);

function validationError(message, field = 'settings') {
  return new AppError(422, ErrorCodes.VALIDATION_ERROR, message, [
    { field, message },
  ]);
}

function mapRows(rows) {
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }));
}

/**
 * Returns every app setting as an item list plus a convenient key/value object.
 * Reading is not sensitive, but keeping this service separate from user
 * preferences avoids accidentally exposing per-user settings.
 */
export async function getAppSettings(executor = pool) {
  const [rows] = await executor.execute(
    `SELECT \`key\`, \`value\`, updated_by, updated_at
       FROM app_settings
      ORDER BY \`key\``
  );
  const items = mapRows(rows);
  const values = Object.fromEntries(items.map((item) => [item.key, item.value]));
  return { items, values };
}

/**
 * Public read path used by `GET /api/settings/app`.
 *
 * Only allowlisted keys are returned, both in `settings` and in `items`. A key
 * that is present in the table but not on the allowlist is silently omitted;
 * this keeps internal future settings from leaking through the public route.
 */
export async function getWhitelistedAppSettings(executor = pool) {
  const { items, values } = await getAppSettings(executor);
  const allowedItems = items.filter((item) => PUBLIC.has(item.key));
  return {
    items: allowedItems,
    values: Object.fromEntries(
      allowedItems
        .filter((item) => item.key in values)
        .map((item) => [item.key, values[item.key]])
    ),
  };
}

/**
 * Loads the two labels used by callee-side redaction. Missing or blank values
 * fall back to the seeded defaults so a call never fails to render.
 */
export async function getCallRedactedLabels(executor = pool) {
  try {
    const { values } = await getAppSettings(executor);
    return {
      director: values[REDACTED_LABEL_KEYS.director] || DEFAULT_REDACTED_LABELS.director,
      deputy: values[REDACTED_LABEL_KEYS.deputy] || DEFAULT_REDACTED_LABELS.deputy,
    };
  } catch {
    return { ...DEFAULT_REDACTED_LABELS };
  }
}

/**
 * Admin-editable upsert. Only the known settings keys are accepted; the value
 * is stored as text exactly as supplied (trimmed).
 */
export async function updateAppSettings(input, actor, ctx = {}) {
  const entries = Object.entries(input || {});
  if (entries.length === 0) {
    throw validationError('At least one setting is required.');
  }

  for (const [key, value] of entries) {
    if (!EDITABLE.has(key)) {
      throw validationError(`Unknown setting "${key}".`, key);
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw validationError('Setting value must not be empty.', key);
    }
    if (value.trim().length > 255) {
      throw validationError('Setting value is too long.', key);
    }
  }

  await withTransaction(async (conn) => {
    for (const [key, value] of entries) {
      await conn.execute(
        `INSERT INTO app_settings (\`key\`, \`value\`, updated_by, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           \`value\` = VALUES(\`value\`),
           updated_by = VALUES(updated_by),
           updated_at = UTC_TIMESTAMP(3)`,
        [key, value.trim(), actor?.id ?? null]
      );
    }

    await conn.execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, metadata, ip, user_agent)
       VALUES (?, 'settings.update', 'app_settings', ?, ?, ?)`,
      [
        actor?.id ?? null,
        JSON.stringify({ keys: entries.map(([key]) => key) }),
        ctx.ip || null,
        ctx.userAgent || null,
      ]
    );
  });

  return getAppSettings();
}
