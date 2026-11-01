import { Router } from 'express';
import {
  getEmployee,
  listEmployees,
  listRoles,
  updateEmployee,
} from './employee.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';

const router = Router();

// Directory reads are available to every authenticated employee; editing the
// directory remains restricted to the Super Admin role.
router.get('/', authenticate, listEmployees);
router.get('/roles', authenticate, listRoles);
router.get('/:id', authenticate, getEmployee);
router.patch('/:id', authenticate, requireAdmin, updateEmployee);

export default router;
