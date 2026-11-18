-- ============================================================================
-- V018 - Call policy settings
-- MySQL 8.0.16+ / MariaDB 10.4+
--
-- Small key/value store for administrator-editable application settings. The
-- first consumers are the labels shown to a callee when a call from the
-- Director or Deputy is redacted. Employee contact lists are deliberately not
-- used for call authorization; they remain a favourites list only.
--
-- Idempotent: the migration runner replays every file, so the table is created
-- with IF NOT EXISTS and the seed only inserts keys that do not exist yet. An
-- administrator's edited label is therefore never overwritten by a re-run.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS app_settings (
  `key`        VARCHAR(128) NOT NULL,
  `value`      TEXT         NOT NULL,
  updated_by   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                            ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`),
  KEY idx_app_settings_updated_by (updated_by),
  CONSTRAINT fk_app_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (`key`, `value`, updated_by, updated_at)
VALUES
  ('call.redacted_label.director', 'المدير العام', NULL, UTC_TIMESTAMP(3)),
  ('call.redacted_label.deputy',   'وكيل المصلحة', NULL, UTC_TIMESTAMP(3));
