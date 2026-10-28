-- ============================================================================
-- V014 - Remove legacy roles and keep the binary admin/employee model
--
-- V007 seeds the historical role catalogue on every migration run, so this
-- migration removes the four unused roles afterwards. `admin` remains the
-- single management role; every other account is an `employee`.
--
-- Idempotent: deleting missing roles is a no-op, and re-running after V007
-- simply removes the reseeded rows again.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) Any account still holding a retired role falls back to `employee`, unless
--    it is already an admin. The original scope is kept so access is not
--    silently widened.
INSERT IGNORE INTO user_roles (id, user_id, role_id, scope_org_unit_id, granted_by)
SELECT UUID(), legacy.user_id, employee_role.id, legacy.scope_org_unit_id, legacy.granted_by
FROM user_roles legacy
JOIN roles legacy_role ON legacy_role.id = legacy.role_id
JOIN roles employee_role ON employee_role.code = 'employee'
WHERE legacy_role.code IN ('org_manager', 'supervisor', 'kitchen_staff', 'auditor')
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles admin_assignment
    JOIN roles admin_role ON admin_role.id = admin_assignment.role_id
    WHERE admin_assignment.user_id = legacy.user_id
      AND admin_role.code = 'admin'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles existing_employee
    WHERE existing_employee.user_id = legacy.user_id
      AND existing_employee.role_id = employee_role.id
      AND existing_employee.scope_key = legacy.scope_key
  );

-- 2) Remove the retired roles' permission grants and remaining assignments.
DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
WHERE r.code IN ('org_manager', 'supervisor', 'kitchen_staff', 'auditor');

DELETE ur
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.code IN ('org_manager', 'supervisor', 'kitchen_staff', 'auditor');

-- 3) Delete the roles. Notifications that targeted a retired role have their
--    target cleared by the fk_notifications_target_role ON DELETE SET NULL FK.
DELETE FROM roles
WHERE code IN ('org_manager', 'supervisor', 'kitchen_staff', 'auditor');
