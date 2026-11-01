import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import orgRoutes from '../modules/org/org.routes.js';
import employeeRoutes from '../modules/employees/employee.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/employees', employeeRoutes);
router.use('/org-units', orgRoutes);

export default router;
