-- ============================================================================
-- V019 - Align calls.status with the signalling lifecycle
--
-- Phase A used the legacy status names `answered` and `declined`. Phase B's
-- signalling state machine uses `accepted` and `rejected`, and adds `busy` for
-- a callee that is already in a call. This migration performs the safe
-- three-step ENUM change:
--
--   1. expand  - allow old and new values side by side
--   2. update  - rewrite existing rows to the new values
--   3. shrink  - keep only the final value set
--
-- The migration runner replays every file, so each step is idempotent:
-- re-running the expand on an already-shrunk column is valid because the
-- existing rows are a subset of the expanded set, and the UPDATEs then match
-- no rows.
--
-- What this migration does NOT add (still pending, planned for Phase B):
--   * calls.kind
--   * a call_participants table
--   * calls.ring_expires_at
-- The ring timeout is currently represented by `ringing` + `initiated_at`
-- plus CALL_RING_TIMEOUT_SECONDS, and will get its own column when the
-- signalling module lands.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Expand: old and new values coexist.
ALTER TABLE calls
  MODIFY COLUMN status
    ENUM('ringing','answered','declined','accepted','rejected','missed','cancelled','ended','busy','failed')
    NOT NULL DEFAULT 'ringing';

-- 2. Rewrite existing data.
UPDATE calls SET status = 'accepted' WHERE status = 'answered';
UPDATE calls SET status = 'rejected' WHERE status = 'declined';

UPDATE calls
   SET ended_reason = 'rejected'
 WHERE status = 'rejected'
   AND (ended_reason IS NULL OR ended_reason = 'declined');

-- 3. Shrink to the final value set.
ALTER TABLE calls
  MODIFY COLUMN status
    ENUM('ringing','accepted','rejected','missed','cancelled','ended','busy','failed')
    NOT NULL DEFAULT 'ringing';
