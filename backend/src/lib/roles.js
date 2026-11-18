/**
 * Role helpers shared by middleware and controllers.
 *
 * The platform has a single administrative role: `admin` (Super Admin). All
 * other roles are operational/read-only and never receive management
 * permissions. `auditor` is a read-only oversight role: it cannot change data,
 * but it may read the metadata-only call oversight feed.
 */
export const ADMIN_ROLE_CODE = 'admin';
export const AUDITOR_ROLE_CODE = 'auditor';

export function isAdmin(user) {
  return Array.isArray(user?.roles) && user.roles.includes(ADMIN_ROLE_CODE);
}

export function isAuditor(user) {
  return Array.isArray(user?.roles) && user.roles.includes(AUDITOR_ROLE_CODE);
}

export function canOverseeCalls(user) {
  return isAdmin(user) || isAuditor(user);
}
