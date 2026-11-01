import { z } from 'zod';
import {
  email,
  extension,
  fullNameAr,
  fullNameEn,
  jobTitleAr,
  optionalPassword,
  roleCode,
} from '../users/user.schemas.js';

const uuid = z.string().uuid('Please select a valid organizational unit.');

export const listEmployeesQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100, 'Search text is too long.')
    .optional()
    .default(''),
  roleCode: z
    .enum(['admin', 'employee'], {
      errorMap: () => ({ message: 'Please select a valid role.' }),
    })
    .optional(),
  orgUnitId: uuid.optional(),
});

/**
 * Edit mode always submits the full form, so every editable field is required.
 * `username` is intentionally absent: it is server-owned and never changes.
 * `password` is optional; leaving it blank keeps the current credential.
 */
export const updateEmployeeSchema = z
  .object({
    fullNameAr,
    fullNameEn,
    jobTitleAr,
    email,
    extension,
    roleCode,
    orgUnitId: uuid,
    password: optionalPassword,
  })
  .transform((data) => ({
    ...data,
    password: data.password || undefined,
  }));
