import * as callService from './call.service.js';
import { issueSignalingTicket, publishCallUpdate } from './signaling/signaling.server.js';

function context(req) {
  return {
    actorUserId: req.user?.id ?? null,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

export async function inviteCall(req, res, next) {
  try {
    const call = await callService.inviteCall({
      callerUser: req.user,
      calleeEmployeeId: req.body.calleeEmployeeId,
      callType: req.body.callType,
      ...context(req),
    });
    publishCallUpdate(call?.id);
    res.status(201).json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

export async function listCalls(req, res, next) {
  try {
    const calls = await callService.listCalls(req.user.employeeId);
    res.json({ success: true, calls });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin/auditor metadata-only feed. Leadership involvement is decided from the
 * call's stored org-unit-kind snapshot; no participant identity is returned.
 */
export async function listOversightCalls(req, res, next) {
  try {
    const calls = await callService.listOversightCalls({
      limit: req.query?.limit,
    });
    res.json({ success: true, calls });
  } catch (err) {
    next(err);
  }
}

export async function getCall(req, res, next) {
  try {
    const call = await callService.getCall(
      req.params.id,
      req.user.employeeId,
      context(req)
    );
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

export async function acceptCall(req, res, next) {
  try {
    const call = await callService.acceptCall(
      req.params.id,
      req.user.employeeId,
      context(req)
    );
    publishCallUpdate(req.params.id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

export async function declineCall(req, res, next) {
  try {
    const call = await callService.declineCall(
      req.params.id,
      req.user.employeeId,
      context(req)
    );
    publishCallUpdate(req.params.id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

export async function cancelCall(req, res, next) {
  try {
    const call = await callService.cancelCall(
      req.params.id,
      req.user.employeeId,
      context(req)
    );
    publishCallUpdate(req.params.id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

export async function endCall(req, res, next) {
  try {
    const call = await callService.endCall(
      req.params.id,
      req.user.employeeId,
      context(req)
    );
    publishCallUpdate(req.params.id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

export async function missCall(req, res, next) {
  try {
    const call = await callService.missCall(
      req.params.id,
      req.user.employeeId,
      context(req)
    );
    publishCallUpdate(req.params.id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

/**
 * One-time ticket for opening the signalling socket. 404 while
 * CALL_SIGNALING_ENABLED is off.
 */
export async function issueTicket(req, res, next) {
  try {
    const result = issueSignalingTicket(req.user);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
