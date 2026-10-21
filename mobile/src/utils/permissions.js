// Permission helpers for the client. These mirror the server's RBAC map that
// is embedded in the access token and returned by GET /api/auth/me. The client
// only uses them to show/hide UI - the server is always the source of truth.

export function hasPermission(user, permission) {
  const perms = user?.permissions;
  if (!perms) return false;
  return Boolean(perms[permission]);
}

export function hasGlobalPermission(user, permission) {
  const grant = user?.permissions?.[permission];
  return Boolean(grant && grant.global);
}

export function scopeFor(user, permission) {
  const grant = user?.permissions?.[permission];
  if (!grant) return [];
  if (grant.global) return ['*'];
  return Array.isArray(grant.scopes) ? grant.scopes : [];
}

export function hasRole(user, roleCode) {
  return Array.isArray(user?.roles) && user.roles.includes(roleCode);
}
