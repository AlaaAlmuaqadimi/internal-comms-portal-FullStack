import { AppError, ErrorCodes } from '../lib/errors.js';

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      }));
      return next(
        new AppError(422, ErrorCodes.VALIDATION_ERROR, 'بيانات الطلب غير صالحة', details)
      );
    }
    req.body = result.data;
    next();
  };
}
