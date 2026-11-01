import { z } from 'zod';

// Full Name accepts Latin and Arabic letters plus spaces only. Arabic-Indic
// digits (U+0660-U+0669) are intentionally outside these ranges.
const FULL_NAME_RE = /^[A-Za-z\u0621-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FF ]+$/;
const ENGLISH_NAME_RE = /^[A-Za-z ]+$/;
const EXTENSION_RE = /^\d{3,}$/;

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters long.')
  .max(64, 'Username must be at most 64 characters long.')
  .regex(
    /^[a-z0-9._-]+$/,
    'Username may contain lowercase letters, digits, dot, dash and underscore only.'
  );

const password = z
  .string()
  .min(1, 'Password is required.')
  .min(8, 'Password must be at least 8 characters long.')
  .max(200, 'Password must be at most 200 characters long.');

export const fullNameAr = z
  .string()
  .trim()
  .min(1, 'Full Name is required.')
  .min(4, 'Full Name must be at least 4 characters long.')
  .max(100, 'Full Name must be at most 100 characters long.')
  .regex(
    FULL_NAME_RE,
    'Full Name should contain letters only (no numbers or special characters).'
  );

export const fullNameEn = z
  .string()
  .trim()
  .min(1, 'English Name is required.')
  .min(4, 'English Name must be at least 4 characters long.')
  .max(100, 'English Name must be at most 100 characters long.')
  .regex(ENGLISH_NAME_RE, 'English Name must contain English letters only.');

export const email = z
  .string()
  .trim()
  .min(1, 'Email address is required.')
  .max(255, 'Email address must be at most 255 characters long.')
  .email('Please enter a valid email address.');

export const jobTitleAr = z
  .string()
  .trim()
  .min(1, 'Job Title is required.')
  .min(2, 'Job Title is required.')
  .max(255, 'Job Title must be at most 255 characters long.');

export const extension = z
  .string()
  .trim()
  .min(1, 'Extension number is required.')
  .max(32, 'Extension number is too long.')
  .regex(EXTENSION_RE, 'Extension number must be at least 3 numeric digits.');

export const roleCode = z.enum(['admin', 'employee'], {
  errorMap: () => ({ message: 'Please select a valid role.' }),
});

// Optional in edit mode: an empty string means "keep the current password".
export const optionalPassword = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(200, 'Password must be at most 200 characters long.')
    .optional()
);

export const createUserSchema = z
  .object({
    // Omitted by the mobile form: the server generates a unique value from
    // the English name. An explicit username is still accepted for scripts.
    username: username.optional(),
    password,
    fullNameAr,
    fullNameEn,
    orgUnitId: z.string().trim().uuid('Please select a valid organizational unit.'),
    code: z.string().trim().min(1).max(64).optional(),
    jobTitleAr,
    email,
    extension,
    // The route is admin-only, so an admin may grant either admin or employee.
    roleCode,
    scopeOrgUnitId: z.string().uuid().optional().nullable(),
    language: z.enum(['ar', 'en']).optional().default('ar'),
  })
  .transform((data) => ({
    ...data,
    scopeOrgUnitId: data.scopeOrgUnitId || null,
  }));

export const previewUsernameSchema = z.object({
  fullNameEn: z
    .string()
    .trim()
    .min(1, 'English Name is required.')
    .max(100, 'English Name must be at most 100 characters long.'),
});

export const availabilitySchema = z.object({
  field: z.enum(['email', 'extension', 'username'], {
    errorMap: () => ({ message: 'Unknown field.' }),
  }),
  value: z.string().trim().min(1, 'A value is required.').max(255),
  // Edit mode: the employee's own values must not be reported as taken.
  excludeEmployeeId: z.string().uuid().optional(),
});
