import { z } from 'zod';

const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, digits, dot, dash and underscore only');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200);

export const createUserSchema = z
  .object({
    username,
    password,
    fullNameAr: z.string().trim().min(1, 'Arabic full name is required').max(255),
    fullNameEn: z.string().trim().max(255).optional().or(z.literal('')),
    orgUnitId: z.string().uuid('orgUnitId must be a UUID'),
    code: z.string().trim().min(1).max(64).optional(),
    jobTitleAr: z.string().trim().max(255).optional().or(z.literal('')),
    email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
    extension: z.string().trim().max(32).optional().or(z.literal('')),
    // The route is admin-only, so an admin may grant either admin or employee.
    roleCode: z.string().trim().min(1, 'A role is required'),
    scopeOrgUnitId: z.string().uuid().optional().nullable(),
    language: z.enum(['ar', 'en']).optional().default('ar'),
  })
  .transform((data) => ({
    ...data,
    fullNameEn: data.fullNameEn || null,
    jobTitleAr: data.jobTitleAr || null,
    email: data.email || null,
    extension: data.extension || null,
    scopeOrgUnitId: data.scopeOrgUnitId || null,
  }));
