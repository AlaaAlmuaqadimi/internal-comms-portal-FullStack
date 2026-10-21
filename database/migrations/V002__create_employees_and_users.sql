-- ============================================================================
-- V002 - Employees (directory) and users (login credentials)
-- MySQL 8.0.16+
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Directory entries. Every callable person is an employee, whether or not
-- they have a login account.
CREATE TABLE IF NOT EXISTS employees (
  id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  org_unit_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code         VARCHAR(64)  NOT NULL,
  full_name_ar VARCHAR(255) NOT NULL,
  full_name_en VARCHAR(255) NULL,
  job_title_ar VARCHAR(255) NULL,
  job_title_en VARCHAR(255) NULL,
  phone        VARBINARY(512) NULL,          -- application-layer encrypted
  extension    VARCHAR(32)  NULL,
  email        VARCHAR(255) NULL,
  avatar_url   VARCHAR(1024) NULL,
  presence     ENUM('online','offline','away','busy') NOT NULL DEFAULT 'offline',
  is_kitchen   TINYINT(1)   NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  metadata     JSON         NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at   DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employees_code (code),
  UNIQUE KEY uq_employees_email (email),
  KEY idx_employees_org_unit (org_unit_id),
  KEY idx_employees_presence (presence),
  KEY idx_employees_active (is_active, deleted_at),
  CONSTRAINT fk_employees_org_unit
    FOREIGN KEY (org_unit_id) REFERENCES org_units (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1:1 login account. username/email columns use the table's ai_ci collation,
-- so uniqueness is case-insensitive. Normalize usernames in the API as well.
CREATE TABLE IF NOT EXISTS users (
  id                  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  employee_id         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  username            VARCHAR(64)  NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,   -- Argon2id encoded (salt+params embedded)
  password_algo       VARCHAR(32)  NOT NULL DEFAULT 'argon2id',
  password_changed_at DATETIME(3)  NULL,
  failed_login_count  INT          NOT NULL DEFAULT 0,
  locked_until        DATETIME(3)  NULL,
  mfa_enabled         TINYINT(1)   NOT NULL DEFAULT 0,
  mfa_secret_enc      VARBINARY(512) NULL,     -- application-layer encrypted TOTP secret
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at       DATETIME(3)  NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at          DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_employee (employee_id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_active (is_active, deleted_at),
  CONSTRAINT fk_users_employee
    FOREIGN KEY (employee_id) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_users_failed_logins CHECK (failed_login_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
