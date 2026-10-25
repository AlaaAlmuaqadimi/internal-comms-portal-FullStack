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

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'الاسم الكامل مطلوب').max(255, 'الاسم الكامل طويل جداً'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل')
    .max(30, 'اسم المستخدم يجب ألا يتجاوز 30 حرفاً')
    .regex(/^[a-z0-9._]+$/, 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام ونقطة أو شرطة سفلية فقط'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل').max(72, 'كلمة المرور يجب ألا تتجاوز 72 حرفاً'),
  confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  unit: z.string().trim().min(1, 'الوحدة التنظيمية مطلوبة').max(255, 'اسم الوحدة طويل جداً'),
  contacts: z.array(z.string()).optional().default([]),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});
