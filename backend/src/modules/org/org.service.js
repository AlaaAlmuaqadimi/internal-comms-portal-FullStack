import crypto from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { isOrgUnitWithinScope } from '../../db/scope.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { buildOrgTree, pruneInactive } from '../../lib/orgTree.js';

export const ORG_KINDS = ['root', 'deputy', 'office', 'directorate', 'section', 'group'];

/**
 * Business mapping used by the API:
 *   root        Head of the Authority (رئيس المصلحة)  -> parent_id NULL
 *   deputy      Deputy Head (نائب رئيس المصلحة)       -> root
 *   directorate General Administration (إدارة)        -> root/deputy/group
 *   office      Branch / Regional Office / staff office -> root/deputy/group/directorate/office
 *   section     Department (قسم)                      -> directorate/office (or legacy parent)
 *   group       Legacy grouping node                  -> root/deputy/office/directorate
 *
 * The matrix keeps the tree flexible but rejects structurally meaningless
 * writes such as a department directly under another department.
 */
const ALLOWED_PARENT_KINDS = {
  root: [],
  deputy: ['root'],
  group: ['root', 'deputy', 'office', 'directorate'],
  directorate: ['root', 'deputy', 'group'],
  office: ['root', 'deputy', 'group', 'directorate', 'office'],
  section: ['root', 'deputy', 'group', 'directorate', 'office'],
};

const RAW_UNIT_SELECT = `
  SELECT id, parent_id, code, name_ar, name_en, kind, sort_order, is_active,
         metadata, created_at, updated_at, deleted_at
  FROM org_units`;

const UNIT_SELECT = `
  SELECT u.id, u.parent_id, u.code, u.name_ar, u.name_en, u.kind,
         u.sort_order, u.is_active, u.metadata, u.created_at, u.updated_at,
         COALESCE(ec.employee_count, 0) AS employee_count
  FROM org_units u
  LEFT JOIN (
    SELECT org_unit_id, COUNT(*) AS employee_count
    FROM employees
    WHERE deleted_at IS NULL
    GROUP BY org_unit_id
  ) ec ON ec.org_unit_id = u.id`;

function parseMetadata(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function metadataForDb(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toUnit(row) {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    code: row.code,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? null,
    kind: row.kind,
    sortOrder: Number(row.sort_order),
    isActive: row.is_active === 1 || row.is_active === true || row.is_active === '1',
    metadata: parseMetadata(row.metadata),
    employeeCount: Number(row.employee_count || 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function scopeList(actor) {
  if (actor && actor.isGlobal) return null;
  return Array.isArray(actor?.scopes) ? [...new Set(actor.scopes)] : [];
}

async function assertWithinActorScope(actor, orgUnitId) {
  if (actor && actor.isGlobal) return;
  const scopes = scopeList(actor) || [];
  if (!orgUnitId || scopes.length === 0) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, 'Org unit is outside your scope');
  }
  for (const scopeId of scopes) {
    if (await isOrgUnitWithinScope(scopeId, orgUnitId)) return;
  }
  throw new AppError(403, ErrorCodes.FORBIDDEN, 'Org unit is outside your scope');
}

function writeAudit(conn, { actorUserId, action, entityId, metadata, ip, userAgent }) {
  return conn.execute(
    `INSERT INTO audit_log
       (actor_user_id, action, entity_type, entity_id, ip, user_agent, metadata)
     VALUES (?, ?, 'org_unit', ?, ?, ?, ?)`,
    [
      actorUserId || null,
      action,
      entityId,
      ip || null,
      userAgent || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

/**
 * Serializes structural writes by locking the single root row. This closes the
 * race where two concurrent moves each pass the cycle check and then create a
 * cycle. The unique active-root index handles first-root creation separately.
 */
async function lockTree(conn) {
  await conn.execute(
    'SELECT id FROM org_units WHERE parent_id IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE'
  );
}

async function getRawUnit(conn, id, { forUpdate = false, includeDeleted = false } = {}) {
  const [rows] = await conn.execute(
    `${RAW_UNIT_SELECT}
     WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return rows[0] || null;
}

async function getUnitWithCount(conn, id) {
  const [rows] = await conn.execute(
    `${UNIT_SELECT}
     WHERE u.id = ? AND u.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return rows[0] ? toUnit(rows[0]) : null;
}

async function assertCodeAvailable(conn, code, excludeId = null) {
  const [rows] = excludeId
    ? await conn.execute('SELECT id FROM org_units WHERE code = ? AND id <> ? LIMIT 1', [
        code,
        excludeId,
      ])
    : await conn.execute('SELECT id FROM org_units WHERE code = ? LIMIT 1', [code]);
  if (rows.length > 0) {
    throw new AppError(409, ErrorCodes.ORG_UNIT_CODE_TAKEN, 'Org unit code is already in use', [
      { field: 'code', message: 'Already taken' },
    ]);
  }
}

async function generateUniqueCode(conn) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `OU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const [rows] = await conn.execute('SELECT id FROM org_units WHERE code = ? LIMIT 1', [code]);
    if (rows.length === 0) return code;
  }
  throw new AppError(500, 'INTERNAL', 'Could not generate a unique org unit code');
}

async function checkCycle(conn, unitId, parentId) {
  if (!unitId || !parentId) return;
  const [rows] = await conn.execute(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM org_units WHERE id = ?
       UNION ALL
       SELECT o.id
       FROM org_units o
       JOIN descendants d ON o.parent_id = d.id
     )
     SELECT 1 AS found FROM descendants WHERE id = ? LIMIT 1`,
    [unitId, parentId]
  );
  if (rows.length > 0) {
    throw new AppError(
      422,
      ErrorCodes.ORG_UNIT_CYCLE,
      'An org unit cannot be moved below itself or one of its descendants'
    );
  }
}

async function validateChildrenForKind(conn, unitId, kind) {
  const [children] = await conn.execute(
    `SELECT DISTINCT kind FROM org_units
     WHERE parent_id = ? AND deleted_at IS NULL`,
    [unitId]
  );
  for (const child of children) {
    const allowed = ALLOWED_PARENT_KINDS[child.kind] || [];
    if (!allowed.includes(kind)) {
      throw new AppError(
        422,
        ErrorCodes.ORG_UNIT_PARENT_INVALID,
        `Cannot change this unit to ${kind} while it has a ${child.kind} child`,
        [{ field: 'kind', message: `Move or re-kind the ${child.kind} child first` }]
      );
    }
  }
}

async function validateStructure(conn, { unitId = null, kind, parentId, parent }) {
  if (!ORG_KINDS.includes(kind)) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Unknown org unit kind', [
      { field: 'kind', message: `Must be one of ${ORG_KINDS.join(', ')}` },
    ]);
  }

  if (kind === 'root') {
    if (parentId) {
      throw new AppError(422, ErrorCodes.ORG_UNIT_PARENT_INVALID, 'The root unit cannot have a parent');
    }
    const [roots] = await conn.execute(
      `SELECT id FROM org_units
       WHERE parent_id IS NULL AND deleted_at IS NULL AND id <> ?
       LIMIT 1`,
      [unitId || '']
    );
    if (roots.length > 0) {
      throw new AppError(
        409,
        ErrorCodes.ORG_UNIT_ROOT_EXISTS,
        'An active Head of the Authority already exists'
      );
    }
    return;
  }

  if (!parentId) {
    throw new AppError(422, ErrorCodes.ORG_UNIT_PARENT_INVALID, 'A parent org unit is required');
  }
  if (!parent) {
    throw new AppError(422, ErrorCodes.ORG_UNIT_PARENT_INVALID, 'Parent org unit does not exist', [
      { field: 'parentId', message: 'No such org unit' },
    ]);
  }
  if (!(parent.is_active === 1 || parent.is_active === true || parent.is_active === '1')) {
    throw new AppError(422, ErrorCodes.ORG_UNIT_PARENT_INVALID, 'Parent org unit is inactive', [
      { field: 'parentId', message: 'Parent must be active' },
    ]);
  }

  const allowed = ALLOWED_PARENT_KINDS[kind] || [];
  if (!allowed.includes(parent.kind)) {
    throw new AppError(
      422,
      ErrorCodes.ORG_UNIT_PARENT_INVALID,
      `A ${kind} unit cannot be placed under a ${parent.kind} unit`,
      [{ field: 'parentId', message: `Allowed parent kinds: ${allowed.join(', ')}` }]
    );
  }

  await checkCycle(conn, unitId, parentId);
}

async function runTreeWrite(fn) {
  try {
    return await withTransaction(fn);
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const message = String(err.message || '');
      if (message.includes('uq_org_units_active_root')) {
        throw new AppError(
          409,
          ErrorCodes.ORG_UNIT_ROOT_EXISTS,
          'An active Head of the Authority already exists'
        );
      }
      if (message.includes('uq_org_units_code')) {
        throw new AppError(409, ErrorCodes.ORG_UNIT_CODE_TAKEN, 'Org unit code is already in use');
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Flat, scope-aware list. A scoped principal receives only units inside the
 * subtrees granted by its org.read permission. Nodes whose parent is outside
 * the scope become roots when the caller builds a tree.
 */
export async function listOrgUnits(filters = {}, actor = null) {
  const scopes = scopeList(actor);
  if (scopes && scopes.length === 0) return [];

  const params = [];
  let sql = '';

  if (scopes) {
    sql += `WITH RECURSIVE scoped AS (
      SELECT id FROM org_units
      WHERE id IN (${scopes.map(() => '?').join(', ')}) AND deleted_at IS NULL
      UNION
      SELECT o.id
      FROM org_units o
      JOIN scoped s ON o.parent_id = s.id
      WHERE o.deleted_at IS NULL
    ) `;
    params.push(...scopes);
  }

  sql += UNIT_SELECT;
  if (scopes) sql += ' JOIN scoped sc ON sc.id = u.id';
  sql += ' WHERE u.deleted_at IS NULL';

  if (!filters.includeInactive) sql += ' AND u.is_active = 1';
  if (filters.parentId) {
    sql += ' AND u.parent_id = ?';
    params.push(filters.parentId);
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    sql += ' AND (u.name_ar LIKE ? OR u.name_en LIKE ? OR u.code LIKE ?)';
    params.push(like, like, like);
  }

  sql += ' ORDER BY u.sort_order, u.name_ar, u.code';

  const [rows] = await pool.execute(sql, params);
  return rows.map(toUnit);
}

export async function getOrgTree({ includeInactive = false, rootId = null } = {}, actor = null) {
  if (rootId) {
    const subtree = await getSubtree(rootId, actor, { includeInactive });
    return subtree ? [subtree] : [];
  }

  // Load inactive rows too, then prune whole branches. Filtering them in SQL
  // would promote active children of an inactive parent to artificial roots.
  const rows = await listOrgUnits({ includeInactive: true }, actor);
  let tree = buildOrgTree(rows);
  if (!includeInactive) tree = pruneInactive(tree);
  return tree;
}

export async function getSubtree(id, actor = null, { includeInactive = false } = {}) {
  await assertWithinActorScope(actor, id);

  const [rows] = await pool.execute(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT o.id
       FROM org_units o
       JOIN subtree s ON o.parent_id = s.id
       WHERE o.deleted_at IS NULL
     )
     ${UNIT_SELECT}
     JOIN subtree st ON st.id = u.id
     WHERE u.deleted_at IS NULL
     ORDER BY u.sort_order, u.name_ar, u.code`,
    [id]
  );

  if (rows.length === 0) return null;
  let tree = buildOrgTree(rows.map(toUnit));
  if (!includeInactive) tree = pruneInactive(tree);
  return tree[0] || null;
}

export async function getAncestors(id) {
  const [rows] = await pool.execute(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, code, name_ar, name_en, kind, sort_order, is_active,
              metadata, created_at, updated_at, 0 AS depth
       FROM org_units
       WHERE id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT p.id, p.parent_id, p.code, p.name_ar, p.name_en, p.kind, p.sort_order,
              p.is_active, p.metadata, p.created_at, p.updated_at, a.depth + 1
       FROM org_units p
       JOIN ancestors a ON p.id = a.parent_id
       WHERE p.deleted_at IS NULL
     )
     SELECT * FROM ancestors ORDER BY depth DESC`,
    [id]
  );

  return rows
    .filter((row) => row.id !== id)
    .map((row, index) => ({ ...toUnit(row), depth: index }));
}

export async function getOrgUnit(id, actor = null) {
  await assertWithinActorScope(actor, id);

  const unit = await getUnitWithCount(pool, id);
  if (!unit) return null;

  const [ancestors, children] = await Promise.all([
    getAncestors(id),
    listOrgUnits({ parentId: id, includeInactive: true }, actor),
  ]);

  return { unit, ancestors, children };
}

export async function getChildren(id, actor = null) {
  await assertWithinActorScope(actor, id);
  return listOrgUnits({ parentId: id, includeInactive: true }, actor);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createOrgUnit(input, actor, ctx = {}) {
  return runTreeWrite(async (conn) => {
    await lockTree(conn);

    const kind = input.kind;
    const parentId = input.parentId ?? null;
    const parent = parentId ? await getRawUnit(conn, parentId) : null;

    await validateStructure(conn, { kind, parentId, parent });

    if (parentId) {
      await assertWithinActorScope(actor, parentId);
    } else if (!actor || !actor.isGlobal) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, 'Only a global administrator can create the root');
    }

    const code = input.code || (await generateUniqueCode(conn));
    await assertCodeAvailable(conn, code);

    const id = crypto.randomUUID();
    await conn.execute(
      `INSERT INTO org_units
         (id, parent_id, code, name_ar, name_en, kind, sort_order, is_active, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        parentId,
        code,
        input.nameAr,
        input.nameEn ?? null,
        kind,
        input.sortOrder ?? 0,
        input.isActive === false ? 0 : 1,
        metadataForDb(input.metadata),
      ]
    );

    await writeAudit(conn, {
      actorUserId: actor?.id,
      action: 'org_unit.create',
      entityId: id,
      metadata: { code, kind, parentId },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return getUnitWithCount(conn, id);
  });
}

export async function updateOrgUnit(id, input, actor, ctx = {}) {
  return runTreeWrite(async (conn) => {
    await lockTree(conn);

    const existing = await getRawUnit(conn, id, { forUpdate: true });
    if (!existing) {
      throw new AppError(404, ErrorCodes.ORG_UNIT_NOT_FOUND, 'Org unit not found');
    }

    await assertWithinActorScope(actor, id);

    const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
    const kind = has('kind') ? input.kind : existing.kind;
    const parentId = has('parentId') ? (input.parentId ?? null) : existing.parent_id;
    const parentChanged = parentId !== existing.parent_id;
    const kindChanged = kind !== existing.kind;

    if (existing.kind === 'root' && (kindChanged || parentChanged || input.isActive === false)) {
      throw new AppError(
        409,
        ErrorCodes.ORG_UNIT_ROOT_IMMUTABLE,
        'The root org unit cannot be moved, re-kinded or deactivated'
      );
    }

    const parent = parentId ? await getRawUnit(conn, parentId) : null;
    if (parentChanged || kindChanged) {
      await validateStructure(conn, { unitId: id, kind, parentId, parent });
    }
    if (kindChanged) {
      await validateChildrenForKind(conn, id, kind);
    }

    if (parentChanged) {
      if (parentId) {
        await assertWithinActorScope(actor, parentId);
      } else if (!actor || !actor.isGlobal) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, 'Only a global administrator can promote a root');
      }
    }

    const code = has('code') ? input.code : existing.code;
    if (code !== existing.code) await assertCodeAvailable(conn, code, id);

    const nameAr = has('nameAr') ? input.nameAr : existing.name_ar;
    const nameEn = has('nameEn') ? input.nameEn ?? null : existing.name_en;
    const sortOrder = has('sortOrder') ? input.sortOrder : Number(existing.sort_order);
    const isActive = has('isActive')
      ? input.isActive
        ? 1
        : 0
      : existing.is_active;
    const metadata = has('metadata')
      ? metadataForDb(input.metadata)
      : metadataForDb(existing.metadata);

    await conn.execute(
      `UPDATE org_units
       SET parent_id = ?, code = ?, name_ar = ?, name_en = ?, kind = ?,
           sort_order = ?, is_active = ?, metadata = ?
       WHERE id = ?`,
      [parentId, code, nameAr, nameEn, kind, sortOrder, isActive, metadata, id]
    );

    await writeAudit(conn, {
      actorUserId: actor?.id,
      action: parentChanged ? 'org_unit.move' : 'org_unit.update',
      entityId: id,
      metadata: {
        changed: Object.keys(input),
        ...(parentChanged ? { parentFrom: existing.parent_id, parentTo: parentId } : {}),
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return getUnitWithCount(conn, id);
  });
}

export async function moveOrgUnit(id, parentId, actor, ctx = {}) {
  return updateOrgUnit(id, { parentId }, actor, ctx);
}

export async function deleteOrgUnit(id, actor, ctx = {}) {
  return runTreeWrite(async (conn) => {
    await lockTree(conn);

    const existing = await getRawUnit(conn, id, { forUpdate: true });
    if (!existing) {
      throw new AppError(404, ErrorCodes.ORG_UNIT_NOT_FOUND, 'Org unit not found');
    }
    await assertWithinActorScope(actor, id);

    if (existing.kind === 'root') {
      throw new AppError(
        409,
        ErrorCodes.ORG_UNIT_ROOT_IMMUTABLE,
        'The Head of the Authority cannot be deleted'
      );
    }

    const [[childRow]] = await conn.execute(
      'SELECT COUNT(*) AS count FROM org_units WHERE parent_id = ? AND deleted_at IS NULL',
      [id]
    );
    if (Number(childRow.count) > 0) {
      throw new AppError(
        409,
        ErrorCodes.ORG_UNIT_HAS_CHILDREN,
        'Move or delete child org units first',
        [{ field: 'id', message: `${childRow.count} child unit(s) remain` }]
      );
    }

    const [[employeeRow]] = await conn.execute(
      'SELECT COUNT(*) AS count FROM employees WHERE org_unit_id = ? AND deleted_at IS NULL',
      [id]
    );
    if (Number(employeeRow.count) > 0) {
      throw new AppError(
        409,
        ErrorCodes.ORG_UNIT_HAS_EMPLOYEES,
        'Reassign employees before deleting this org unit',
        [{ field: 'id', message: `${employeeRow.count} employee(s) remain` }]
      );
    }

    await conn.execute(
      'UPDATE org_units SET deleted_at = UTC_TIMESTAMP(3), is_active = 0 WHERE id = ?',
      [id]
    );

    await writeAudit(conn, {
      actorUserId: actor?.id,
      action: 'org_unit.delete',
      entityId: id,
      metadata: { code: existing.code, parentId: existing.parent_id },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { id };
  });
}

export async function restoreOrgUnit(id, actor, ctx = {}) {
  return runTreeWrite(async (conn) => {
    await lockTree(conn);

    const existing = await getRawUnit(conn, id, { forUpdate: true, includeDeleted: true });
    if (!existing) {
      throw new AppError(404, ErrorCodes.ORG_UNIT_NOT_FOUND, 'Org unit not found');
    }
    if (!existing.deleted_at) {
      return getUnitWithCount(conn, id);
    }

    if (!actor || !actor.isGlobal) {
      if (!existing.parent_id) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, 'Only a global administrator can restore the root');
      }
      await assertWithinActorScope(actor, existing.parent_id);
    }

    if (existing.kind === 'root') {
      const [roots] = await conn.execute(
        `SELECT id FROM org_units
         WHERE parent_id IS NULL AND deleted_at IS NULL AND id <> ?
         LIMIT 1`,
        [id]
      );
      if (roots.length > 0) {
        throw new AppError(
          409,
          ErrorCodes.ORG_UNIT_ROOT_EXISTS,
          'An active Head of the Authority already exists'
        );
      }
    } else {
      const parent = await getRawUnit(conn, existing.parent_id);
      if (!parent) {
        throw new AppError(
          409,
          ErrorCodes.ORG_UNIT_PARENT_INVALID,
          'Restore the parent org unit first'
        );
      }
      if (!(parent.is_active === 1 || parent.is_active === true || parent.is_active === '1')) {
        throw new AppError(
          409,
          ErrorCodes.ORG_UNIT_PARENT_INVALID,
          'Activate the parent org unit before restoring this unit'
        );
      }
    }

    await conn.execute(
      'UPDATE org_units SET deleted_at = NULL, is_active = 1 WHERE id = ?',
      [id]
    );

    await writeAudit(conn, {
      actorUserId: actor?.id,
      action: 'org_unit.restore',
      entityId: id,
      metadata: { code: existing.code, parentId: existing.parent_id },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return getUnitWithCount(conn, id);
  });
}
