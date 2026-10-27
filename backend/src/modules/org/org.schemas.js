import { z } from 'zod';
import { ORG_KINDS } from './org.service.js';

const uuid = z.string().uuid('Must be a UUID');

const code = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(64, 'Code is too long')
  .regex(/^[A-Za-z0-9._-]+$/, 'Code may contain letters, digits, dot, dash and underscore only');

const optionalName = z
  .string()
  .trim()
  .max(255)
  .optional()
  .nullable()
  .transform((value) => (value == null || value === '' ? null : value));

const metadata = z.record(z.unknown()).optional().nullable();

const editableFields = {
  code: code.optional(),
  parentId: uuid.optional().nullable(),
  nameAr: z.string().trim().min(1, 'Arabic name is required').max(255),
  nameEn: optionalName,
  kind: z.enum(ORG_KINDS),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
  metadata,
};

export const createOrgUnitSchema = z
  .object(editableFields)
  .transform((data) => ({
    ...data,
    parentId: data.parentId ?? null,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
    metadata: data.metadata ?? null,
  }));

export const updateOrgUnitSchema = z
  .object(editableFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be supplied',
  });

export const moveOrgUnitSchema = z.object({
  parentId: uuid.nullable(),
});

function booleanQuery(defaultValue = false) {
  return z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true' || value === '1');
}

const q = z.string().trim().max(255).optional();

export const listOrgUnitsQuerySchema = z.object({
  parentId: uuid.optional(),
  q,
  includeInactive: booleanQuery(false),
});

export const treeQuerySchema = z.object({
  rootId: uuid.optional(),
  includeInactive: booleanQuery(false),
});

export const subtreeQuerySchema = z.object({
  includeInactive: booleanQuery(false),
});
