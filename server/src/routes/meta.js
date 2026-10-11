import { Router } from 'express';
import { all, get, scalar } from '../db.js';
import { asyncHandler, ok } from '../util/http.js';
import { AI_METADATA } from '../services/ai.js';
import { config } from '../config.js';

/** Public metadata: powers the ticket form, the site directory and the landing page. */
export const metaRouter = Router();

metaRouter.get('/health', (_req, res) => {
  const ticketCount = Number(scalar('SELECT COUNT(*) FROM tickets') ?? 0);
  return res.json({
    data: {
      status: 'ok',
      service: 'fixflow-api',
      version: '1.0.0',
      uptime_seconds: Math.round(process.uptime()),
      tickets: ticketCount,
      ai_mode: config.ai.apiKey ? 'llm+heuristic' : 'heuristic',
      time: new Date().toISOString(),
    },
  });
});

metaRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => ok(res, all('SELECT * FROM categories ORDER BY name'))),
);

metaRouter.get(
  '/locations',
  asyncHandler(async (_req, res) =>
    ok(
      res,
      all(
        `SELECT l.*,
                (SELECT COUNT(*) FROM tickets t WHERE t.location_id = l.id) AS ticket_count
           FROM locations l ORDER BY l.name`,
      ),
    ),
  ),
);

metaRouter.get(
  '/zones',
  asyncHandler(async (_req, res) =>
    ok(
      res,
      all(
        `SELECT COALESCE(l.zone, 'Unzoned') AS zone, COUNT(*) AS tickets
           FROM locations l LEFT JOIN tickets t ON t.location_id = l.id
          GROUP BY COALESCE(l.zone, 'Unzoned') ORDER BY tickets DESC`,
      ),
    ),
  ),
);

/** Landing-page social proof: aggregate-only, no personal data. */
metaRouter.get(
  '/public-stats',
  asyncHandler(async (_req, res) => {
    const total = Number(scalar('SELECT COUNT(*) FROM tickets') ?? 0);
    const resolved = Number(scalar(`SELECT COUNT(*) FROM tickets WHERE resolved_at IS NOT NULL`) ?? 0);
    const avg = scalar(
      `SELECT ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24 * 60)) FROM tickets WHERE resolved_at IS NOT NULL`,
    );
    const technicians = Number(scalar(`SELECT COUNT(*) FROM users WHERE role = 'TECHNICIAN'`) ?? 0);
    const categories = Number(scalar('SELECT COUNT(*) FROM categories') ?? 0);
    const onTime = Number(
      scalar(
        `SELECT COUNT(*) FROM tickets WHERE resolved_at IS NOT NULL AND sla_due_at IS NOT NULL AND datetime(resolved_at) <= datetime(sla_due_at)`,
      ) ?? 0,
    );
    const withSla = Number(scalar(`SELECT COUNT(*) FROM tickets WHERE resolved_at IS NOT NULL AND sla_due_at IS NOT NULL`) ?? 0);

    return ok(res, {
      tickets_reported: total,
      tickets_resolved: resolved,
      avg_resolution_minutes: avg == null ? null : Number(avg),
      technicians,
      categories,
      sla_compliance_pct: withSla ? Math.round((onTime / withSla) * 1000) / 10 : 0,
      ai: AI_METADATA,
    });
  }),
);

metaRouter.get(
  '/users/:id/card',
  asyncHandler(async (req, res) => {
    const row = get('SELECT id, name, role, title, zone, avatar_color FROM users WHERE id = ?', [Number(req.params.id)]);
    return ok(res, row ?? null);
  }),
);
