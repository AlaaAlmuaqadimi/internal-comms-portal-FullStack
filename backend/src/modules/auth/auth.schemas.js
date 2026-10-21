import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'A refresh token is required').max(512),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).max(512).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(255),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-z0-9._]+$/, 'Username must contain lowercase letters, numbers, dot or underscore only'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must not exceed 72 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
  unit: z.string().trim().min(1, 'Unit is required').max(255),
  contacts: z.array(z.string()).optional().default([]),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
