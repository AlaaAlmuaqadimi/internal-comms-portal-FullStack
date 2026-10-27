import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { validate } from '../../middleware/validate.js';
import {
  createOrgUnit,
  deleteOrgUnit,
  getOrgAncestors,
  getOrgChildren,
  getOrgSubtree,
  getOrgTree,
  getOrgUnit,
  listOrgUnits,
  moveOrgUnit,
  restoreOrgUnit,
  updateOrgUnit,
} from './org.controller.js';
import { createOrgUnitSchema, moveOrgUnitSchema, updateOrgUnitSchema } from './org.schemas.js';

const router = Router();

// List/tree routes have no single target unit. A scoped principal is allowed
// through when it holds at least one scope; the service then filters every row
// to the union of its granted subtrees.
const anyScope = (permission) => (req) => req.user?.permissions?.[permission]?.scopes?.[0] || null;
const targetUnit = (req) => req.params.id;

router.get(
  '/',
  authenticate,
  requirePermission('org.read', { resolveScope: anyScope('org.read') }),
  listOrgUnits
);

router.get(
  '/tree',
  authenticate,
  requirePermission('org.read', { resolveScope: anyScope('org.read') }),
  getOrgTree
);

router.get(
  '/:id',
  authenticate,
  requirePermission('org.read', { resolveScope: targetUnit }),
  getOrgUnit
);

router.get(
  '/:id/subtree',
  authenticate,
  requirePermission('org.read', { resolveScope: targetUnit }),
  getOrgSubtree
);

router.get(
  '/:id/ancestors',
  authenticate,
  requirePermission('org.read', { resolveScope: targetUnit }),
  getOrgAncestors
);

router.get(
  '/:id/children',
  authenticate,
  requirePermission('org.read', { resolveScope: targetUnit }),
  getOrgChildren
);

// A scoped manager may create below a unit in its own subtree. Creating the
// root (parentId null) is global-only, enforced here and again in the service.
router.post(
  '/',
  authenticate,
  requirePermission('org.manage', { resolveScope: (req) => req.body?.parentId || null }),
  validate(createOrgUnitSchema),
  createOrgUnit
);

router.patch(
  '/:id',
  authenticate,
  requirePermission('org.manage', { resolveScope: targetUnit }),
  validate(updateOrgUnitSchema),
  updateOrgUnit
);

router.patch(
  '/:id/move',
  authenticate,
  requirePermission('org.manage', { resolveScope: targetUnit }),
  validate(moveOrgUnitSchema),
  moveOrgUnit
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('org.manage', { resolveScope: targetUnit }),
  deleteOrgUnit
);

// Restore is checked against the parent subtree because a soft-deleted unit is
// not reachable through the active-tree recursive scope check.
router.post(
  '/:id/restore',
  authenticate,
  requirePermission('org.manage', { resolveScope: anyScope('org.manage') }),
  restoreOrgUnit
);

export default router;
