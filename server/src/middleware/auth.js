import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get, parseJson } from '../db.js';
import { ApiError } from '../util/http.js';

/**
 * JWT auth middleware. Roles are re-read from the database on every request
 * (not trusted from the token) so a demotion or deactivation takes effect
 * immediately rather than when the token expires.
 */

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, name: user.name, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    level: row.level,
    phone: row.phone,
    title: row.title,
    department: row.department,
    zone: row.zone,
    skills: parseJson(row.skills, []),
    is_available: row.is_available === 1,
    avatar_color: row.avatar_color,
    created_at: row.created_at,
  };
}

function userFromRequest(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const row = get('SELECT * FROM users WHERE id = ?', [Number(payload.sub)]);
    return row ?? null;
  } catch {
    return null;
  }
}

/** Attaches `req.user` when a valid token is present; never rejects. */
export function attachUser(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

/** Rejects unauthenticated requests. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized('Please sign in to continue.'));
  return next();
}

/** Role gate — `requireRole('ADMIN', 'MANAGER')`. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Please sign in to continue.'));
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires one of: ${roles.join(', ')}.`));
    }
    return next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireManager = requireRole('ADMIN', 'MANAGER');
