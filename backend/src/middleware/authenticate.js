import { verifyAccessToken } from '../lib/jwt.js';
import { AppError, ErrorCodes } from '../lib/errors.js';

/**
 * Verifies the RS256 bearer access token and attaches the principal to
 * req.user. The token carries the roles and the effective permission map so
 * authorization is stateless (see requirePermission).
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, ErrorCodes.UNAUTHORIZED, 'Missing bearer token'));
  }

  try {
    const claims = verifyAccessToken(token);
    req.user = {
      id: claims.sub,
      employeeId: claims.emp,
      username: claims.username,
      roles: claims.roles || [],
      permissions: claims.perms || {},
    };
    return next();
  } catch (err) {
    const expired = err && err.name === 'TokenExpiredError';
    return next(
      new AppError(
        401,
        expired ? ErrorCodes.TOKEN_EXPIRED : ErrorCodes.UNAUTHORIZED,
        expired ? 'Access token expired' : 'Invalid access token'
      )
    );
  }
}
