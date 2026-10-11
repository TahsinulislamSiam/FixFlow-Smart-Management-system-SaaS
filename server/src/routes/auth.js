import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, nowIso } from '../db.js';
import { ApiError, asyncHandler, ok, parseBody } from '../util/http.js';
import { hashPassword, verifyPassword } from '../util/password.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';
import { AI_METADATA } from '../services/ai.js';

export const authRouter = Router();

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#a855f7', '#22c55e', '#ec4899'];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(72),
  // Self-service signup can create reporters and technicians — never admins.
  role: z.enum(['REQUESTER', 'TECHNICIAN']).default('REQUESTER'),
  phone: z.string().trim().max(30).optional().nullable(),
  title: z.string().trim().max(80).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  zone: z.string().trim().max(40).optional().nullable(),
  skills: z.array(z.string()).max(12).optional(),
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req.body ?? {});
    const existing = get('SELECT id FROM users WHERE lower(email) = ?', [input.email]);
    if (existing) throw ApiError.conflict('That email is already registered. Try signing in instead.');

    const skills = input.role === 'TECHNICIAN' ? (input.skills?.length ? input.skills : ['other']) : [];
    const { lastInsertRowid } = run(
      `INSERT INTO users (name, email, password_hash, role, level, phone, title, department, zone, skills, is_available, avatar_color, created_at)
       VALUES (?, ?, ?, ?, 'JUNIOR', ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        input.name,
        input.email,
        hashPassword(input.password),
        input.role,
        input.phone ?? null,
        input.title ?? null,
        input.department ?? null,
        input.zone ?? null,
        JSON.stringify(skills),
        pickColor(),
        nowIso(),
      ],
    );

    const user = get('SELECT * FROM users WHERE id = ?', [lastInsertRowid]);
    return ok(res, { token: signToken(user), user: publicUser(user) }, 201);
  }),
);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body ?? {});
    const user = get('SELECT * FROM users WHERE lower(email) = ?', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw ApiError.unauthorized('Incorrect email or password.');
    }
    return ok(res, { token: signToken(user), user: publicUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, { user: publicUser(req.user) })),
);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  title: z.string().trim().max(80).nullable().optional(),
  department: z.string().trim().max(80).nullable().optional(),
  zone: z.string().trim().max(40).nullable().optional(),
  skills: z.array(z.string().trim()).max(12).optional(),
  is_available: z.boolean().optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(8, 'Use at least 8 characters.').max(72).optional(),
});

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(profileSchema, req.body ?? {});
    const fields = [];
    const params = [];

    for (const key of ['name', 'phone', 'title', 'department', 'zone']) {
      if (input[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(input[key] === '' ? null : input[key]);
      }
    }
    if (input.skills !== undefined && req.user.role === 'TECHNICIAN') {
      fields.push('skills = ?');
      params.push(JSON.stringify(input.skills));
    }
    if (input.is_available !== undefined && req.user.role === 'TECHNICIAN') {
      fields.push('is_available = ?');
      params.push(input.is_available ? 1 : 0);
    }

    if (input.new_password) {
      if (!input.current_password || !verifyPassword(input.current_password, req.user.password_hash)) {
        throw ApiError.badRequest('Your current password is incorrect.', { current_password: 'Incorrect password.' });
      }
      fields.push('password_hash = ?');
      params.push(hashPassword(input.new_password));
    }

    if (fields.length) {
      params.push(req.user.id);
      run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    const updated = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return ok(res, { user: publicUser(updated) });
  }),
);

/** Handy for the demo: one-click logins for the seeded personas. */
authRouter.get(
  '/demo-accounts',
  asyncHandler(async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      throw ApiError.forbidden('Demo accounts are disabled in production.');
    }
    const users = all(
      `SELECT id, name, email, role, title, avatar_color FROM users
        WHERE email LIKE '%@fixflow.dev' ORDER BY
          CASE role WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 WHEN 'TECHNICIAN' THEN 3 ELSE 4 END, id
        LIMIT 12`,
    );
    return ok(res, {
      password: process.env.DEMO_PASSWORD ?? 'FixFlow123!',
      accounts: users,
    });
  }),
);

/** Category + priority metadata shared by the ticket form. */
authRouter.get('/meta', (_req, res) => {
  const categories = all('SELECT * FROM categories ORDER BY name');
  ok(res, { categories, ai: AI_METADATA });
});
