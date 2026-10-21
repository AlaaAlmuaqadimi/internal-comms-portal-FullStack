import { createUserSchema } from './user.schemas.js';
import * as userService from './user.service.js';
import { AppError } from '../../lib/errors.js';

function actorContext(req) {
  const grant = (req.user.permissions || {})['users.manage'];
  return {
    id: req.user.id,
    isGlobal: !!(grant && grant.global),
    scopes: grant && Array.isArray(grant.scopes) ? grant.scopes : [],
  };
}

export async function createUser(req, res, next) {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      }));
      throw new AppError(422, 'VALIDATION_ERROR', 'Invalid request body', details);
    }

    const created = await userService.createUser(parsed.data, actorContext(req), {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, user: created });
  } catch (err) {
    next(err);
  }
}

export async function listRoles(_req, res, next) {
  try {
    res.json({ success: true, roles: await userService.listRoles() });
  } catch (err) {
    next(err);
  }
}

export async function listOrgUnits(_req, res, next) {
  try {
    res.json({ success: true, orgUnits: await userService.listOrgUnits() });
  } catch (err) {
    next(err);
  }
}
