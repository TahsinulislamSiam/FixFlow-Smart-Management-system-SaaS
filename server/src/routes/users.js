import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, nowIso, parseJson } from '../db.js';
import { ApiError, asyncHandler, ok, parseBody } from '../util/http.js';
import { requireAdmin, requireAuth, requireManager, publicUser } from '../middleware/auth.js';
import { hashPassword } from '../util/password.js';
import { workloadByTechnician } from '../services/assignment.js';
import { onlineUserIds } from '../realtime.js';

export const usersRouter = Router();

const TECH_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.level, u.title, u.phone, u.department, u.zone,
         u.skills, u.is_available, u.avatar_color, u.created_at
    FROM users u
`;

function shape(row, { withWorkload = false } = {}) {
  if (!row) return null;
  const user = { ...publicUser(row), ...(row.open_tickets !== undefined ? { open_tickets: Number(row.open_tickets) } : {}) };
  if (withWorkload) user.online = onlineUserIds().includes(row.id);
  return user;
}

/** Technician roster — used by the assign dialog and the technicians page. */
usersRouter.get(
  '/technicians',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const workload = workloadByTechnician();
    const rows = all(`${TECH_SELECT} WHERE u.role = 'TECHNICIAN' ORDER BY u.name`);
    const online = new Set(onlineUserIds());
    return ok(
      res,
      rows.map((row) => ({
        ...publicUser(row),
        open_tickets: workload.get(Number(row.id)) ?? 0,
        online: online.has(row.id),
      })),
    );
  }),
);

usersRouter.get(
  '/',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => {
    const role = req.query.role ? String(req.query.role).toUpperCase() : null;
    const search = req.query.q ? `%${String(req.query.q).trim().toLowerCase()}%` : null;

    const where = [];
    const params = [];
    if (role) {
      where.push('u.role = ?');
      params.push(role);
    }
    if (search) {
      where.push('(lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(u.zone) LIKE ?)');
      params.push(search, search, search);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = all(`${TECH_SELECT} ${clause} ORDER BY CASE u.role WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 WHEN 'TECHNICIAN' THEN 3 ELSE 4 END, u.name`, params);
    return ok(res, rows.map((row) => shape(row)));
  }),
);

usersRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = get(`${TECH_SELECT} WHERE u.id = ?`, [id]);
    if (!row) throw ApiError.notFound('That user does not exist.');
    if (req.user.role === 'REQUESTER' && req.user.id !== id) {
      throw ApiError.forbidden('You can only view your own profile.');
    }

    const stats = get(
      `SELECT
         COUNT(*) AS assigned_total,
         SUM(CASE WHEN status IN ('ASSIGNED','IN_PROGRESS','ON_HOLD','TRIAGED') THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) AS resolved,
         ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24 * 60 END)) AS avg_resolution_minutes
       FROM tickets WHERE assignee_id = ?`,
      [id],
    );

    const raised = get(
      `SELECT COUNT(*) AS raised FROM tickets WHERE requester_id = ?`,
      [id],
    );

    return ok(res, {
      user: shape(row, { withWorkload: true }),
      stats: {
        assigned_total: Number(stats?.assigned_total ?? 0),
        open: Number(stats?.open ?? 0),
        resolved: Number(stats?.resolved ?? 0),
        avg_resolution_minutes: stats?.avg_resolution_minutes == null ? null : Number(stats.avg_resolution_minutes),
        tickets_raised: Number(raised?.raised ?? 0),
      },
    });
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER']).optional(),
  level: z.enum(['JUNIOR', 'SENIOR', 'LEAD']).optional(),
  title: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  department: z.string().trim().max(80).nullable().optional(),
  zone: z.string().trim().max(40).nullable().optional(),
  skills: z.array(z.string().trim()).max(12).optional(),
  is_available: z.boolean().optional(),
});

usersRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target) throw ApiError.notFound('That user does not exist.');
    const input = parseBody(updateSchema, req.body ?? {});

    // Guard rail: never let the last admin be demoted out of the role.
    if (input.role && input.role !== 'ADMIN' && target.role === 'ADMIN') {
      const admins = Number(get(`SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'`)?.count ?? 0);
      if (admins <= 1) throw ApiError.conflict('You cannot remove the last administrator.');
    }

    const fields = [];
    const params = [];
    for (const key of ['name', 'role', 'level', 'title', 'phone', 'department', 'zone']) {
      if (input[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(input[key] === '' ? null : input[key]);
      }
    }
    if (input.skills !== undefined) {
      fields.push('skills = ?');
      params.push(JSON.stringify(input.skills));
    }
    if (input.is_available !== undefined) {
      fields.push('is_available = ?');
      params.push(input.is_available ? 1 : 0);
    }
    if (fields.length) {
      params.push(id);
      run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    return ok(res, shape(get(`${TECH_SELECT} WHERE u.id = ?`, [id])));
  }),
);

usersRouter.post(
  '/:id/reset-password',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = get('SELECT id FROM users WHERE id = ?', [id]);
    if (!target) throw ApiError.notFound('That user does not exist.');
    const { password } = parseBody(z.object({ password: z.string().min(8).max(72) }), req.body ?? {});
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), id]);
    return ok(res, { updated: true });
  }),
);

/** Admin creates staff accounts directly (no self-signup detour). */
usersRouter.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8).max(72),
        role: z.enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER']),
        level: z.enum(['JUNIOR', 'SENIOR', 'LEAD']).default('JUNIOR'),
        title: z.string().trim().max(80).optional().nullable(),
        phone: z.string().trim().max(30).optional().nullable(),
        zone: z.string().trim().max(40).optional().nullable(),
        skills: z.array(z.string()).max(12).default([]),
      }),
      req.body ?? {},
    );
    if (get('SELECT id FROM users WHERE lower(email) = ?', [input.email])) {
      throw ApiError.conflict('That email is already registered.');
    }
    const { lastInsertRowid } = run(
      `INSERT INTO users (name, email, password_hash, role, level, phone, title, department, zone, skills, is_available, avatar_color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, '#6366f1', ?)`,
      [
        input.name,
        input.email,
        hashPassword(input.password),
        input.role,
        input.level,
        input.phone ?? null,
        input.title ?? null,
        input.zone ?? null,
        JSON.stringify(input.role === 'TECHNICIAN' ? input.skills : []),
        nowIso(),
      ],
    );
    return ok(res, shape(get(`${TECH_SELECT} WHERE u.id = ?`, [lastInsertRowid])), 201);
  }),
);

/** Skill catalogue used by the technician editor. */
usersRouter.get(
  '/skills/catalog',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const categories = all('SELECT key, name, icon FROM categories ORDER BY name');
    const inUse = new Set();
    for (const row of all(`SELECT skills FROM users WHERE role = 'TECHNICIAN'`)) {
      for (const skill of parseJson(row.skills, [])) inUse.add(skill);
    }
    return ok(res, { catalog: categories, in_use: [...inUse] });
  }),
);
