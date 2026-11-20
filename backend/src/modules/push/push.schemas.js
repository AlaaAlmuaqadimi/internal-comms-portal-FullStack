import { z } from 'zod';

// FCM registration tokens are long opaque ASCII strings (letters, digits,
// `-`, `_`, `:`). The bounds only keep junk out.
const pushToken = z
  .string()
  .trim()
  .min(20)
  .max(512)
  .regex(/^[A-Za-z0-9_:\-.]+$/, 'رمز الإشعارات غير صالح');

export const registerPushTokenSchema = z
  .object({
    token: pushToken,
    platform: z.enum(['android', 'ios']),
  })
  .strict();

export const unregisterPushTokenSchema = z
  .object({
    token: pushToken,
  })
  .strict();
