import * as authService from './auth.service.js';
import { isAdmin } from '../../lib/roles.js';

function requestContext(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

export async function login(req, res, next) {
  try {
    const result = await authService.login({
      username: req.body.username,
      password: req.body.password,
      ...requestContext(req),
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const result = await authService.rotateRefreshToken({
      refreshToken: req.body.refreshToken,
      ...requestContext(req),
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    await authService.logout({
      refreshToken: req.body?.refreshToken,
      ...requestContext(req),
    });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    const result = await authService.changeMyPassword({
      userId: req.user.id,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
      ...requestContext(req),
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const result = await authService.updateMyProfile({
      ...req.body,
      userId: req.user.id,
      canChangeOrgUnit: isAdmin(req.user),
      ...requestContext(req),
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const result = await authService.getMe(req.user.id);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
