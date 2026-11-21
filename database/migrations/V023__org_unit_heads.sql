-- ============================================================================
-- V023 - Unit heads (مدير الوحدة)
--
-- Every directorate, office and section can name ONE head: the employee who
-- runs it. The head is chosen explicitly by an admin (never guessed from the
-- tree), and is what lets a unit head call the Director and the Deputy.
--
--   org_units.head_employee_id  -> employees.id
--     * UNIQUE: one person heads at most one unit;
--     * ON DELETE SET NULL: deleting the employee frees the unit;
--     * the application also checks the head belongs to that unit and clears
--       the head when the employee moves unit or is deactivated.
--
-- Idempotent: the runner replays every file on every run, so every DDL
-- statement is guarded through information_schema and run with PREPARE
-- (same pattern as V016 / V020).
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) Column.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units
       ADD COLUMN head_employee_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND COLUMN_NAME = 'head_employee_id'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) One unit per head.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units ADD UNIQUE KEY uq_org_units_head (head_employee_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND INDEX_NAME = 'uq_org_units_head'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Foreign key to employees.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE org_units
       ADD CONSTRAINT fk_org_units_head
       FOREIGN KEY (head_employee_id) REFERENCES employees (id)
       ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'org_units'
    AND CONSTRAINT_NAME = 'fk_org_units_head'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
