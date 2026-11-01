import {
  createUserSchema,
  previewUsernameSchema,
  availabilitySchema,
} from './user.schemas.js';
import * as userService from './user.service.js';
import { AppError } from '../../lib/errors.js';
import { isAdmin } from '../../lib/roles.js';

function actorContext(req) {
  if (isAdmin(req.user)) {
    return { id: req.user.id, isGlobal: true, scopes: [] };
  }
  const grant = (req.user.permissions || {})['users.manage'];
  return {
    id: req.user.id,
    isGlobal: !!(grant && grant.global),
    scopes: grant && Array.isArray(grant.scopes) ? grant.scopes : [],
  };
}

// Keep one message per field: zod reports every failing check on a chain, but
// the form only renders the first one for each input.
function validationError(parsed) {
  const seen = new Set();
  const details = [];
  for (const issue of parsed.error.issues) {
    const field = issue.path.join('.') || '(root)';
    if (seen.has(field)) continue;
    seen.add(field);
    details.push({ field, message: issue.message });
  }
  return new AppError(422, 'VALIDATION_ERROR', 'Invalid request body', details);
}

export async function createUser(req, res, next) {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed);

    const created = await userService.createUser(parsed.data, actorContext(req), {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, user: created });
  } catch (err) {
    next(err);
  }
}

export async function previewUsername(req, res, next) {
  try {
    const parsed = previewUsernameSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed);

    res.json({ success: true, ...(await userService.previewUsername(parsed.data.fullNameEn)) });
  } catch (err) {
    next(err);
  }
}

export async function checkAvailability(req, res, next) {
  try {
    const parsed = availabilitySchema.safeParse(req.query);
    if (!parsed.success) throw validationError(parsed);

    res.json({ success: true, ...(await userService.checkAvailability(parsed.data)) });
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
