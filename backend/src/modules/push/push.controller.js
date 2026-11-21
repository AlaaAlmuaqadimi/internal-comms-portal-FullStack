import * as pushService from './push.service.js';
import { declineFromPush } from './pushDecline.service.js';
import { publishCallUpdate } from '../calls/signaling/signaling.server.js';

/** No sign-in: the one-call token in the body is the authorization. */
export async function declineCall(req, res, next) {
  try {
    const result = await declineFromPush(req.body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (result.declined) publishCallUpdate(req.body.callId);
    res.json({ success: true, declined: result.declined });
  } catch (err) {
    next(err);
  }
}

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
