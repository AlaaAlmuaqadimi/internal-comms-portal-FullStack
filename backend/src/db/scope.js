import { pool } from './pool.js';

/**
 * Returns true when `targetOrgUnitId` is inside the subtree rooted at
 * `scopeOrgUnitId` (inclusive). Used by requirePermission to enforce the
 * org-scoped rows in user_roles via a recursive CTE.
 */
export async function isOrgUnitWithinScope(scopeOrgUnitId, targetOrgUnitId) {
  if (!scopeOrgUnitId || !targetOrgUnitId) return false;
  if (scopeOrgUnitId === targetOrgUnitId) return true;

  const [rows] = await pool.execute(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM org_units WHERE id = ?
       UNION ALL
       SELECT o.id
       FROM org_units o
       JOIN subtree s ON o.parent_id = s.id
       WHERE o.deleted_at IS NULL
     )
     SELECT 1 AS found FROM subtree WHERE id = ? LIMIT 1`,
    [scopeOrgUnitId, targetOrgUnitId]
  );
  return rows.length > 0;
}

/**
 * Builds a human-readable "Root / Directorate / Section" path for an org unit.
 */
export async function getOrgUnitPath(orgUnitId) {
  const hierarchy = await getOrgUnitHierarchy(orgUnitId);
  return hierarchy ? hierarchy.path : null;
}

/**
 * Loads the full ancestor chain of an org unit (root first) and derives the
 * management / office labels used by the mobile profile screen.
 *
 *   management = nearest directorate (إدارة) ancestor, else nearest office,
 *                deputy or root ancestor, else the unit itself.
 *   office     = the selected unit name (the person's own مكتب/قسم).
 *
 * Returns null when the unit does not exist.
 */
export async function getOrgUnitHierarchy(orgUnitId) {
  if (!orgUnitId) return null;
  const [rows] = await pool.execute(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, name_ar, name_en, kind, 0 AS depth
       FROM org_units WHERE id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT o.id, o.parent_id, o.name_ar, o.name_en, o.kind, a.depth + 1
       FROM org_units o
       JOIN ancestors a ON o.id = a.parent_id
       WHERE o.deleted_at IS NULL
     )
     SELECT id, name_ar, name_en, kind, depth
     FROM ancestors ORDER BY depth DESC`,
    [orgUnitId]
  );
  if (rows.length === 0) return null;

  const unit = rows[rows.length - 1];
  const managementUnit =
    [...rows].reverse().find((r) => r.kind === 'directorate') ||
    [...rows].reverse().find((r) => ['office', 'deputy', 'root'].includes(r.kind)) ||
    unit;

  return {
    unitId: unit.id,
    unitName: unit.name_ar,
    unitNameEn: unit.name_en,
    kind: unit.kind,
    path: rows.map((r) => r.name_ar).join(' / '),
    pathEn: rows.map((r) => r.name_en || r.name_ar).join(' / '),
    management: managementUnit.name_ar,
    managementEn: managementUnit.name_en || managementUnit.name_ar,
    office: unit.name_ar,
    officeEn: unit.name_en || unit.name_ar,
    ancestors: rows.map((r) => ({
      id: r.id,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      kind: r.kind,
      depth: r.depth,
    })),
  };
}
