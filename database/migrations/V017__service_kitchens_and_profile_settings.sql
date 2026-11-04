-- ============================================================================
-- V017 - Service kitchens, profile settings persistence and avatar storage
--
-- Idempotent: the migration runner re-applies every file on each run, so all
-- statements are written to be safe to execute more than once.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ----------------------------------------------------------------------------
-- 1. The five in-building service kitchens.
--    Locations are fixed by the administration; kitchen 2 and 3 share the same
--    floor/building and are distinguished by name only.
-- ----------------------------------------------------------------------------
INSERT INTO kitchens (code, name_ar, name_en, scope_ar, scope_en, is_active)
VALUES
  ('k-service-1', 'مطبخ 1', 'Kitchen 1', 'الدور الأول - المبنى الثاني',  'First floor - Building 2',  1),
  ('k-service-2', 'مطبخ 2', 'Kitchen 2', 'الدور الثالث - المبنى الثاني', 'Third floor - Building 2',  1),
  ('k-service-3', 'مطبخ 3', 'Kitchen 3', 'الدور الثالث - المبنى الثاني', 'Third floor - Building 2',  1),
  ('k-service-4', 'مطبخ 4', 'Kitchen 4', 'الدور الأول - المبنى الأول',   'First floor - Building 1',  1),
  ('k-service-5', 'مطبخ 5', 'Kitchen 5', 'الدور الثاني - المبنى الأول',  'Second floor - Building 1', 1)
ON DUPLICATE KEY UPDATE
  name_ar  = VALUES(name_ar),
  name_en  = VALUES(name_en),
  scope_ar = VALUES(scope_ar),
  scope_en = VALUES(scope_en),
  is_active = 1;

-- Retire the legacy regional/shared kitchens. Their rows stay so historical
-- references (user_settings.kitchen_choice_id, org_unit_kitchens) keep working.
UPDATE kitchens
SET is_active = 0
WHERE code NOT IN ('k-service-1', 'k-service-2', 'k-service-3', 'k-service-4', 'k-service-5');

-- ----------------------------------------------------------------------------
-- 2. Make sure every user has a settings row, and default the app to light.
-- ----------------------------------------------------------------------------
ALTER TABLE user_settings ALTER COLUMN theme SET DEFAULT 'light';

INSERT INTO user_settings (user_id, language, theme)
SELECT u.id, 'ar', 'light'
FROM users u
LEFT JOIN user_settings us ON us.user_id = u.id
WHERE us.user_id IS NULL
  AND u.deleted_at IS NULL;

-- Any 'system' preference saved before the light default existed becomes
-- 'light' so the app opens in the light theme on first run.
UPDATE user_settings
SET theme = 'light'
WHERE theme IS NULL OR theme = 'system';

-- ----------------------------------------------------------------------------
-- 3. Avatars are stored as base64 data URLs, which do not fit in VARCHAR(1024).
-- ----------------------------------------------------------------------------
ALTER TABLE employees MODIFY COLUMN avatar_url MEDIUMTEXT NULL;
