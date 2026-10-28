import { Router } from 'express';
import { createUser, listRoles, listOrgUnits } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';

const router = Router();

// User administration is restricted to the Super Admin role.
router.post('/', authenticate, requireAdmin, createUser);
router.get('/roles', authenticate, requireAdmin, listRoles);
router.get('/org-units', authenticate, requireAdmin, listOrgUnits);

export default router;
