-- ============================================================================
-- Organization tree queries (MySQL 8.0 WITH RECURSIVE)
-- These replace PostgreSQL ltree operations. Not migrations - reference queries.
-- Raise the recursion guard if the tree ever grows deep:
--   SET SESSION cte_max_recursion_depth = 10000;
-- ============================================================================

-- 1) Subtree of a unit (by code), depth-first order
WITH RECURSIVE subtree AS (
  SELECT u.id, u.parent_id, u.code, u.name_ar, u.kind, u.is_active, 0 AS depth,
         CAST(u.name_ar AS CHAR(2000)) AS path
  FROM org_units u
  WHERE u.code = 'u36' AND u.deleted_at IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.code, c.name_ar, c.kind, c.is_active, s.depth + 1,
         CAST(CONCAT(s.path, ' / ', c.name_ar) AS CHAR(2000))
  FROM org_units c
  JOIN subtree s ON c.parent_id = s.id
  WHERE c.deleted_at IS NULL
)
SELECT id, parent_id, code, name_ar, kind, is_active, depth, path
FROM subtree
ORDER BY path;

-- 2) Ancestors of a unit (path back to root)
WITH RECURSIVE ancestors AS (
  SELECT u.id, u.parent_id, u.code, u.name_ar, u.kind, 0 AS depth
  FROM org_units u
  WHERE u.id = '00000000-0000-0000-0000-000000000000'   -- supplied unit id
  UNION ALL
  SELECT p.id, p.parent_id, p.code, p.name_ar, p.kind, a.depth + 1
  FROM org_units p
  JOIN ancestors a ON p.id = a.parent_id
)
SELECT id, code, name_ar, kind, depth
FROM ancestors
ORDER BY depth DESC;   -- root first

-- 3) Flat list of the whole tree with depth + display path, for API assembly
WITH RECURSIVE tree AS (
  SELECT u.id, u.parent_id, u.code, u.name_ar, u.kind, u.sort_order, 0 AS depth,
         CAST(u.name_ar AS CHAR(2000)) AS path
  FROM org_units u
  WHERE u.parent_id IS NULL AND u.deleted_at IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.code, c.name_ar, c.kind, c.sort_order, t.depth + 1,
         CAST(CONCAT(t.path, ' / ', c.name_ar) AS CHAR(2000))
  FROM org_units c
  JOIN tree t ON c.parent_id = t.id
  WHERE c.deleted_at IS NULL
)
SELECT id, parent_id, code, name_ar, kind, sort_order, depth, path
FROM tree
ORDER BY path;

-- 4) JSON array of the flat tree. The API nests children (O(n)) or the mobile
--    app can do it from this payload. MySQL's JSON_ARRAYAGG has no ORDER BY,
--    so aggregate from an ordered derived table.
SELECT JSON_ARRAYAGG(
         JSON_OBJECT(
           'id', t.id,
           'parentId', t.parent_id,
           'code', t.code,
           'nameAr', t.name_ar,
           'kind', t.kind,
           'depth', t.depth
         )
       ) AS tree_json
FROM (
  WITH RECURSIVE walk AS (
    SELECT u.id, u.parent_id, u.code, u.name_ar, u.kind, u.sort_order, 0 AS depth
    FROM org_units u
    WHERE u.parent_id IS NULL AND u.deleted_at IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.code, c.name_ar, c.kind, c.sort_order, w.depth + 1
    FROM org_units c
    JOIN walk w ON c.parent_id = w.id
    WHERE c.deleted_at IS NULL
  )
  SELECT * FROM walk ORDER BY depth, sort_order
) AS t;

-- 5) Cycle guard used before a move. If the proposed parent appears in the
--    descendants of the moving unit (including the unit itself), reject.
WITH RECURSIVE descendants AS (
  SELECT id FROM org_units WHERE id = '00000000-0000-0000-0000-000000000000' -- moving unit
  UNION ALL
  SELECT o.id
  FROM org_units o
  JOIN descendants d ON o.parent_id = d.id
)
SELECT 1 AS would_create_cycle
FROM descendants
WHERE id = '00000000-0000-0000-0000-000000000001'  -- proposed parent
LIMIT 1;

-- 6) Scope-aware list: union of the subtrees granted to a principal. Replace
--    the IN list with the scopes from user_roles.scope_org_unit_id.
WITH RECURSIVE scoped AS (
  SELECT id FROM org_units
  WHERE id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  )
    AND deleted_at IS NULL
  UNION
  SELECT o.id
  FROM org_units o
  JOIN scoped s ON o.parent_id = s.id
  WHERE o.deleted_at IS NULL
)
SELECT u.id, u.parent_id, u.code, u.name_ar, u.kind, u.sort_order, u.is_active
FROM org_units u
JOIN scoped s ON s.id = u.id
WHERE u.deleted_at IS NULL
ORDER BY u.sort_order, u.name_ar;

-- 7) Direct children, ordered for the tree builder.
SELECT id, parent_id, code, name_ar, name_en, kind, sort_order, is_active
FROM org_units
WHERE parent_id = '00000000-0000-0000-0000-000000000000'
  AND deleted_at IS NULL
ORDER BY sort_order, name_ar;

-- 8) V012 post-condition: this must return ZERO rows. Any row means a legacy
--    regional unit is still parented to u35/u75.
SELECT child.code, child.parent_id, p.code AS obsolete_parent
FROM org_units child
JOIN org_units p ON p.id = child.parent_id
WHERE p.code IN ('u35', 'u75');

-- 9) V012 verification: all 27 seeded regional directorates must point directly
--    at the single active root.
SELECT r.code, r.parent_id, root.id AS expected_root_id,
       (r.parent_id = root.id) AS is_normalized
FROM org_units r
CROSS JOIN (
  SELECT id FROM org_units
  WHERE kind = 'root' AND parent_id IS NULL AND deleted_at IS NULL
  LIMIT 1
) root
WHERE r.code IN (
  'u24','u25','u26','u27','u28','u29','u30','u31','u32','u33','u34',
  'u59','u60','u61','u62','u63','u64','u65','u66','u67','u68','u69','u70',
  'u71','u72','u73','u74'
)
ORDER BY r.sort_order, r.name_ar;

-- 10) V009 reporting lines: the Head office, deputy, five sub-offices and the
--     four general administrations must be direct children of the Head (u77).
--     `reports_to_head` must be 1 for every row.
SELECT u.code, u.kind, u.sort_order, p.code AS parent_code,
       (p.code = 'u77') AS reports_to_head
FROM org_units u
LEFT JOIN org_units p ON p.id = u.parent_id
WHERE u.code IN (
  'u36','u76','u1','u2','u3','u4','u5','u8','u15','u19','u23'
)
  AND u.deleted_at IS NULL
ORDER BY u.sort_order, u.code;

-- 11) V009 post-condition: each administration keeps its own sections. This
--     must return exactly these 14 section rows, all parented to their
--     administration (never directly to u77).
SELECT c.code, p.code AS parent_code, c.kind
FROM org_units c
JOIN org_units p ON p.id = c.parent_id
WHERE c.deleted_at IS NULL
  AND c.code IN (
    'u6','u7',
    'u9','u10','u11','u12','u13','u14',
    'u16','u17','u18',
    'u20','u21','u22'
  )
ORDER BY p.code, c.code;
