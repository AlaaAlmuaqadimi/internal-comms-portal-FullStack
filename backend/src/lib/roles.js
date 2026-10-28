/**
 * Role helpers shared by middleware and controllers.
 *
 * The platform has a single administrative role: `admin` (Super Admin). All
 * other roles are operational/read-only and never receive management
 * permissions.
 */
export const ADMIN_ROLE_CODE = 'admin';

export function isAdmin(user) {
  return Array.isArray(user?.roles) && user.roles.includes(ADMIN_ROLE_CODE);
}
