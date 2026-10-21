import { Router } from 'express';
import { createUser, listRoles, listOrgUnits } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/requirePermission.js';

const router = Router();

// User administration - all routes require an authenticated principal holding
// users.manage (admin, or an org_manager scoped to a subtree).
router.post('/', authenticate, requirePermission('users.manage'), createUser);
router.get('/roles', authenticate, requirePermission('users.manage'), listRoles);
router.get('/org-units', authenticate, requirePermission('users.manage'), listOrgUnits);

export default router;
