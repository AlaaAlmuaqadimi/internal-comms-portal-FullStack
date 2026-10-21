-- ============================================================================
-- V003 - Roles, permissions, scoped role assignments and user settings
-- MySQL 8.0.16+
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS roles (
  id         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  code       VARCHAR(64)  NOT NULL,
  name_ar    VARCHAR(255) NOT NULL,
  name_en    VARCHAR(255) NULL,
  is_system  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  code        VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  permission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES permissions (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- scope_org_unit_id NULL means "global". MySQL unique indexes permit multiple
-- NULLs, so a stored generated column collapses NULL to the zero UUID to make
-- (user, role, scope) truly unique.
CREATE TABLE IF NOT EXISTS user_roles (
  id                CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  user_id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope_org_unit_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  scope_key         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin
                      GENERATED ALWAYS AS (IFNULL(scope_org_unit_id, _ascii'00000000-0000-0000-0000-000000000000')) STORED,
  granted_by        CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  granted_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_roles (user_id, role_id, scope_key),
  KEY idx_user_roles_role (role_id),
  KEY idx_user_roles_scope (scope_org_unit_id),
  KEY idx_user_roles_granted_by (granted_by),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_user_roles_scope
    FOREIGN KEY (scope_org_unit_id) REFERENCES org_units (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_user_roles_granted_by
    FOREIGN KEY (granted_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id           CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  language          CHAR(2)  NOT NULL DEFAULT 'ar',
  theme             VARCHAR(32) NOT NULL DEFAULT 'system',
  kitchen_choice_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  push_enabled      TINYINT(1) NOT NULL DEFAULT 1,
  preferences       JSON     NULL,
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY idx_user_settings_kitchen (kitchen_choice_id),
  CONSTRAINT chk_user_settings_language CHECK (language IN ('ar','en')),
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_user_settings_kitchen
    FOREIGN KEY (kitchen_choice_id) REFERENCES kitchens (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
