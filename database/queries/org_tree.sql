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
