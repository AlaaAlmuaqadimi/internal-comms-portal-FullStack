import { AppError, ErrorCodes } from '../lib/errors.js';
import { isAdmin } from '../lib/roles.js';

/**
 * Guards management routes. Only the Super Admin role (`admin`) may create,
 * edit or delete platform data.
 *
 * Authentication must run first so `req.user` is populated from the access
 * token. The check is intentionally role-based: the admin role is the single
 * administrative role in the simplified RBAC model.
 */
export function requireAdmin(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required'));
  }
  if (!isAdmin(req.user)) {
    return next(new AppError(403, ErrorCodes.FORBIDDEN, 'Administrator access required'));
  }
  return next();
}
