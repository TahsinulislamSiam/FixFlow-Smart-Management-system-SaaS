import { all, get, run, nowIso } from '../db.js';
import { emitToUser, emitToRole } from '../realtime.js';

/**
 * Notification service: every notification is persisted (so it survives a
 * refresh) *and* pushed over the websocket (so the bell updates instantly).
 */

export function notifyUser({ userId, title, body, kind = 'INFO', ticketId = null, link = null }) {
  if (!userId) return null;
  const created = nowIso();
  const { lastInsertRowid } = run(
    `INSERT INTO notifications (user_id, title, body, kind, ticket_id, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [Number(userId), title, body ?? null, kind, ticketId, link, created],
  );
  const notification = get('SELECT * FROM notifications WHERE id = ?', [lastInsertRowid]);
  emitToUser(userId, 'notification', { ...notification, is_read: false });
  return notification;
}

export function notifyMany(userIds, payload) {
  const unique = [...new Set(userIds.filter(Boolean).map(Number))];
  return unique.map((userId) => notifyUser({ ...payload, userId })).filter(Boolean);
}

/** Everyone with a management role — used for escalations and SLA breaches. */
export function managerIds() {
  return all(`SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER')`).map((row) => row.id);
}

export function technicianIdsForCategory(category) {
  return all(`SELECT id, skills FROM users WHERE role = 'TECHNICIAN' AND is_available = 1`)
    .filter((row) => {
      try {
        return JSON.parse(row.skills ?? '[]').includes(category);
      } catch {
        return false;
      }
    })
    .map((row) => row.id);
}

export function unreadCount(userId) {
  const row = get('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  return row?.count ?? 0;
}

export function markRead(userId, notificationId) {
  run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [notificationId, userId]);
}

export function markAllRead(userId) {
  const { changes } = run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
  return changes;
}

/** Fan out an event to a role room without persisting a row (ephemeral UI signal). */
export function pingRole(role, event, payload) {
  emitToRole(role, event, payload);
}
