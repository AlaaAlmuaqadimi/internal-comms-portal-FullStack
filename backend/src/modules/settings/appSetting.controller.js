import { AppError, ErrorCodes } from '../../lib/errors.js';
import { updateAppSettingsSchema } from './appSetting.schemas.js';
import * as appSettings from './appSetting.service.js';

function parseSettings(payload) {
  const parsed = updateAppSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Invalid settings', details);
  }
  return parsed.data;
}

export async function listAppSettings(_req, res, next) {
  try {
    const { items, values } = await appSettings.getWhitelistedAppSettings();
    res.json({ success: true, settings: values, items });
  } catch (err) {
    next(err);
  }
}

export async function updateAppSettings(req, res, next) {
  try {
    const payload = req.body?.settings ?? req.body;
    const settings = parseSettings(payload);
    await appSettings.updateAppSettings(settings, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const updated = await appSettings.getWhitelistedAppSettings();
    res.json({ success: true, settings: updated.values, items: updated.items });
  } catch (err) {
    next(err);
  }
}
