import { AppError, ErrorCodes } from '../../lib/errors.js';
import { isAdmin } from '../../lib/roles.js';
import * as orgService from './org.service.js';
import {
  createOrgUnitSchema,
  listOrgUnitsQuerySchema,
  moveOrgUnitSchema,
  subtreeQuerySchema,
  treeQuerySchema,
  updateOrgUnitSchema,
} from './org.schemas.js';

function parse(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Invalid request', details);
  }
  return result.data;
}

/**
 * Resolves the service-layer actor. The Super Admin always acts globally with
 * unrestricted access; other principals fall back to their token grants for
 * read-only scoped queries.
 */
function actorFor(req, permission) {
  if (isAdmin(req.user)) {
    return { id: req.user?.id, isGlobal: true, scopes: [] };
  }
  const grant = req.user?.permissions?.[permission];
  return {
    id: req.user?.id,
    isGlobal: !!(grant && grant.global),
    scopes: grant && Array.isArray(grant.scopes) ? grant.scopes : [],
  };
}

function requestContext(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function notFound() {
  return new AppError(404, ErrorCodes.ORG_UNIT_NOT_FOUND, 'Org unit not found');
}

export async function listOrgUnits(req, res, next) {
  try {
    const query = parse(listOrgUnitsQuerySchema, req.query);
    const orgUnits = await orgService.listOrgUnits(query, actorFor(req, 'org.read'));
    res.json({ success: true, orgUnits });
  } catch (err) {
    next(err);
  }
}

export async function getOrgTree(req, res, next) {
  try {
    const query = parse(treeQuerySchema, req.query);
    const tree = await orgService.getOrgTree(query, actorFor(req, 'org.read'));
    res.json({ success: true, tree });
  } catch (err) {
    next(err);
  }
}

export async function getOrgUnit(req, res, next) {
  try {
    const result = await orgService.getOrgUnit(req.params.id, actorFor(req, 'org.read'));
    if (!result) throw notFound();
    res.json({
      success: true,
      orgUnit: result.unit,
      ancestors: result.ancestors,
      children: result.children,
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrgSubtree(req, res, next) {
  try {
    const query = parse(subtreeQuerySchema, req.query);
    const subtree = await orgService.getSubtree(req.params.id, actorFor(req, 'org.read'), query);
    if (!subtree) throw notFound();
    res.json({ success: true, subtree });
  } catch (err) {
    next(err);
  }
}

export async function getOrgAncestors(req, res, next) {
  try {
    const ancestors = await orgService.getAncestors(req.params.id);
    res.json({ success: true, ancestors });
  } catch (err) {
    next(err);
  }
}

export async function getOrgChildren(req, res, next) {
  try {
    const children = await orgService.getChildren(req.params.id, actorFor(req, 'org.read'));
    res.json({ success: true, children });
  } catch (err) {
    next(err);
  }
}

export async function createOrgUnit(req, res, next) {
  try {
    const input = parse(createOrgUnitSchema, req.body);
    const orgUnit = await orgService.createOrgUnit(
      input,
      actorFor(req, 'org.manage'),
      requestContext(req)
    );
    res.status(201).json({ success: true, orgUnit });
  } catch (err) {
    next(err);
  }
}

export async function updateOrgUnit(req, res, next) {
  try {
    const input = parse(updateOrgUnitSchema, req.body);
    const orgUnit = await orgService.updateOrgUnit(
      req.params.id,
      input,
      actorFor(req, 'org.manage'),
      requestContext(req)
    );
    res.json({ success: true, orgUnit });
  } catch (err) {
    next(err);
  }
}

export async function moveOrgUnit(req, res, next) {
  try {
    const { parentId } = parse(moveOrgUnitSchema, req.body);
    const orgUnit = await orgService.moveOrgUnit(
      req.params.id,
      parentId,
      actorFor(req, 'org.manage'),
      requestContext(req)
    );
    res.json({ success: true, orgUnit });
  } catch (err) {
    next(err);
  }
}

export async function deleteOrgUnit(req, res, next) {
  try {
    const deleted = await orgService.deleteOrgUnit(
      req.params.id,
      actorFor(req, 'org.manage'),
      requestContext(req)
    );
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
}

export async function restoreOrgUnit(req, res, next) {
  try {
    const orgUnit = await orgService.restoreOrgUnit(
      req.params.id,
      actorFor(req, 'org.manage'),
      requestContext(req)
    );
    res.json({ success: true, orgUnit });
  } catch (err) {
    next(err);
  }
}
