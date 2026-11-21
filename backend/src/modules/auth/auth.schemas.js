import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'اسم المستخدم مطلوب').max(64, 'اسم المستخدم طويل جداً'),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(200, 'كلمة المرور طويلة جداً'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'رمز التحديث مطلوب').max(512, 'رمز التحديث غير صالح'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'رمز التحديث غير صالح').max(512).optional(),
});

const optionalAvatar = z
  .string()
  .max(8_000_000, 'حجم الصورة كبير جداً')
  .refine(
    (value) => value === '' || value.startsWith('data:image/') || /^https?:\/\//i.test(value),
    'صيغة الصورة غير صالحة'
  );

export const updateProfileSchema = z.object({
  fullNameAr: z
    .string()
    .trim()
    .min(1, 'الاسم الكامل مطلوب')
    .max(255, 'الاسم الكامل طويل جداً')
    .optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل')
    .max(30, 'اسم المستخدم يجب ألا يتجاوز 30 حرفاً')
    .regex(
      /^[a-z0-9._]+$/,
      'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام ونقطة أو شرطة سفلية فقط'
    )
    .optional(),
  avatarUrl: optionalAvatar.nullable().optional(),
  orgUnitId: z.string().trim().min(1).max(64).nullable().optional(),
  language: z.enum(['ar', 'en']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  kitchenChoice: z.string().trim().min(1).max(64).nullable().optional(),
});

