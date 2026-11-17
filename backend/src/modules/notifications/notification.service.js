import crypto from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { isAdmin } from '../../lib/roles.js';

// API type key -> notifications.type enum. MySQL has no "circular" value, so a
// circular is stored as an administrative notification and mapped back on read.
const DB_TYPE_BY_KEY = {
  announcement: 'announcement',
  circular: 'administrative',
  message: 'message',
};

const KEY_BY_DB_TYPE = {
  announcement: 'announcement',
  administrative: 'circular',
  message: 'message',
  meeting: 'announcement',
  system: 'announcement',
  missed_call: 'message',
};

const ICON_BY_KEY = {
  announcement: 'megaphone',
  circular: 'calendar',
  message: 'mail',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

// The pool is configured with timezone "Z", so DATETIME values arrive as UTC
// instants. Formatting with the getters below renders them in the server's
// local timezone, which is what the app displays.
function formatPublishedAt(value) {
  if (!value) return { date: '', time: '', createdAt: null };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '', createdAt: null };

  const hours24 = date.getHours();
  const period = hours24 >= 12 ? 'م' : 'ص';
  const hours12 = hours24 % 12 || 12;

  return {
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(hours12)}:${pad2(date.getMinutes())} ${period}`,
    createdAt: date.getTime(),
  };
}

function mapNotification(row, userId) {
  const typeKey = KEY_BY_DB_TYPE[row.type] || 'announcement';
  const published = formatPublishedAt(row.published_at || row.created_at);

  return {
    id: row.id,
    typeKey,
    // Kept for screens that localize the legacy Arabic type labels.
    type: typeKey,
    title: row.title_ar,
    titleEn: row.title_en ?? null,
    summary: row.summary_ar || '',
    summaryEn: row.summary_en ?? null,
    body: row.body_ar,
    bodyEn: row.body_en ?? null,
    icon: row.icon || ICON_BY_KEY[typeKey] || 'megaphone',
    date: published.date,
    time: published.time,
    createdAt: published.createdAt,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    // A notification the employee sent appears in their own list but is not an
    // unread inbox item unless they were also a recipient.
    unread: row.sent_only ? false : !row.read_at,
    audience: row.audience,
    recipientCount: Number(row.recipient_count || 0),
    readCount: Number(row.read_count || 0),
    isSender: Boolean(userId && row.created_by_user_id === userId),
  };
}

function validationError(field, message) {
  return new AppError(422, ErrorCodes.VALIDATION_ERROR, message, [
    { field, message },
  ]);
}

// Only notifications explicitly delivered to this employee are visible. This is
// what makes "send to selected people" work: there is no audience-wide read
// path that could leak a targeted notification to everyone.
const LIST_COLUMNS = `
  n.id, n.type, n.title_ar, n.title_en, n.summary_ar, n.summary_en,
  n.body_ar, n.body_en, n.icon, n.audience, n.published_at, n.expires_at,
  n.created_by_user_id,
  (SELECT COUNT(*)
     FROM notification_recipients c
    WHERE c.notification_id = n.id) AS recipient_count,
  (SELECT COUNT(*)
     FROM notification_recipients c
    WHERE c.notification_id = n.id AND c.read_at IS NOT NULL) AS read_count
`;

const RECEIVED_SELECT = `
  SELECT ${LIST_COLUMNS}, nr.read_at, 0 AS sent_only
  FROM notification_recipients nr
  JOIN notifications n ON n.id = nr.notification_id
  WHERE nr.employee_id = ?
    AND n.deleted_at IS NULL
    AND (n.published_at IS NULL OR n.published_at <= UTC_TIMESTAMP(3))
    AND (n.expires_at IS NULL OR n.expires_at > UTC_TIMESTAMP(3))
`;

// Senders keep a copy of what they sent so they can follow read receipts. It is
// merged by id with the received list (a sender may also be a recipient).
const SENT_SELECT = `
  SELECT ${LIST_COLUMNS}, NULL AS read_at, 1 AS sent_only
  FROM notifications n
  WHERE n.created_by_user_id = ?
    AND n.deleted_at IS NULL
    AND (n.published_at IS NULL OR n.published_at <= UTC_TIMESTAMP(3))
    AND (n.expires_at IS NULL OR n.expires_at > UTC_TIMESTAMP(3))
`;

export async function listNotifications(employeeId, userId) {
  const [receivedRows] = await pool.execute(
    `${RECEIVED_SELECT}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC
     LIMIT 200`,
    [employeeId]
  );

  const [sentRows] = await pool.execute(
    `${SENT_SELECT}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC
     LIMIT 200`,
    [userId]
  );

  const merged = new Map();
  for (const row of sentRows) {
    merged.set(row.id, mapNotification(row, userId));
  }
  for (const row of receivedRows) {
    const received = mapNotification(row, userId);
    const sent = merged.get(row.id);
    merged.set(row.id, sent ? { ...sent, ...received } : received);
  }

  return [...merged.values()].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
}

export async function countUnread(employeeId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
      WHERE nr.employee_id = ?
        AND nr.read_at IS NULL
        AND n.deleted_at IS NULL
        AND (n.published_at IS NULL OR n.published_at <= UTC_TIMESTAMP(3))
        AND (n.expires_at IS NULL OR n.expires_at > UTC_TIMESTAMP(3))`,
    [employeeId]
  );
  return Number(rows[0]?.total || 0);
}

async function resolveRecipients(input) {
  const audience = input.audience === 'all' ? 'all' : 'selected';

  if (audience === 'all') {
    const [rows] = await pool.execute(
      `SELECT id FROM employees
        WHERE is_active = 1 AND deleted_at IS NULL`
    );
    const ids = rows.map((row) => row.id);
    if (!ids.length) {
      throw validationError('recipientIds', 'لا يوجد موظفون نشطون لإرسال الإشعار إليهم');
    }
    return { audience, ids };
  }

  const requested = [...new Set(input.recipientIds || [])];
  if (!requested.length) {
    throw validationError('recipientIds', 'يجب تحديد مستهدف واحد على الأقل');
  }

  const placeholders = requested.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT id FROM employees
      WHERE id IN (${placeholders}) AND is_active = 1 AND deleted_at IS NULL`,
    requested
  );
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    throw validationError('recipientIds', 'المستهدفون المحددون غير موجودين أو غير نشطين');
  }
  return { audience, ids };
}

export async function createNotification(input, actor) {
  const typeKey = input.type || 'announcement';
  const dbType = DB_TYPE_BY_KEY[typeKey];
  if (!dbType) {
    throw validationError('type', 'نوع الإشعار غير معروف');
  }
  if (!actor?.id || !actor?.employeeId) {
    throw new AppError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required');
  }

  const { audience, ids } = await resolveRecipients(input);

  const body = input.body.trim();
  const firstLine = body.split('\n')[0].trim();
  const title = (input.title?.trim() || firstLine || 'إشعار').slice(0, 255);
  const summary = body.slice(0, 500);
  const durationHours = input.durationHours || 24;
  const id = crypto.randomUUID();

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO notifications
         (id, type, title_ar, summary_ar, body_ar, icon, audience,
          created_by_user_id, published_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3),
               DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? HOUR))`,
      [id, dbType, title, summary, body, ICON_BY_KEY[typeKey], audience, actor.id, durationHours]
    );

    // Insert in chunks so a broadcast to the whole company stays within
    // MySQL's placeholder limits on older builds.
    const chunkSize = 200;
    for (let start = 0; start < ids.length; start += chunkSize) {
      const chunk = ids.slice(start, start + chunkSize);
      const values = chunk.map(() => '(?, ?, UTC_TIMESTAMP(3), NULL)').join(', ');
      const params = [];
      for (const employeeId of chunk) {
        params.push(id, employeeId);
      }
      await conn.execute(
        `INSERT INTO notification_recipients
           (notification_id, employee_id, delivered_at, read_at)
         VALUES ${values}`,
        params
      );
    }
  });

  return { id, audience, recipientCount: ids.length };
}

export async function markRead(notificationId, employeeId) {
  const [result] = await pool.execute(
    `UPDATE notification_recipients
        SET read_at = UTC_TIMESTAMP(3)
      WHERE notification_id = ? AND employee_id = ? AND read_at IS NULL`,
    [notificationId, employeeId]
  );
  return result.affectedRows;
}

/**
 * Read receipts are visible to the sender (and to an admin). Each row tells the
 * sender exactly when a recipient opened the notification; read_at is stamped
 * by POST /api/notifications/:id/read when the recipient opens the details.
 */
export async function getReceipts(notificationId, actor) {
  const [notifications] = await pool.execute(
    `SELECT id, created_by_user_id
       FROM notifications
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [notificationId]
  );
  if (!notifications.length) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, 'Notification not found');
  }

  const notification = notifications[0];
  const isOwner = notification.created_by_user_id === actor?.id;
  if (!isOwner && !isAdmin(actor)) {
    throw new AppError(
      403,
      ErrorCodes.FORBIDDEN,
      'Only the sender can view read receipts'
    );
  }

  const [rows] = await pool.execute(
    `SELECT nr.employee_id, nr.read_at,
            e.full_name_ar, e.full_name_en, e.avatar_url
       FROM notification_recipients nr
       JOIN employees e ON e.id = nr.employee_id
      WHERE nr.notification_id = ?
      ORDER BY (nr.read_at IS NULL) ASC, nr.read_at ASC, e.full_name_ar ASC`,
    [notificationId]
  );

  const recipients = rows.map((row) => ({
    employeeId: row.employee_id,
    name: row.full_name_ar,
    nameEn: row.full_name_en ?? null,
    avatarUrl: row.avatar_url ?? null,
    read: Boolean(row.read_at),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  }));

  return {
    notificationId,
    recipientCount: recipients.length,
    readCount: recipients.filter((recipient) => recipient.read).length,
    recipients,
  };
}

export async function markAllRead(employeeId) {
  const [result] = await pool.execute(
    `UPDATE notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
        SET nr.read_at = UTC_TIMESTAMP(3)
      WHERE nr.employee_id = ?
        AND nr.read_at IS NULL
        AND n.deleted_at IS NULL`,
    [employeeId]
  );
  return result.affectedRows;
}
