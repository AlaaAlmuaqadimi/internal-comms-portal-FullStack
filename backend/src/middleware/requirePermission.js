import { AppError, ErrorCodes } from '../lib/errors.js';
import { isOrgUnitWithinScope } from '../db/scope.js';

function resolveTargetOrgUnitId(req, options) {
  if (typeof options.resolveScope === 'function') return options.resolveScope(req);
  return (
    req.scopeOrgUnitId ??
    req.params?.orgUnitId ??
    req.params?.unitId ??
    req.body?.orgUnitId ??
    req.body?.unitId ??
    req.query?.orgUnitId ??
    req.query?.unitId ??
    null
  );
}

function grantFor(req, permission) {
  const perms = req.user && req.user.permissions;
  if (!perms) return null;
  return perms[permission] || null;
}

async function hasPermission(req, permission, options) {
  const grant = grantFor(req, permission);
  if (!grant) return false;
  if (grant.global) return true;

  const scopes = Array.isArray(grant.scopes) ? grant.scopes : [];
  if (scopes.length === 0) return false;

  const targetOrgUnitId = await resolveTargetOrgUnitId(req, options);
  if (!targetOrgUnitId) return false;

  for (const scopeOrgUnitId of scopes) {
    if (scopeOrgUnitId === targetOrgUnitId) return true;
    if (await isOrgUnitWithinScope(scopeOrgUnitId, targetOrgUnitId)) return true;
  }
  return false;
}

/**
 * Guards a route behind a permission code (e.g. 'employees.manage').
 *
 * The access token carries the effective permission map:
 *   perms: { 'org.manage': { global: false, scopes: ['<uuid>', ...] },
 *            'employees.read': { global: true, scopes: [] } }
 *
 * A global grant always passes. A scoped grant passes only when a target org
 * unit is available (via options.resolveScope(...) or req.scopeOrgUnitId /
 * params / body / query) and it falls inside one of the granted subtrees.
 *
 * @param {string} permission
 * @param {{ resolveScope?: (req: import('express').Request) => (string|Promise<string>) }} [options]
 */
export function requirePermission(permission, options = {}) {
  return async function requirePermissionMiddleware(req, _res, next) {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required');
      }
      const allowed = await hasPermission(req, permission, options);
      if (!allowed) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, `Missing permission: ${permission}`);
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Passes when the principal holds at least one of the given permissions
 * (same scoping rules as requirePermission).
 */
export function requireAnyPermission(permissions, options = {}) {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return async function requireAnyPermissionMiddleware(req, _res, next) {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required');
      }
      for (const permission of list) {
        if (await hasPermission(req, permission, options)) return next();
      }
      throw new AppError(403, ErrorCodes.FORBIDDEN, `Missing permission: one of ${list.join(', ')}`);
    } catch (err) {
      return next(err);
    }
  };
}
