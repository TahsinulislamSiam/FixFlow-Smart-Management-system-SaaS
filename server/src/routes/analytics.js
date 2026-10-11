import { Router } from 'express';
import { all, get, scalar } from '../db.js';
import { asyncHandler, ok } from '../util/http.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { OPEN_STATUSES, STATUSES } from '../services/tickets.js';
import {
  byCategory,
  byTechnician,
  dashboardSummary,
  hotspots,
  overview,
  priorityMatrix,
  slaReport,
} from '../services/analytics.js';
import { unreadCount } from '../services/notifications.js';
import { onlineUserIds } from '../realtime.js';

/* Manager-only deep analytics ---------------------------------------------- */
export const analyticsRouter = Router();

analyticsRouter.get('/overview', requireAuth, requireManager, (_req, res) => ok(res, overview()));
analyticsRouter.get('/categories', requireAuth, requireManager, (_req, res) => ok(res, byCategory()));
analyticsRouter.get('/technicians', requireAuth, requireManager, (_req, res) => ok(res, byTechnician()));
analyticsRouter.get('/sla', requireAuth, requireManager, (_req, res) => ok(res, slaReport()));
analyticsRouter.get('/hotspots', requireAuth, requireManager, (_req, res) => ok(res, hotspots()));
analyticsRouter.get('/priority-matrix', requireAuth, requireManager, (_req, res) => ok(res, priorityMatrix()));
analyticsRouter.get('/summary', requireAuth, requireManager, (_req, res) => ok(res, dashboardSummary()));

/* Role-aware home dashboard ------------------------------------------------ */
export const dashboardRouter = Router();

const openPlaceholders = OPEN_STATUSES.map(() => '?').join(', ');

/** Recent workflow activity, respecting who may see what. */
function activityFeed(user, limit = 12) {
  const scope =
    user.role === 'ADMIN' || user.role === 'MANAGER'
      ? { sql: '', params: [] }
      : user.role === 'TECHNICIAN'
        ? { sql: 'AND (t.assignee_id = ? OR t.requester_id = ?)', params: [user.id, user.id] }
        : { sql: 'AND t.requester_id = ?', params: [user.id] };

  return all(
    `SELECT e.id, e.type, e.message, e.from_value, e.to_value, e.created_at,
            t.id AS ticket_id, t.code, t.title, t.priority, t.status,
            u.name AS actor_name
       FROM ticket_events e
       JOIN tickets t ON t.id = e.ticket_id
       LEFT JOIN users u ON u.id = e.actor_id
      WHERE 1 = 1 ${scope.sql}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ?`,
    [...scope.params, limit],
  );
}

function personalStats(user) {
  if (user.role === 'TECHNICIAN') {
    return get(
      `SELECT
         SUM(CASE WHEN t.status IN (${openPlaceholders}) THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN t.status = 'RESOLVED' THEN 1 ELSE 0 END) AS awaiting_closure,
         SUM(CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN t.sla_due_at IS NOT NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND datetime(t.sla_due_at) < datetime('now') THEN 1 ELSE 0 END) AS breached,
         ROUND(AVG(CASE WHEN t.first_response_at IS NOT NULL THEN (julianday(t.first_response_at) - julianday(t.created_at)) * 24 * 60 END)) AS avg_first_response_minutes,
         ROUND(AVG(CASE WHEN t.resolved_at IS NOT NULL THEN (julianday(t.resolved_at) - julianday(t.created_at)) * 24 * 60 END)) AS avg_resolution_minutes
       FROM tickets t WHERE t.assignee_id = ?`,
      [...OPEN_STATUSES, user.id],
    );
  }
  return get(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN t.status IN (${openPlaceholders}) THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN t.status = 'RESOLVED' THEN 1 ELSE 0 END) AS awaiting_closure,
       SUM(CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) AS resolved,
       SUM(CASE WHEN t.sla_due_at IS NOT NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND datetime(t.sla_due_at) < datetime('now') THEN 1 ELSE 0 END) AS breached,
       ROUND(AVG(CASE WHEN t.resolved_at IS NOT NULL THEN (julianday(t.resolved_at) - julianday(t.created_at)) * 24 * 60 END)) AS avg_resolution_minutes
     FROM tickets t WHERE t.requester_id = ?`,
    [...OPEN_STATUSES, user.id],
  );
}

dashboardRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
    const raw = personalStats(user);

    const mine = {
      open: Number(raw?.open ?? 0),
      in_progress: Number(raw?.in_progress ?? 0),
      awaiting_closure: Number(raw?.awaiting_closure ?? 0),
      resolved: Number(raw?.resolved ?? 0),
      total: Number(raw?.total ?? 0),
      breached: Number(raw?.breached ?? 0),
      avg_first_response_minutes: raw?.avg_first_response_minutes == null ? null : Number(raw.avg_first_response_minutes),
      avg_resolution_minutes: raw?.avg_resolution_minutes == null ? null : Number(raw.avg_resolution_minutes),
    };

    // The technician's own queue, worst-first.
    const myQueue =
      user.role === 'TECHNICIAN'
        ? all(
            `SELECT t.id, t.code, t.title, t.priority, t.status, t.category, t.location_text, t.sla_due_at,
                    CASE WHEN t.sla_due_at IS NOT NULL AND datetime(t.sla_due_at) < datetime('now') THEN 1 ELSE 0 END AS overdue,
                    u.name AS requester_name
               FROM tickets t JOIN users u ON u.id = t.requester_id
              WHERE t.assignee_id = ? AND t.status IN (${openPlaceholders})
              ORDER BY CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                       t.sla_due_at IS NULL, t.sla_due_at ASC
              LIMIT 8`,
            [user.id, ...OPEN_STATUSES],
          )
        : [];

    // Tickets the reporter still needs to confirm (or staff need to close).
    const needsAction =
      user.role === 'REQUESTER'
        ? all(
            `SELECT t.id, t.code, t.title, t.status, t.priority, t.resolved_at, a.name AS assignee_name
               FROM tickets t LEFT JOIN users a ON a.id = t.assignee_id
              WHERE t.requester_id = ? AND t.status IN ('RESOLVED')
              ORDER BY t.resolved_at DESC LIMIT 5`,
            [user.id],
          )
        : isManager
          ? all(
              `SELECT t.id, t.code, t.title, t.priority, t.sla_due_at, t.created_at, l.zone
                 FROM tickets t LEFT JOIN locations l ON l.id = t.location_id
                WHERE t.assignee_id IS NULL AND t.status IN ('NEW','TRIAGED')
                ORDER BY CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END, t.created_at ASC
                LIMIT 6`,
            )
          : [];

    const payload = {
      role: user.role,
      generated_at: new Date().toISOString(),
      mine,
      my_queue: myQueue,
      needs_action: needsAction,
      activity: activityFeed(user),
      notifications_unread: unreadCount(user.id),
      online_users: onlineUserIds().length,
    };

    if (isManager) {
      const summary = overview();
      payload.overview = summary;
      payload.categories = byCategory();
      payload.technicians = byTechnician();
      payload.hotspots = hotspots();
      payload.sla = slaReport();
      payload.by_status = Object.fromEntries(STATUSES.map((status) => [status, Number(scalar('SELECT COUNT(*) FROM tickets WHERE status = ?', [status]) ?? 0)]));
      payload.unassigned = Number(
        scalar(`SELECT COUNT(*) FROM tickets WHERE assignee_id IS NULL AND status IN (${openPlaceholders})`, OPEN_STATUSES) ?? 0,
      );
    }

    if (user.role === 'TECHNICIAN') {
      // Peers ranking gives the technician a nudge without exposing full analytics.
      const leaderboard = byTechnician();
      const index = leaderboard.findIndex((row) => row.id === user.id);
      payload.leaderboard_position = index === -1 ? null : index + 1;
      payload.leaderboard_size = leaderboard.length;
      payload.my_resolved = index === -1 ? 0 : leaderboard[index].resolved;
    }

    return ok(res, payload);
  }),
);
