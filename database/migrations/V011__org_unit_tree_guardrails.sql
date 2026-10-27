-- ============================================================================
-- V011 - Org unit tree guardrails
-- MySQL 8.0.16+ / MariaDB 10.4+
--
-- V001 already defines the self-referencing adjacency list:
--   org_units.parent_id -> org_units.id
--
-- This migration adds the invariants the API relies on:
--   1. Exactly one active root (the Head of the Authority / رئيس المصلحة).
--   2. `kind = 'root'` always has parent_id = NULL; every other kind has a
--      parent. (A branch reporting "to the top" points at the root id, it is
--      not itself parentless.)
--   3. A covering index for ordered child lookups.
--
-- Business-kind mapping used by the API:
--   root        -> Head of the Authority (رئيس المصلحة)
--   deputy      -> Deputy Head (نائب رئيس المصلحة), optional
--   directorate -> General Administration (إدارة عامة / إدارة)
--   office      -> Branch / Regional Office / staff office (مكتب / فرع)
--   section     -> Department (قسم)
--   group       -> Legacy grouping node, kept for backwards compatibility
--
-- The statements are written with information_schema guards so the repo's
-- non-tracking migration runner can safely re-apply every V*.sql file.
-- Flyway also accepts them as a normal versioned migration.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) One active root. A stored generated column is NULL for non-roots and for
--    soft-deleted roots, so the unique index permits historical roots after a
--    soft delete while still rejecting two live Heads.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units
       ADD COLUMN active_root_key TINYINT
         GENERATED ALWAYS AS (
           CASE WHEN parent_id IS NULL AND deleted_at IS NULL THEN 1 ELSE NULL END
         ) STORED',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND COLUMN_NAME = 'active_root_key'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units
       ADD UNIQUE KEY uq_org_units_active_root (active_root_key)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND INDEX_NAME = 'uq_org_units_active_root'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Root/parent consistency. Existing legacy data satisfies this: the seed
--    has exactly one parentless root and every other unit has a parent.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units
       ADD CONSTRAINT chk_org_units_root_parent
       CHECK (
         (kind = ''root'' AND parent_id IS NULL)
         OR (kind <> ''root'' AND parent_id IS NOT NULL)
       )',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND CONSTRAINT_NAME = 'chk_org_units_root_parent'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Ordered child lookups for the tree builder.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units
       ADD KEY idx_org_units_parent_order
         (parent_id, is_active, sort_order, name_ar)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND INDEX_NAME = 'idx_org_units_parent_order'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
