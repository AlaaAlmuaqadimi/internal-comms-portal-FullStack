-- ============================================================================
-- V012 - Normalize the legacy regional org tree
-- MySQL 8.0.16+ / MariaDB 10.4+
--
-- V009 keeps the 27 regional directorates under two legacy `group` containers:
--   u35 -> Head office branch  (u24..u34, 11 units)
--   u75 -> deputy branch       (u59..u74, 16 units)
--
-- u35 (Regional Executive Administrations) is a real unit in the current
-- model: it reports to the Head of the Authority and keeps its 11 regional
-- directorates (u24..u34) beneath it, so this migration does not touch it.
--
-- u75 is only a legacy deputy-level container. The current reporting model
-- puts those regional administrations directly under the Head of the
-- Authority (the single active `root` unit), so this migration moves every
-- direct child of u75 to the root.
--
-- Guarantees:
--   * Idempotent: after the first run the children no longer match
--     `parent_id = u75`, so re-running is a no-op.
--   * Non-destructive: only `parent_id` and presentation `sort_order` change.
--     The legacy group rows and all descendants of the regional units remain
--     untouched. (The seed group has no employees, role scopes, kitchens or
--     notifications, so no other table needs rewriting.)
--   * Cross-engine: plain UPDATE/JOIN + user variable works on MySQL 8 and
--     MariaDB 10.4 without window functions or vendor-specific DDL.
--   * Safe when the root or group is missing: the UPDATE affects zero rows.
--   * Includes soft-deleted children so a later restore also lands under the
--     root instead of the obsolete group container.
--
-- Sort order:
--   Existing root children keep their values. Reparented regions are appended
--   after them and keep their legacy relative order:
--     u75 children: 2000 + position in u59..u74
--   Positions are derived from the code list, not from the current
--   sort_order, so re-normalizing a unit that was manually moved back into the
--   group remains deterministic.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

SET @root_id = (
  SELECT id
  FROM org_units
  WHERE kind = 'root'
    AND parent_id IS NULL
    AND deleted_at IS NULL
  LIMIT 1
);

SET @u75_order = 'u59,u60,u61,u62,u63,u64,u65,u66,u67,u68,u69,u70,u71,u72,u73,u74' COLLATE utf8mb4_unicode_ci;

UPDATE org_units child
JOIN org_units grp ON grp.id = child.parent_id
SET child.parent_id = @root_id,
    child.sort_order = 2000 + IF(
      FIND_IN_SET(child.code COLLATE utf8mb4_unicode_ci, @u75_order) > 0,
      FIND_IN_SET(child.code COLLATE utf8mb4_unicode_ci, @u75_order) - 1,
      child.sort_order
    )
WHERE @root_id IS NOT NULL
  AND grp.code = 'u75'
  AND child.id <> @root_id;

-- Post-condition when the legacy seed is present: zero rows.
-- Kept as a comment so the non-tracking migration runner can re-apply the file
-- without returning result sets:
--   SELECT child.code, p.code AS obsolete_parent
--   FROM org_units child
--   JOIN org_units p ON p.id = child.parent_id
--   WHERE p.code = 'u75';
