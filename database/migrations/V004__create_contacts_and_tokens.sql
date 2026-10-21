-- ============================================================================
-- V004 - Contact allowlist and authentication token tables
-- MySQL 8.0.16+
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Directed allowlist replacing the legacy users.allowedContacts[] array.
CREATE TABLE IF NOT EXISTS employee_contacts (
  owner_employee_id   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contact_employee_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_employee_id, contact_employee_id),
  KEY idx_employee_contacts_contact (contact_employee_id),
  CONSTRAINT chk_employee_contacts_not_self
    CHECK (owner_employee_id <> contact_employee_id),
  CONSTRAINT fk_employee_contacts_owner
    FOREIGN KEY (owner_employee_id) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_employee_contacts_contact
    FOREIGN KEY (contact_employee_id) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opaque refresh tokens are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  user_id              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  family_id            CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash           BINARY(32) NOT NULL,
  user_agent           VARCHAR(512) NULL,
  ip                   VARCHAR(45) NULL,
  expires_at           DATETIME(3) NOT NULL,
  revoked_at           DATETIME(3) NULL,
  replaced_by_token_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at         DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_family (family_id),
  KEY idx_refresh_tokens_expiry (expires_at),
  KEY idx_refresh_tokens_replaced_by (replaced_by_token_id),
  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_refresh_tokens_replaced_by
    FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  user_id      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash   BINARY(32) NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  used_at      DATETIME(3) NULL,
  requested_ip VARCHAR(45) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
  KEY idx_password_reset_tokens_user (user_id),
  KEY idx_password_reset_tokens_expiry (expires_at),
  CONSTRAINT fk_password_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_tokens (
  id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  user_id      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expo_token   VARCHAR(255) NOT NULL,
  platform     ENUM('ios','android') NOT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NULL,
  revoked_at   DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_tokens_expo (expo_token),
  KEY idx_device_tokens_user (user_id),
  CONSTRAINT fk_device_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
