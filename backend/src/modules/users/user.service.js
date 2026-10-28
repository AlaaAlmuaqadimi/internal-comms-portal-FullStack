import crypto from 'node:crypto';
import { withTransaction, pool } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { isOrgUnitWithinScope } from '../../db/scope.js';

async function writeAudit(conn, { actorUserId, action, entityType, entityId, ip, userAgent }) {
  await conn.execute(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorUserId, action, entityType, entityId, ip || null, userAgent || null]
  );
}

/**
 * Creates an employee directory entry plus its 1:1 login account, assigns a
 * role (optionally scoped to an org unit) and default settings, in one
 * transaction.
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

    const [dup] = await conn.execute(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [input.username]
    );
    if (dup.length > 0) {
      throw new AppError(409, 'USERNAME_TAKEN', 'Username is already in use', [
        { field: 'username', message: 'Already taken' },
      ]);
    }

    const employeeCode = input.code || input.username;
    const [dupEmp] = await conn.execute(
      'SELECT id FROM employees WHERE code = ? LIMIT 1',
      [employeeCode]
    );
    if (dupEmp.length > 0) {
      throw new AppError(409, 'EMPLOYEE_CODE_TAKEN', 'Employee code is already in use', [
        { field: 'code', message: 'Already taken' },
      ]);
    }

    // IDs are generated here rather than relying on the column's DEFAULT
    // (UUID()): MySQL fills that server-side, so mysql2's insertId reports 0
    // for a CHAR(36) primary key and we could not reference the new rows.
    const employeeId = crypto.randomUUID();
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

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);
    await conn.execute(
      `INSERT INTO users
         (id, employee_id, username, password_hash, password_algo, password_changed_at, is_active)
       VALUES (?, ?, ?, ?, 'argon2id', UTC_TIMESTAMP(3), 1)`,
      [userId, employeeId, input.username, passwordHash]
    );

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
      username: input.username,
      roleCode: role.code,
      scopeOrgUnitId: input.scopeOrgUnitId,
    };
  });
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
