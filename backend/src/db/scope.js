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
  if (!orgUnitId) return null;
  const [rows] = await pool.execute(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, name_ar, 0 AS depth
       FROM org_units WHERE id = ?
       UNION ALL
       SELECT o.id, o.parent_id, o.name_ar, a.depth + 1
       FROM org_units o
       JOIN ancestors a ON o.id = a.parent_id
     )
     SELECT name_ar FROM ancestors ORDER BY depth DESC`,
    [orgUnitId]
  );
  return rows.map((r) => r.name_ar).join(' / ');
}
