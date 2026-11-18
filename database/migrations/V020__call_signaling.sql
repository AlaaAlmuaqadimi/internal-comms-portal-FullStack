-- ============================================================================
-- V020 - Call signalling support
--
-- The Phase B signalling server needs a durable ring deadline so that:
--   * an in-process ring timer can be re-armed after a restart;
--   * the boot sweep can mark calls that expired while the server was down;
--   * a second API instance (Phase F) can find expired ringing rows.
--
-- This migration is idempotent because the runner replays every file on every
-- run. Every DDL statement is guarded through information_schema and executed
-- with PREPARE, matching V016.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) Add calls.ring_expires_at.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE calls
       ADD COLUMN ring_expires_at DATETIME(3) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'calls'
    AND COLUMN_NAME = 'ring_expires_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Backfill existing ringing rows. The value is only a deadline hint; the
--    signalling boot sweep also falls back to initiated_at + timeout for rows
--    that predate this migration.
UPDATE calls
   SET ring_expires_at = DATE_ADD(initiated_at, INTERVAL 45 SECOND)
 WHERE status = 'ringing'
   AND ring_expires_at IS NULL;

-- 3) Index used by the boot sweep and the ring-expiry job.
SET @ddl = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE calls
       ADD KEY idx_calls_ringing_expiry (status, ring_expires_at)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'calls'
    AND INDEX_NAME = 'idx_calls_ringing_expiry'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
