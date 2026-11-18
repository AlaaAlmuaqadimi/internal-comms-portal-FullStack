import { z } from 'zod';

const employeeId = z
  .string()
  .uuid('معرّف الموظف غير صالح.');

/**
 * `calleeEmployeeId` is the canonical field. `targetEmployeeId` is accepted as
 * an alias for clients that use the policy wording ("target").
 */
export const inviteCallSchema = z
  .object({
    calleeEmployeeId: employeeId.optional(),
    targetEmployeeId: employeeId.optional(),
    callType: z.enum(['audio', 'video']).optional().default('audio'),
  })
  .superRefine((input, ctx) => {
    if (!input.calleeEmployeeId && !input.targetEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['calleeEmployeeId'],
        message: 'يجب تحديد الموظف المطلوب.',
      });
    }
  })
  .transform((input) => ({
    calleeEmployeeId: input.calleeEmployeeId || input.targetEmployeeId,
    callType: input.callType,
  }));
