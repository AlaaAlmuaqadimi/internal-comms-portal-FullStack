-- ============================================================================
-- V007 - Seed roles, permissions and role->permission mappings
-- Idempotent: INSERT IGNORE keeps re-runs safe.
-- ============================================================================

SET NAMES utf8mb4;

INSERT IGNORE INTO roles (code, name_ar, name_en, is_system) VALUES
  ('admin',         'مدير النظام',      'System Administrator', 1),
  ('org_manager',   'مدير إداري',       'Organization Manager', 1),
  ('supervisor',    'مشرف',             'Supervisor',           1),
  ('employee',      'موظف',             'Employee',             1),
  ('kitchen_staff', 'موظف مطبخ',        'Kitchen Staff',        1),
  ('auditor',       'مراجع',            'Auditor',              1);

INSERT IGNORE INTO permissions (code, description) VALUES
  ('users.manage',          'Create, update, deactivate users and role assignments'),
  ('roles.manage',          'Manage roles and permissions'),
  ('org.read',              'Read organization tree'),
  ('org.manage',            'Create, update, move or delete organization units'),
  ('employees.read',        'Read employee directory'),
  ('employees.manage',      'Create, update or deactivate employees'),
  ('contacts.manage',       'Manage own allowed-contacts allowlist'),
  ('calls.initiate',        'Initiate calls to allowed contacts'),
  ('calls.read',            'Read own call history'),
  ('notifications.read',    'Read notifications addressed to the user'),
  ('notifications.create',  'Create notifications'),
  ('notifications.broadcast','Broadcast notifications beyond own scope'),
  ('kitchens.read',         'Read kitchens available for selection'),
  ('kitchens.manage',       'Manage kitchens'),
  ('audit.read',            'Read audit log'),
  ('settings.manage',       'Manage own settings');

-- admin: every permission
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin';

-- org_manager: org, people, comms (scoped by user_roles.scope_org_unit_id)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'org.read','org.manage','employees.read','employees.manage',
  'calls.initiate','calls.read',
  'notifications.read','notifications.create','notifications.broadcast',
  'kitchens.read','settings.manage'
)
WHERE r.code = 'org_manager';

-- supervisor: same read/comms surface, no employee or role administration
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'org.read','employees.read','calls.initiate','calls.read',
  'notifications.read','notifications.create',
  'kitchens.read','settings.manage'
)
WHERE r.code = 'supervisor';

-- employee: self-service
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'org.read','employees.read','contacts.manage',
  'calls.initiate','calls.read','notifications.read',
  'kitchens.read','settings.manage'
)
WHERE r.code = 'employee';

-- kitchen_staff: kitchen administration plus normal comms
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'org.read','employees.read','calls.initiate','calls.read',
  'notifications.read','kitchens.read','kitchens.manage','settings.manage'
)
WHERE r.code = 'kitchen_staff';

-- auditor: read-only, including audit log
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'org.read','employees.read','notifications.read','calls.read','audit.read'
)
WHERE r.code = 'auditor';
