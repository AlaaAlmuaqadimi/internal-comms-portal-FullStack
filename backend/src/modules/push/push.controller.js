import * as pushService from './push.service.js';

export async function registerToken(req, res, next) {
  try {
    await pushService.registerPushToken(req.user, req.body);
    res.json({ success: true, pushEnabled: pushService.isPushEnabled() });
  } catch (err) {
    next(err);
  }
}

export async function unregisterToken(req, res, next) {
  try {
    const result = await pushService.unregisterPushToken(req.user, req.body.token);
    res.json({ success: true, removed: result.removed });
  } catch (err) {
    next(err);
  }
}
