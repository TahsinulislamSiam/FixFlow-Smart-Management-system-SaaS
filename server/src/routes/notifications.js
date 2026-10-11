import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db.js';
import { asyncHandler, ok, parseBody } from '../util/http.js';
import { requireAuth } from '../middleware/auth.js';
import { markAllRead, markRead, unreadCount } from '../services/notifications.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit ?? '30', 10) || 30));
    const unreadOnly = req.query.unread === 'true';
    const rows = all(
      `SELECT * FROM notifications
        WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
        ORDER BY created_at DESC, id DESC LIMIT ?`,
      [req.user.id, limit],
    );
    return ok(res, {
      notifications: rows.map((row) => ({ ...row, is_read: row.is_read === 1 })),
      unread: unreadCount(req.user.id),
    });
  }),
);

notificationsRouter.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, { unread: unreadCount(req.user.id) })),
);

notificationsRouter.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    markRead(req.user.id, Number(req.params.id));
    return ok(res, { unread: unreadCount(req.user.id) });
  }),
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, { updated: markAllRead(req.user.id), unread: 0 })),
);

notificationsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = get('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (existing) run('DELETE FROM notifications WHERE id = ?', [id]);
    return ok(res, { deleted: Boolean(existing), unread: unreadCount(req.user.id) });
  }),
);

/** Bulk create is intentionally not exposed over HTTP (server-generated only). */
export const __schema = z.object({});
