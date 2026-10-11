import { all, get, scalar } from '../db.js';
import { OPEN_STATUSES, STATUSES, PRIORITIES } from './tickets.js';

/**
 * Analytics service — every number here is derived with SQL so the dashboard
 * stays accurate as data grows (no in-memory aggregation over the whole table).
 *
 * Conventions
 *  - durations are minutes, rounded
 *  - "response" = first human touch after creation (first_response_at)
 *  - "resolution" = created_at → resolved_at
 *  - SLA compliance = resolved tickets that met sla_due_at (plus tickets still
 *    inside their window), expressed as a percentage
 */

const MINUTES = (endExpr, startExpr) => `(julianday(${endExpr}) - julianday(${startExpr})) * 24 * 60`;
const ROUND = (expr) => `ROUND(${expr})`;
const openList = OPEN_STATUSES.map(() => '?').join(', ');

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function avgMinutes(where, params) {
  const value = scalar(
    `SELECT ${ROUND(`AVG(${MINUTES('t.resolved_at', 't.created_at')})`)}
       FROM tickets t
      WHERE t.resolved_at IS NOT NULL ${where}`,
    params,
  );
  return value == null ? null : Math.round(value);
}

function avgFirstResponse(where, params) {
  const value = scalar(
    `SELECT ${ROUND(`AVG(${MINUTES('t.first_response_at', 't.created_at')})`)}
       FROM tickets t
      WHERE t.first_response_at IS NOT NULL ${where}`,
    params,
  );
  return value == null ? null : Math.round(value);
}

export function overview() {
  const total = Number(scalar('SELECT COUNT(*) FROM tickets') ?? 0);
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const row of all('SELECT status, COUNT(*) AS count FROM tickets GROUP BY status')) {
    byStatus[row.status] = Number(row.count);
  }
  const byPriority = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0]));
  for (const row of all('SELECT priority, COUNT(*) AS count FROM tickets GROUP BY priority')) {
    byPriority[row.priority] = Number(row.count);
  }

  const open = STATUSES.filter((status) => OPEN_STATUSES.includes(status)).reduce((sum, s) => sum + byStatus[s], 0);
  const resolved = byStatus.RESOLVED + byStatus.CLOSED;
  const unassigned = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE assignee_id IS NULL AND status IN (${openList})`, OPEN_STATUSES) ?? 0,
  );
  const breached = Number(
    scalar(
      `SELECT COUNT(*) FROM tickets
        WHERE sla_due_at IS NOT NULL AND datetime(sla_due_at) < datetime('now') AND status IN (${openList})`,
      OPEN_STATUSES,
    ) ?? 0,
  );
  const atRisk = Number(
    scalar(
      `SELECT COUNT(*) FROM tickets
        WHERE sla_due_at IS NOT NULL
          AND datetime(sla_due_at) BETWEEN datetime('now') AND datetime('now', '+3 hours')
          AND status IN (${openList})`,
      OPEN_STATUSES,
    ) ?? 0,
  );
  const flagged = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE ai_flags != '[]' AND status IN (${openList})`, OPEN_STATUSES) ?? 0,
  );
  const createdToday = Number(scalar(`SELECT COUNT(*) FROM tickets WHERE date(created_at) = date('now')`) ?? 0);
  const createdYesterday = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE date(created_at) = date('now', '-1 day')`) ?? 0,
  );
  const resolvedToday = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE resolved_at IS NOT NULL AND date(resolved_at) = date('now')`) ?? 0,
  );
  const closedToday = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE date(updated_at) = date('now') AND status IN ('RESOLVED','CLOSED')`) ?? 0,
  );

  // --- SLA compliance ------------------------------------------------------
  const resolvedWithSla = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE resolved_at IS NOT NULL AND sla_due_at IS NOT NULL`) ?? 0,
  );
  const resolvedOnTime = Number(
    scalar(
      `SELECT COUNT(*) FROM tickets WHERE resolved_at IS NOT NULL AND sla_due_at IS NOT NULL AND datetime(resolved_at) <= datetime(sla_due_at)`,
    ) ?? 0,
  );
  const openOnTrack = Number(
    scalar(
      `SELECT COUNT(*) FROM tickets WHERE status IN (${openList}) AND sla_due_at IS NOT NULL AND datetime(sla_due_at) >= datetime('now')`,
      OPEN_STATUSES,
    ) ?? 0,
  );
  const openWithSla = Number(
    scalar(`SELECT COUNT(*) FROM tickets WHERE status IN (${openList}) AND sla_due_at IS NOT NULL`, OPEN_STATUSES) ?? 0,
  );
  const slaCompliance = percent(resolvedOnTime + openOnTrack, resolvedWithSla + openWithSla);

  const firstResponseCoverage = percent(
    Number(scalar(`SELECT COUNT(*) FROM tickets WHERE first_response_at IS NOT NULL`) ?? 0),
    total,
  );
  const reopenRate = percent(
    Number(scalar(`SELECT COUNT(*) FROM tickets WHERE reopen_count > 0`) ?? 0),
    total,
  );
  const aiAutoPrioritised = Number(scalar(`SELECT COUNT(*) FROM tickets WHERE priority_overridden = 0`) ?? 0);

  const oldest = get(
    `SELECT id, code, title, priority, status, sla_due_at FROM tickets
      WHERE status IN (${openList}) ORDER BY created_at ASC LIMIT 1`,
    OPEN_STATUSES,
  );

  // --- 7-day trend ---------------------------------------------------------
  const trend = all(
    `WITH RECURSIVE days(d) AS (
        SELECT date('now', '-13 days')
        UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date('now')
     )
     SELECT d AS day,
            (SELECT COUNT(*) FROM tickets t WHERE date(t.created_at) = d) AS created,
            (SELECT COUNT(*) FROM tickets t WHERE t.resolved_at IS NOT NULL AND date(t.resolved_at) = d) AS resolved,
            (SELECT COUNT(*) FROM tickets t WHERE t.closed_at IS NOT NULL AND date(t.closed_at) = d) AS closed
       FROM days`,
  ).map((row) => ({ ...row, net: Number(row.created) - Number(row.resolved) }));

  return {
    totals: {
      total,
      open,
      unassigned,
      resolved,
      resolved_today: resolvedToday,
      closed_today: closedToday,
      breached,
      at_risk: atRisk,
      flagged,
      created_today: createdToday,
      created_yesterday: createdYesterday,
      created_delta_pct: createdYesterday === 0 ? null : percent(createdToday - createdYesterday, createdYesterday),
    },
    by_status: byStatus,
    by_priority: byPriority,
    performance: {
      avg_first_response_minutes: avgFirstResponse('', []),
      avg_resolution_minutes: avgMinutes('', []),
      sla_compliance_pct: slaCompliance,
      first_response_coverage_pct: firstResponseCoverage,
      reopen_rate_pct: reopenRate,
      ai_auto_prioritised: aiAutoPrioritised,
      auto_triage_share_pct: percent(aiAutoPrioritised, total),
    },
    oldest_open: oldest ?? null,
    trend_14d: trend,
  };
}

export function byCategory() {
  const rows = all(
    `SELECT t.category,
            COUNT(*) AS total,
            SUM(CASE WHEN t.status IN (${openList}) THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN t.sla_due_at IS NOT NULL AND t.resolved_at IS NULL AND datetime(t.sla_due_at) < datetime('now') THEN 1 ELSE 0 END) AS breached,
            ${ROUND(`AVG(CASE WHEN t.resolved_at IS NOT NULL THEN ${MINUTES('t.resolved_at', 't.created_at')} END)`)} AS avg_resolution_minutes,
            ${ROUND(`AVG(t.ai_urgency)`)} AS avg_urgency,
            SUM(CASE WHEN t.ai_flags != '[]' THEN 1 ELSE 0 END) AS flagged
       FROM tickets t
      GROUP BY t.category
      ORDER BY total DESC`,
    OPEN_STATUSES,
  );

  const categories = all('SELECT key, name, icon, sla_hours FROM categories');
  const meta = new Map(categories.map((c) => [c.key, c]));

  return rows.map((row) => ({
    category: row.category,
    name: meta.get(row.category)?.name ?? row.category,
    icon: meta.get(row.category)?.icon ?? '🔧',
    sla_hours: meta.get(row.category)?.sla_hours ?? null,
    total: Number(row.total),
    open: Number(row.open),
    resolved: Number(row.resolved),
    breached: Number(row.breached),
    breached_pct: percent(Number(row.breached), Number(row.total)),
    avg_resolution_minutes: row.avg_resolution_minutes == null ? null : Number(row.avg_resolution_minutes),
    avg_urgency: row.avg_urgency == null ? null : Number(row.avg_urgency),
    flagged: Number(row.flagged),
  }));
}

export function byTechnician() {
  const rows = all(
    `SELECT u.id, u.name, u.title, u.level, u.zone, u.skills, u.is_available, u.avatar_color,
            COUNT(t.id) AS assigned_total,
            SUM(CASE WHEN t.status IN (${openList}) THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN t.sla_due_at IS NOT NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND datetime(t.sla_due_at) < datetime('now') THEN 1 ELSE 0 END) AS breached,
            SUM(CASE WHEN t.resolved_at IS NOT NULL AND t.sla_due_at IS NOT NULL AND datetime(t.resolved_at) <= datetime(t.sla_due_at) THEN 1 ELSE 0 END) AS on_time,
            ${ROUND(`AVG(CASE WHEN t.resolved_at IS NOT NULL THEN ${MINUTES('t.resolved_at', 't.created_at')} END)`)} AS avg_resolution_minutes,
            ${ROUND(`AVG(CASE WHEN t.first_response_at IS NOT NULL THEN ${MINUTES('t.first_response_at', 't.created_at')} END)`)} AS avg_first_response_minutes
       FROM users u
       LEFT JOIN tickets t ON t.assignee_id = u.id
      WHERE u.role = 'TECHNICIAN'
      GROUP BY u.id
      ORDER BY resolved DESC, open ASC`,
    OPEN_STATUSES,
  );

  return rows.map((row) => {
    const resolved = Number(row.resolved);
    const onTime = Number(row.on_time);
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      level: row.level,
      zone: row.zone,
      skills: (() => {
        try {
          return JSON.parse(row.skills ?? '[]');
        } catch {
          return [];
        }
      })(),
      is_available: row.is_available === 1,
      avatar_color: row.avatar_color,
      assigned_total: Number(row.assigned_total),
      open: Number(row.open),
      resolved,
      breached: Number(row.breached),
      avg_resolution_minutes: row.avg_resolution_minutes == null ? null : Number(row.avg_resolution_minutes),
      avg_first_response_minutes: row.avg_first_response_minutes == null ? null : Number(row.avg_first_response_minutes),
      on_time_rate_pct: resolved ? percent(onTime, resolved) : null,
      // Rough utilisation: 6 concurrent jobs = fully loaded.
      utilisation_pct: Math.min(100, Math.round((Number(row.open) / 6) * 100)),
    };
  });
}

export function slaReport() {
  const rows = all(
    `SELECT t.id, t.code, t.title, t.priority, t.category, t.status, t.assignee_id, t.sla_due_at,
            u.name AS assignee_name,
            CASE WHEN t.sla_due_at IS NOT NULL
                 THEN ${ROUND(MINUTES('t.sla_due_at', 'COALESCE(t.resolved_at, t.closed_at, datetime(\'now\'))'))}
            END AS minutes_variance
       FROM tickets t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.sla_due_at IS NOT NULL
        AND (t.status IN (${openList}) OR t.sla_breached = 1)
      ORDER BY datetime(t.sla_due_at) ASC
      LIMIT 25`,
    OPEN_STATUSES,
  );

  return rows.map((row) => ({
    ...row,
    minutes_overdue: row.minutes_variance == null ? null : Math.max(0, -Number(row.minutes_variance)),
    minutes_to_due: row.minutes_variance == null ? null : Number(row.minutes_variance),
  }));
}

/** Repeat-offender locations & zones — where maintenance budget should go. */
export function hotspots(limit = 6) {
  const zones = all(
    `SELECT COALESCE(l.zone, 'Unzoned') AS zone,
            COUNT(*) AS total,
            SUM(CASE WHEN t.status IN (${openList}) THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN t.ai_flags != '[]' THEN 1 ELSE 0 END) AS flagged,
            ${ROUND(`AVG(t.ai_urgency)`)} AS avg_urgency
       FROM tickets t LEFT JOIN locations l ON l.id = t.location_id
      GROUP BY COALESCE(l.zone, 'Unzoned')
      ORDER BY total DESC LIMIT ?`,
    [...OPEN_STATUSES, limit],
  );

  const assets = all(
    `SELECT t.location_text AS location, COUNT(*) AS total,
            SUM(CASE WHEN t.status IN (${openList}) THEN 1 ELSE 0 END) AS open
       FROM tickets t
      WHERE t.location_text IS NOT NULL AND t.location_text != ''
      GROUP BY t.location_text
      HAVING COUNT(*) > 1
      ORDER BY total DESC LIMIT ?`,
    [...OPEN_STATUSES, limit],
  );

  return {
    zones: zones.map((row) => ({
      zone: row.zone,
      total: Number(row.total),
      open: Number(row.open),
      flagged: Number(row.flagged),
      avg_urgency: row.avg_urgency == null ? null : Number(row.avg_urgency),
    })),
    locations: assets.map((row) => ({ location: row.location, total: Number(row.total), open: Number(row.open) })),
  };
}

export function priorityMatrix() {
  const rows = all(
    `SELECT priority, category, COUNT(*) AS count FROM tickets GROUP BY priority, category`,
  );
  const matrix = Object.fromEntries(PRIORITIES.map((p) => [p, {}]));
  for (const row of rows) matrix[row.priority][row.category] = Number(row.count);
  return matrix;
}

/** Everything the analytics page needs in one round trip. */
export function dashboardSummary() {
  return {
    overview: overview(),
    categories: byCategory(),
    technicians: byTechnician(),
    sla: slaReport(),
    hotspots: hotspots(),
    priority_matrix: priorityMatrix(),
    generated_at: new Date().toISOString(),
  };
}
