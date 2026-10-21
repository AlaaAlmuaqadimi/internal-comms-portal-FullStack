-- ============================================================================
-- V006 - Audit log and login attempts
-- MySQL 8.0.16+
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- High-volume append-only audit trail uses BIGINT AUTO_INCREMENT.
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(64) NULL,
  entity_id     VARCHAR(64) NULL,
  ip            VARCHAR(45) NULL,
  user_agent    VARCHAR(512) NULL,
  metadata      JSON NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_log_actor (actor_user_id, created_at DESC),
  KEY idx_audit_log_entity (entity_type, entity_id),
  KEY idx_audit_log_created (created_at DESC),
  CONSTRAINT fk_audit_log_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username   VARCHAR(64) NULL,
  ip         VARCHAR(45) NULL,
  success    TINYINT(1) NOT NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_login_attempts_username (username, created_at DESC),
  KEY idx_login_attempts_ip (ip, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
