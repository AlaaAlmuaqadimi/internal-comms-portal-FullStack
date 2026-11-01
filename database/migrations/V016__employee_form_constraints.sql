-- ============================================================================
-- V016 - Employee form constraints
-- MySQL 8.0.16+ / MariaDB 10.4+
--
-- The "Add Employee" form requires that an extension number is strictly unique
-- across *active* employees. A plain unique index on `extension` would also
-- block re-use of an extension after an employee is deactivated or soft
-- deleted, so we add a generated column that is NULL unless the row is active,
-- and put the unique index on that column. Multiple NULLs are allowed, which
-- makes the constraint exactly "unique among active employees".
--
-- Idempotent: every DDL statement is guarded through information_schema and
-- executed with PREPARE, matching V011. The migration runner replays all files
-- on every run.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) Generated helper column.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE employees
       ADD COLUMN active_extension VARCHAR(32)
         GENERATED ALWAYS AS (
           CASE
             WHEN is_active = 1 AND deleted_at IS NULL
               AND extension IS NOT NULL AND extension <> ''''
             THEN extension
             ELSE NULL
           END
         ) STORED',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'active_extension'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Uniqueness among active employees.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE employees
       ADD UNIQUE KEY uq_employees_active_extension (active_extension)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND INDEX_NAME = 'uq_employees_active_extension'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
