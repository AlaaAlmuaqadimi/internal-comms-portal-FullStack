import { z } from 'zod';

// The mobile app uses friendly keys (announcement/circular/message); the
// database enum uses its own values. The service maps between the two so the
// API surface stays stable even if the storage enum changes.
export const createNotificationSchema = z.object({
  type: z.enum(['announcement', 'circular', 'message']).optional().default('announcement'),
  title: z.string().trim().max(255, 'عنوان الإشعار طويل جداً').optional(),
  body: z
    .string()
    .trim()
    .min(1, 'نص الإشعار مطلوب')
    .max(4000, 'نص الإشعار طويل جداً'),
  recipientIds: z
    .array(z.string().trim().min(1).max(64))
    .max(2000, 'عدد المستهدفين كبير جداً')
    .optional()
    .default([]),
  audience: z.enum(['all', 'selected']).optional(),
  durationHours: z.number().int().min(1).max(24 * 90).optional().default(24),
});
