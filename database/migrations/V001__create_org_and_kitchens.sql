-- ============================================================================
-- V001 - Organization tree and kitchens
-- MySQL 8.0.16+ (CHECK constraints enforced), InnoDB, utf8mb4
-- Flyway-compatible migration naming. Run files in version order.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Adjacency-list org tree. Recursive CTEs (MySQL 8.0 WITH RECURSIVE) are used
-- for subtree/ancestor queries instead of PostgreSQL ltree.
CREATE TABLE IF NOT EXISTS org_units (
  id          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  parent_id   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  code        VARCHAR(64)  NOT NULL,
  name_ar     VARCHAR(255) NOT NULL,
  name_en     VARCHAR(255) NULL,
  kind        ENUM('root','deputy','office','directorate','section','group') NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  metadata    JSON         NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_units_code (code),
  KEY idx_org_units_parent (parent_id),
  KEY idx_org_units_kind (kind),
  KEY idx_org_units_active (is_active, deleted_at),
  CONSTRAINT fk_org_units_parent
    FOREIGN KEY (parent_id) REFERENCES org_units (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_org_units_parent_not_self
    CHECK (parent_id IS NULL OR parent_id <> id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kitchens (
  id          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  code        VARCHAR(64)  NOT NULL,
  name_ar     VARCHAR(255) NOT NULL,
  name_en     VARCHAR(255) NULL,
  scope_ar    VARCHAR(500) NULL,
  scope_en    VARCHAR(500) NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  metadata    JSON         NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_kitchens_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A unit may be served by more than one kitchen and a kitchen serves many units.
CREATE TABLE IF NOT EXISTS org_unit_kitchens (
  org_unit_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kitchen_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_unit_id, kitchen_id),
  KEY idx_org_unit_kitchens_kitchen (kitchen_id),
  CONSTRAINT fk_org_unit_kitchens_unit
    FOREIGN KEY (org_unit_id) REFERENCES org_units (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_org_unit_kitchens_kitchen
    FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
