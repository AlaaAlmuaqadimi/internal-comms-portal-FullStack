import { pool, withTransaction } from '../../db/pool.js';
import { getOrgUnitPath } from '../../db/scope.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { dummyVerify, hashPassword, verifyPasswordForUser } from '../../lib/password.js';
import crypto from 'node:crypto';
import {
  accessTokenTtlSeconds,
  generateRefreshToken,
  newRefreshFamilyId,
  newRefreshTokenId,
  refreshTokenExpiry,
  sha256,
  signAccessToken,
} from '../../lib/jwt.js';

const USER_SELECT = `
  SELECT u.id, u.employee_id, u.username, u.password_hash, u.password_algo,
         u.is_active, u.failed_login_count, u.locked_until,
         e.full_name_ar, e.full_name_en, e.code AS employee_code,
         e.presence, e.avatar_url, e.org_unit_id,
         ou.name_ar AS org_unit_name, ou.code AS org_unit_code
  FROM users u
  JOIN employees e ON e.id = u.employee_id
  JOIN org_units ou ON ou.id = e.org_unit_id
  WHERE u.deleted_at IS NULL AND e.deleted_at IS NULL`;

function isActive(value) {
  return value === 1 || value === true || value === '1';
}

function publicUser(user, path) {
  return {
    id: user.id,
    employeeId: user.employee_id,
    username: user.username,
    name: user.full_name_ar,
    nameEn: user.full_name_en,
    employeeCode: user.employee_code,
    status: user.presence,
    avatarUrl: user.avatar_url,
    unitId: user.org_unit_id,
    unitName: user.org_unit_name,
    path,
  };
}

async function findUserByUsername(username) {
  const [rows] = await pool.execute(`${USER_SELECT} AND u.username = ? LIMIT 1`, [username]);
  return rows[0] || null;
}

async function findUserById(userId) {
  const [rows] = await pool.execute(`${USER_SELECT} AND u.id = ? LIMIT 1`, [userId]);
  return rows[0] || null;
}

async function loadRolesAndPermissions(userId) {
  const [roleRows] = await pool.execute(
    `SELECT DISTINCT r.code
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [userId]
  );
  const roles = roleRows.map((r) => r.code);

  const [permRows] = await pool.execute(
    `SELECT p.code AS code, ur.scope_org_unit_id AS scope
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ?`,
    [userId]
  );

  const permissionMap = {};
  for (const row of permRows) {
    if (!permissionMap[row.code]) {
      permissionMap[row.code] = { global: false, scopes: [] };
    }
    const entry = permissionMap[row.code];
    if (row.scope == null) {
      entry.global = true;
    } else if (!entry.scopes.includes(row.scope)) {
      entry.scopes.push(row.scope);
    }
  }

  return { roles, permissionMap };
}

async function issueAccessToken(user) {
  const { roles, permissionMap } = await loadRolesAndPermissions(user.id);
  const accessToken = signAccessToken({
    sub: user.id,
    emp: user.employee_id,
    username: user.username,
    roles,
    perms: permissionMap,
  });
  return { accessToken, expiresIn: accessTokenTtlSeconds(), roles, permissionMap };
}

async function issueRefreshToken({ userId, ip, userAgent }) {
  const { raw, hash } = generateRefreshToken();
  await pool.execute(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, newRefreshFamilyId(), hash, userAgent || null, ip || null, refreshTokenExpiry()]
  );
  return raw;
}

async function revokeFamily(familyId) {
  await pool.execute(
    `UPDATE refresh_tokens
     SET revoked_at = UTC_TIMESTAMP(3)
     WHERE family_id = ? AND revoked_at IS NULL`,
    [familyId]
  );
}

async function registerFailedLogin(userId) {
  await pool.execute(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= ? THEN DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
           ELSE locked_until
         END
     WHERE id = ?`,
    [env.lockout.maxFailedLogins, env.lockout.lockMinutes, userId]
  );
}

async function completeSuccessfulLogin(userId, upgradedHash) {
  if (upgradedHash) {
    await pool.execute(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3),
           password_hash = ?, password_algo = 'argon2id', password_changed_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [upgradedHash, userId]
    );
    return;
  }
  await pool.execute(
    `UPDATE users
     SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [userId]
  );
}

async function recordLoginAttempt({ username, ip, userAgent, success }) {
  await pool.execute(
    `INSERT INTO login_attempts (username, ip, success, user_agent) VALUES (?, ?, ?, ?)`,
    [username || null, ip || null, success ? 1 : 0, userAgent || null]
  );
}

async function writeAudit({ actorUserId = null, action, entityType = null, entityId = null, ip, userAgent, metadata = null }) {
  await pool.execute(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, ip, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actorUserId,
      action,
      entityType,
      entityId,
      ip || null,
      userAgent || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function login({ username, password, ip, userAgent }) {
  const user = await findUserByUsername(username);

  if (!user) {
    await dummyVerify(password);
    await recordLoginAttempt({ username, ip, userAgent, success: false });
    throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  if (!isActive(user.is_active)) {
    await recordLoginAttempt({ username, ip, userAgent, success: false });
    await writeAudit({ actorUserId: user.id, action: 'auth.login.inactive', ip, userAgent });
    throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    await recordLoginAttempt({ username, ip, userAgent, success: false });
    throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  const { ok, upgradedHash } = await verifyPasswordForUser(user, password);

  if (!ok) {
    await registerFailedLogin(user.id);
    await recordLoginAttempt({ username, ip, userAgent, success: false });
    throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  await completeSuccessfulLogin(user.id, upgradedHash);
  await recordLoginAttempt({ username, ip, userAgent, success: true });

  const { accessToken, expiresIn } = await issueAccessToken(user);
  const refreshToken = await issueRefreshToken({ userId: user.id, ip, userAgent });
  const path = await getOrgUnitPath(user.org_unit_id);

  await writeAudit({ actorUserId: user.id, action: 'auth.login', ip, userAgent });

  return { accessToken, refreshToken, expiresIn, user: publicUser(user, path) };
}

export async function register({ name, username, password, unit, contacts = [], ip, userAgent }) {
  if (!normalizedUsername) throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'اسم المستخدم مطلوب');
  if (!existing.length === false) { /* noop */ }

  const [existing] = await pool.execute(
    `SELECT id FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1`,
    [normalizedUsername]
  );
  if (existing.length > 0) {
    throw new AppError(409, ErrorCodes.CONFLICT, 'اسم المستخدم مستخدَم بالفعل', { code: ErrorCodes.CONFLICT });
  }

  // Find a default org unit to attach the new employee to. The mobile form
  // captures a free-text "unit" name; we try to match an existing org_unit,
  // else fall back to the root unit.
  const [matchedUnits] = await pool.execute(
    `SELECT id FROM org_units WHERE deleted_at IS NULL AND (name_ar = ? OR name_en = ?) LIMIT 1`,
    [unit, unit]
  );
  let orgUnitId = matchedUnits[0]?.id || null;
  if (!orgUnitId) {
    const [roots] = await pool.execute(`SELECT id FROM org_units WHERE deleted_at IS NULL AND kind = 'root' LIMIT 1`);
    orgUnitId = roots[0]?.id;
  }
  if (!orgUnitId) {
    throw new AppError(500, ErrorCodes.VALIDATION_ERROR, 'No org unit available for registration');
  }

  const employeeId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const employeeCode = `U${Date.now().toString().slice(-6)}`;
  const passwordHash = await hashPassword(password);

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO employees (id, org_unit_id, code, full_name_ar, presence, is_active)
       VALUES (?, ?, ?, ?, 'offline', 1)`,
      [employeeId, orgUnitId, employeeCode, name.trim()]
    );

    await conn.execute(
      `INSERT INTO users
         (id, employee_id, username, password_hash, password_algo, password_changed_at, is_active)
       VALUES (?, ?, ?, ?, 'argon2id', UTC_TIMESTAMP(3), 1)`,
      [userId, employeeId, normalizedUsername, passwordHash]
    );

    // Assign the default 'employee' role if it exists (non-blocking if missing).
    const [roles] = await conn.execute(`SELECT id FROM roles WHERE code = 'employee' LIMIT 1`);
    if (roles.length > 0) {
      await conn.execute(
        `INSERT INTO user_roles (id, user_id, role_id, scope_org_unit_id)
         VALUES (?, ?, ?, NULL)`,
        [crypto.randomUUID(), userId, roles[0].id]
      );
    }

    await conn.execute(
      `INSERT INTO user_settings (user_id, language) VALUES (?, 'ar')
       ON DUPLICATE KEY UPDATE language = language`,
      [userId]
    );

    if (Array.isArray(contacts) && contacts.length > 0) {
      for (const contactId of contacts) {
        if (!contactId) continue;
        await conn.execute(
          `INSERT IGNORE INTO employee_contacts (owner_employee_id, contact_employee_id)
           VALUES (?, ?)`,
          [employeeId, contactId]
        );
      }
    }

    await conn.execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, ip, user_agent)
       VALUES (?, 'auth.register', 'user', ?, ?, ?)`,
      [userId, userId, ip || null, userAgent || null]
    );
  });

  const user = await findUserById(userId);
  const { accessToken, expiresIn } = await issueAccessToken(user);
  const refreshToken = await issueRefreshToken({ userId: user.id, ip, userAgent });
  const path = await getOrgUnitPath(user.org_unit_id);

  return { accessToken, refreshToken, expiresIn, user: publicUser(user, path) };
}

export async function rotateRefreshToken({ refreshToken, ip, userAgent }) {
  const tokenHash = sha256(refreshToken);

  const [rows] = await pool.execute(
    `SELECT id, user_id, family_id, expires_at, revoked_at
     FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
    [tokenHash]
  );
  if (rows.length === 0) {
    throw new AppError(401, ErrorCodes.REFRESH_INVALID, 'Invalid refresh token');
  }
  const existing = rows[0];

  if (existing.revoked_at) {
    await revokeFamily(existing.family_id);
    await writeAudit({
      actorUserId: existing.user_id,
      action: 'auth.refresh.reuse_detected',
      ip,
      userAgent,
      metadata: { familyId: existing.family_id },
    });
    throw new AppError(401, ErrorCodes.REFRESH_REUSED, 'Refresh token reuse detected');
  }

  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    throw new AppError(401, ErrorCodes.REFRESH_INVALID, 'Refresh token expired');
  }

  const user = await findUserById(existing.user_id);
  if (!user || !isActive(user.is_active)) {
    await revokeFamily(existing.family_id);
    throw new AppError(401, ErrorCodes.REFRESH_INVALID, 'Account is not active');
  }

  const { raw: newRaw, hash: newHash } = generateRefreshToken();
  const newId = newRefreshTokenId();

  // Insert-then-revoke inside one transaction. If a concurrent request already
  // rotated this token, the conditional UPDATE matches zero rows and we treat
  // it as reuse: the whole family is revoked.
  const rotated = await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, user_agent, ip, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, existing.user_id, existing.family_id, newHash, userAgent || null, ip || null, refreshTokenExpiry()]
    );

    const [updateRes] = await conn.execute(
      `UPDATE refresh_tokens
       SET revoked_at = UTC_TIMESTAMP(3), last_used_at = UTC_TIMESTAMP(3), replaced_by_token_id = ?
       WHERE id = ? AND revoked_at IS NULL`,
      [newId, existing.id]
    );
    if (updateRes.affectedRows !== 1) {
      const race = new Error('refresh rotation race');
      race.code = 'REFRESH_RACE';
      throw race;
    }
    return true;
  }).catch((err) => {
    if (err && err.code === 'REFRESH_RACE') return false;
    throw err;
  });

  if (!rotated) {
    await revokeFamily(existing.family_id);
    await writeAudit({
      actorUserId: existing.user_id,
      action: 'auth.refresh.reuse_detected',
      ip,
      userAgent,
      metadata: { familyId: existing.family_id },
    });
    throw new AppError(401, ErrorCodes.REFRESH_REUSED, 'Refresh token reuse detected');
  }

  const { accessToken, expiresIn } = await issueAccessToken(user);
  const path = await getOrgUnitPath(user.org_unit_id);
  await writeAudit({ actorUserId: user.id, action: 'auth.refresh', ip, userAgent });

  return { accessToken, refreshToken: newRaw, expiresIn, user: publicUser(user, path) };
}

export async function logout({ refreshToken, ip, userAgent }) {
  if (refreshToken) {
    const [rows] = await pool.execute(
      `SELECT family_id, user_id FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
      [sha256(refreshToken)]
    );
    if (rows.length > 0) {
      await revokeFamily(rows[0].family_id);
      await writeAudit({ actorUserId: rows[0].user_id, action: 'auth.logout', ip, userAgent });
      return;
    }
  }
  await writeAudit({ actorUserId: null, action: 'auth.logout', ip, userAgent });
}

export async function getMe(userId) {
  const user = await findUserById(userId);
  if (!user || !isActive(user.is_active)) {
    throw new AppError(401, ErrorCodes.UNAUTHORIZED, 'Account is not available');
  }
  const { roles, permissionMap } = await loadRolesAndPermissions(userId);
  const path = await getOrgUnitPath(user.org_unit_id);
  return { user: { ...publicUser(user, path), roles, permissions: permissionMap } };
}
