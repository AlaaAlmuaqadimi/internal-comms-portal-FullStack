import {
  countUnread,
  createNotification,
  getReceipts,
  listNotifications,
  markAllRead,
  markRead,
} from './notification.service.js';

export async function listMyNotifications(req, res, next) {
  try {
    const notifications = await listNotifications(
      req.user.employeeId,
      req.user.id
    );
    const unreadCount = notifications.reduce(
      (total, item) => total + (item.unread ? 1 : 0),
      0
    );
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

export async function getNotificationReceipts(req, res, next) {
  try {
    const receipts = await getReceipts(req.params.id, req.user);
    res.json({ success: true, ...receipts });
  } catch (err) {
    next(err);
  }
}

export async function getMyUnreadCount(req, res, next) {
  try {
    const count = await countUnread(req.user.employeeId);
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
}

export async function publishNotification(req, res, next) {
  try {
    const notification = await createNotification(req.body, req.user);
    res.status(201).json({ success: true, notification });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    await markRead(req.params.id, req.user.employeeId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    await markAllRead(req.user.employeeId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
