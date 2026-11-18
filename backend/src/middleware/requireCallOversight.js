import { AppError, ErrorCodes } from '../lib/errors.js';
import { canOverseeCalls } from '../lib/roles.js';

/**
 * Guards the metadata-only call oversight feed.
 *
 * Allowed: `admin` and `auditor`. Both roles see leadership-involving calls as
 * metadata only (see `call.service.js#listOversightCalls`); neither gets the
 * participant view, and there is no way to request an unredacted call here.
 *
 * Authentication must run first so `req.user` is populated from the access
 * token.
 */
export function requireCallOversight(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required'));
  }
  if (!canOverseeCalls(req.user)) {
    return next(new AppError(403, ErrorCodes.FORBIDDEN, 'Call oversight access required'));
  }
  return next();
}
