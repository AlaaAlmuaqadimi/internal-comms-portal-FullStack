-- ============================================================================
-- V021 - Push tokens (Phase D: ring when the app is closed)
--
-- One row per phone that can receive an incoming-call push. The token is the
-- FCM registration token the app gets from Firebase; it only lets someone who
-- also holds our server credentials send a push to that phone, so it is stored
-- as is. The employee id is copied from the user so the call fan-out can find
-- the callee's phones without a join.
--
-- The older `device_tokens` table (V004, Expo tokens) was never used and is
-- left untouched.
--
-- Idempotent: the runner replays every file on every run.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS push_tokens (
  id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  user_id      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  employee_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider     ENUM('fcm') NOT NULL DEFAULT 'fcm',
  platform     ENUM('android','ios') NOT NULL,
  token        VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_tokens_token (token),
  KEY idx_push_tokens_employee (employee_id, last_seen_at),
  KEY idx_push_tokens_user (user_id),
  CONSTRAINT fk_push_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_push_tokens_employee
    FOREIGN KEY (employee_id) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
