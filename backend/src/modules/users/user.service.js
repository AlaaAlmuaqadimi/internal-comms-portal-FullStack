import crypto from 'node:crypto';
import { withTransaction, pool } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { isOrgUnitWithinScope } from '../../db/scope.js';
import { findAvailableUsername, usernameIsTaken } from '../../lib/username.js';

async function writeAudit(conn, { actorUserId, action, entityType, entityId, ip, userAgent }) {
  await conn.execute(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorUserId, action, entityType, entityId, ip || null, userAgent || null]
  );
}

function duplicateError(status, code, message, field) {
  return new AppError(status, code, message, [{ field, message }]);
}

async function assertEmailAvailable(executor, email) {
  if (!email) return;
  const [rows] = await executor.execute(
    'SELECT id FROM employees WHERE email = ? LIMIT 1',
    [email]
  );
  if (rows.length > 0) {
    throw duplicateError(
      409,
      ErrorCodes.EMAIL_TAKEN,
      'This email address is already registered.',
      'email'
    );
  }
}

async function assertExtensionAvailable(executor, extension) {
  if (!extension) return;
  const [rows] = await executor.execute(
    `SELECT id FROM employees
     WHERE extension = ? AND is_active = 1 AND deleted_at IS NULL
     LIMIT 1`,
    [extension]
  );
  if (rows.length > 0) {
    throw duplicateError(
      409,
      ErrorCodes.EXTENSION_TAKEN,
      'This extension number is already in use by another employee.',
      'extension'
    );
  }
}

/**
 * Creates an employee directory entry plus its 1:1 login account, assigns a
 * role (optionally scoped to an org unit) and default settings, in one
 * transaction.
 *
 * Username: when the client omits it (the normal Add Employee flow) a unique
 * value is derived from the English name. When supplied it must be free.
 *
 * Authorization is enforced by the route (requireAdmin). Here we additionally
 * refuse to grant a scoped role outside the actor's own grant, so a scoped
 * principal cannot escalate into another subtree if one is ever introduced.
 */
export async function createUser(input, actor, ctx = {}) {
  return withTransaction(async (conn) => {
    const [orgRows] = await conn.execute(
      'SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [input.orgUnitId]
    );
    if (orgRows.length === 0) {
      throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Unknown org unit', [
        { field: 'orgUnitId', message: 'No such org unit' },
      ]);
    }

    const [roleRows] = await conn.execute(
      'SELECT id, code FROM roles WHERE code = ? LIMIT 1',
      [input.roleCode]
    );
    if (roleRows.length === 0) {
      throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Unknown role', [
        { field: 'roleCode', message: `No role with code "${input.roleCode}"` },
      ]);
    }
    const role = roleRows[0];

    // A non-global actor may only assign roles within its own scope.
    if (input.scopeOrgUnitId) {
      const [scopeRows] = await conn.execute(
        'SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [input.scopeOrgUnitId]
      );
      if (scopeRows.length === 0) {
        throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Unknown scope org unit', [
          { field: 'scopeOrgUnitId', message: 'No such org unit' },
        ]);
      }
      if (!actor.isGlobal) {
        let allowed = false;
        for (const scopeId of actor.scopes) {
          if (await isOrgUnitWithinScope(scopeId, input.scopeOrgUnitId)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) {
          throw new AppError(
            403,
            ErrorCodes.FORBIDDEN,
            'Cannot assign a role outside your scope'
          );
        }
      }
    }

    // Username: generate when omitted, otherwise validate the explicit value.
    // A taken explicit value falls back to the same base plus a numeric suffix,
    // so a stale client preview never fails the whole submission.
    let username;
    if (input.username) {
      username = (await usernameIsTaken(conn, input.username))
        ? await findAvailableUsername(conn, input.fullNameEn, { base: input.username })
        : input.username;
    } else {
      username = await findAvailableUsername(conn, input.fullNameEn);
    }

    // Pre-checks give precise field errors; the unique indexes below still
    // catch a concurrent insert between the check and the write.
    await assertEmailAvailable(conn, input.email);
    await assertExtensionAvailable(conn, input.extension);

    const employeeCode = input.code || username;
    const [dupEmp] = await conn.execute(
      'SELECT id FROM employees WHERE code = ? LIMIT 1',
      [employeeCode]
    );
    if (dupEmp.length > 0) {
      throw duplicateError(
        409,
        ErrorCodes.EMPLOYEE_CODE_TAKEN,
        'Employee code is already in use',
        'code'
      );
    }

    // IDs are generated here rather than relying on the column's DEFAULT
    // (UUID()): MySQL fills that server-side, so mysql2's insertId reports 0
    // for a CHAR(36) primary key and we could not reference the new rows.
    const employeeId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    try {
      await conn.execute(
        `INSERT INTO employees
           (id, org_unit_id, code, full_name_ar, full_name_en, job_title_ar, email, extension, presence, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', 1)`,
        [
          employeeId,
          input.orgUnitId,
          employeeCode,
          input.fullNameAr,
          input.fullNameEn,
          input.jobTitleAr,
          input.email,
          input.extension,
        ]
      );

      const passwordHash = await hashPassword(input.password);
      await conn.execute(
        `INSERT INTO users
           (id, employee_id, username, password_hash, password_algo, password_changed_at, is_active)
         VALUES (?, ?, ?, ?, 'argon2id', UTC_TIMESTAMP(3), 1)`,
        [userId, employeeId, username, passwordHash]
      );
    } catch (err) {
      // Map the database-level unique constraints to stable API codes so a
      // race (two admins submitting at once) still produces a field error.
      if (err && err.code === 'ER_DUP_ENTRY') {
        const message = String(err.message || '');
        if (message.includes('uq_employees_email')) {
          throw duplicateError(
            409,
            ErrorCodes.EMAIL_TAKEN,
            'This email address is already registered.',
            'email'
          );
        }
        if (message.includes('uq_employees_active_extension')) {
          throw duplicateError(
            409,
            ErrorCodes.EXTENSION_TAKEN,
            'This extension number is already in use by another employee.',
            'extension'
          );
        }
        if (message.includes('uq_users_username')) {
          throw duplicateError(
            409,
            ErrorCodes.USERNAME_TAKEN,
            'Username is already in use',
            'username'
          );
        }
        if (message.includes('uq_employees_code')) {
          throw duplicateError(
            409,
            ErrorCodes.EMPLOYEE_CODE_TAKEN,
            'Employee code is already in use',
            'code'
          );
        }
      }
      throw err;
    }

    await conn.execute(
      `INSERT INTO user_roles (id, user_id, role_id, scope_org_unit_id, granted_by)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, role.id, input.scopeOrgUnitId, actor.id]
    );

    await conn.execute(
      `INSERT INTO user_settings (user_id, language) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE language = VALUES(language)`,
      [userId, input.language || 'ar']
    );

    await writeAudit(conn, {
      actorUserId: actor.id,
      action: 'user.create',
      entityType: 'user',
      entityId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      id: userId,
      employeeId,
      username,
      email: input.email,
      extension: input.extension,
      roleCode: role.code,
      scopeOrgUnitId: input.scopeOrgUnitId,
    };
  });
}

/** Preview the username the next create call would allocate. */
export async function previewUsername(fullNameEn) {
  const username = await findAvailableUsername(pool, fullNameEn);
  return { username };
}

/**
 * Check whether a value is free before the form is submitted. Only the fields
 * with database-level uniqueness are supported.
 */
export async function checkAvailability({ field, value, excludeEmployeeId }) {
  const normalized = field === 'username' ? value.trim().toLowerCase() : value.trim();
  let taken = false;

  if (field === 'email') {
    const [rows] = await pool.execute(
      excludeEmployeeId
        ? 'SELECT id FROM employees WHERE email = ? AND id <> ? LIMIT 1'
        : 'SELECT id FROM employees WHERE email = ? LIMIT 1',
      excludeEmployeeId ? [normalized, excludeEmployeeId] : [normalized]
    );
    taken = rows.length > 0;
  } else if (field === 'extension') {
    const [rows] = await pool.execute(
      excludeEmployeeId
        ? `SELECT id FROM employees
           WHERE extension = ? AND is_active = 1 AND deleted_at IS NULL AND id <> ?
           LIMIT 1`
        : `SELECT id FROM employees
           WHERE extension = ? AND is_active = 1 AND deleted_at IS NULL
           LIMIT 1`,
      excludeEmployeeId ? [normalized, excludeEmployeeId] : [normalized]
    );
    taken = rows.length > 0;
  } else if (field === 'username') {
    taken = await usernameIsTaken(pool, normalized);
  }

  return { field, value: normalized, available: !taken };
}

export async function listRoles() {
  const [rows] = await pool.query(
    `SELECT code, name_ar, name_en, is_system FROM roles ORDER BY is_system DESC, code`
  );
  return rows;
}

export async function listOrgUnits() {
  const [rows] = await pool.query(
    `SELECT id, parent_id, code, name_ar, kind FROM org_units
     WHERE deleted_at IS NULL ORDER BY sort_order, name_ar`
  );
  return rows;
}
