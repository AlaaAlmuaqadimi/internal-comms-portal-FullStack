-- ============================================================================
-- V013 - Simplify RBAC: admin is the single management role
--
-- The platform no longer supports hierarchical manager roles. Only the Super
-- Admin (`admin`) may create, edit or delete org units, users, employees and
-- platform-wide notifications. Existing non-admin roles keep their read and
-- operational permissions.
--
-- Idempotent: V007 re-seeds the base mappings on every migration run, and this
-- migration removes the management grants afterwards.
-- ============================================================================

SET NAMES utf8mb4;

-- 1) The Super Admin always holds every permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin';

-- 2) No non-admin role may hold a platform-management permission.
DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.code <> 'admin'
  AND p.code IN (
    'org.manage',
    'users.manage',
    'roles.manage',
    'employees.manage',
    'notifications.broadcast'
  );
