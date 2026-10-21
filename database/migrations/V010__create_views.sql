-- ============================================================================
-- V010 - Read views used by the API
-- MySQL 8.0.16+
-- ============================================================================

SET NAMES utf8mb4;

CREATE OR REPLACE VIEW v_employee_unread_counts AS
SELECT
  nr.employee_id,
  COUNT(*) AS unread_count
FROM notification_recipients nr
WHERE nr.read_at IS NULL
GROUP BY nr.employee_id;

-- Raw call history with both parties resolved. The API derives the viewer's
-- "incoming / outgoing / missed" label from caller_employee_id/callee/status.
CREATE OR REPLACE VIEW v_call_history AS
SELECT
  c.id,
  c.caller_employee_id,
  caller.full_name_ar AS caller_name_ar,
  caller.full_name_en AS caller_name_en,
  c.callee_employee_id,
  callee.full_name_ar AS callee_name_ar,
  callee.full_name_en AS callee_name_en,
  c.call_type,
  c.status,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.duration_seconds,
  c.is_kitchen_call
FROM calls c
JOIN employees caller ON caller.id = c.caller_employee_id
JOIN employees callee ON callee.id = c.callee_employee_id;
