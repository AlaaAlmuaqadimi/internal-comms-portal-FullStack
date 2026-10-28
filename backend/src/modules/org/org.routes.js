import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
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

// Reads remain available to authenticated principals holding org.read. The org
// service still supports scoped reads for non-admin roles. All writes are
// restricted to the Super Admin role.
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

// Management writes are Super Admin only.
router.post(
  '/',
  authenticate,
  requireAdmin,
  validate(createOrgUnitSchema),
  createOrgUnit
);

router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validate(updateOrgUnitSchema),
  updateOrgUnit
);

router.patch(
  '/:id/move',
  authenticate,
  requireAdmin,
  validate(moveOrgUnitSchema),
  moveOrgUnit
);

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  deleteOrgUnit
);

// Restore is a management write and is restricted to the Super Admin.
router.post(
  '/:id/restore',
  authenticate,
  requireAdmin,
  restoreOrgUnit
);

export default router;
