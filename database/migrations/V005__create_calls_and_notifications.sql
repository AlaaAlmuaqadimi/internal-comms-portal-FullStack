-- ============================================================================
-- V005 - Calls and notifications
-- MySQL 8.0.16+
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Store UTC timestamps and integer duration. The UI "incoming / outgoing /
-- missed" label is derived per viewer, not stored as localized text.
CREATE TABLE IF NOT EXISTS calls (
  id                 CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  caller_employee_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  callee_employee_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  call_type          ENUM('audio','video') NOT NULL DEFAULT 'audio',
  status             ENUM('ringing','answered','missed','declined','cancelled','ended','failed') NOT NULL DEFAULT 'ringing',
  initiated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  answered_at        DATETIME(3) NULL,
  ended_at           DATETIME(3) NULL,
  duration_seconds   INT NOT NULL DEFAULT 0,
  ended_reason       VARCHAR(64) NULL,
  is_kitchen_call    TINYINT(1) NOT NULL DEFAULT 0,
  metadata           JSON NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_calls_caller (caller_employee_id, initiated_at DESC),
  KEY idx_calls_callee (callee_employee_id, initiated_at DESC),
  KEY idx_calls_status (status),
  CONSTRAINT chk_calls_distinct_parties CHECK (caller_employee_id <> callee_employee_id),
  CONSTRAINT chk_calls_duration CHECK (duration_seconds >= 0),
  CONSTRAINT fk_calls_caller
    FOREIGN KEY (caller_employee_id) REFERENCES employees (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_calls_callee
    FOREIGN KEY (callee_employee_id) REFERENCES employees (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id                 CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  type               ENUM('announcement','administrative','meeting','message','system','missed_call') NOT NULL,
  title_ar           VARCHAR(255) NOT NULL,
  title_en           VARCHAR(255) NULL,
  summary_ar         VARCHAR(500) NULL,
  summary_en         VARCHAR(500) NULL,
  body_ar            TEXT NOT NULL,
  body_en            TEXT NULL,
  icon               VARCHAR(64) NULL,
  priority           SMALLINT NOT NULL DEFAULT 0,
  audience           ENUM('all','selected','org_unit','role') NOT NULL DEFAULT 'all',
  target_org_unit_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  target_role_id     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  published_at       DATETIME(3) NULL,
  expires_at         DATETIME(3) NULL,
  metadata           JSON NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at         DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_published (published_at DESC),
  KEY idx_notifications_audience (audience),
  KEY idx_notifications_target_org (target_org_unit_id),
  KEY idx_notifications_target_role (target_role_id),
  KEY idx_notifications_created_by (created_by_user_id),
  CONSTRAINT fk_notifications_target_org
    FOREIGN KEY (target_org_unit_id) REFERENCES org_units (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_target_role
    FOREIGN KEY (target_role_id) REFERENCES roles (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Read state is per recipient. MySQL has no partial indexes, so the
-- (employee_id, read_at) index is used for unread counts.
CREATE TABLE IF NOT EXISTS notification_recipients (
  notification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  employee_id     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  delivered_at    DATETIME(3) NULL,
  read_at         DATETIME(3) NULL,
  PRIMARY KEY (notification_id, employee_id),
  KEY idx_notification_recipients_employee (employee_id, read_at),
  CONSTRAINT fk_notification_recipients_notification
    FOREIGN KEY (notification_id) REFERENCES notifications (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notification_recipients_employee
    FOREIGN KEY (employee_id) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
