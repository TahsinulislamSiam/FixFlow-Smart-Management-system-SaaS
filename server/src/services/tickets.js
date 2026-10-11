import { all, get, run, scalar, tx, parseJson, nowIso } from '../db.js';
import { ApiError } from '../util/http.js';
import { analyse, computeSlaDueAt } from './ai.js';
import { pickBestTechnician, rankTechnicians, ticketForScoring } from './assignment.js';
import { notifyMany, notifyUser, managerIds, technicianIdsForCategory } from './notifications.js';
import { emitTicketUpdate, emitToRole, emitToBoard } from '../realtime.js';

/* -------------------------------------------------------------------------- */
/* Constants & state machine                                                  */
/* -------------------------------------------------------------------------- */

export const STATUSES = ['NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const OPEN_STATUSES = ['NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'];
const CLOSED_STATUSES = ['RESOLVED', 'CLOSED', 'CANCELLED'];

/** Allowed status transitions. Reopening from RESOLVED/CLOSED is explicit. */
const TRANSITIONS = {
  NEW: ['TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ON_HOLD', 'TRIAGED', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'ASSIGNED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
  CANCELLED: [],
};

/** Which roles may drive which transitions. Managers/admins may do anything valid. */
const ROLE_TRANSITIONS = {
  TECHNICIAN: ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'TRIAGED', 'RESOLVED'],
  REQUESTER: ['CLOSED', 'CANCELLED', 'IN_PROGRESS'],
  MANAGER: STATUSES,
  ADMIN: STATUSES,
};

export const PRIORITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/* -------------------------------------------------------------------------- */
/* Serialisation helpers                                                      */
/* -------------------------------------------------------------------------- */

function minutesBetween(from, to = nowIso()) {
  if (!from) return null;
  const delta = (new Date(to).getTime() - new Date(from).getTime()) / 60000;
  return Number.isFinite(delta) ? Math.round(delta) : null;
}

/** Shape a DB row into an API object with derived, UI-ready fields. */
export function serialiseTicket(row) {
  if (!row) return null;
  const now = nowIso();
  const isOpen = !CLOSED_STATUSES.includes(row.status);
  const overdue = isOpen && row.sla_due_at ? new Date(row.sla_due_at).getTime() < new Date(now).getTime() : false;
  const dueInMinutes = row.sla_due_at
    ? Math.round((new Date(row.sla_due_at).getTime() - new Date(now).getTime()) / 60000)
    : null;

  const requester = row.requester_name
    ? { id: row.requester_id, name: row.requester_name, email: row.requester_email, avatar_color: row.requester_color }
    : null;
  const assignee = row.assignee_name
    ? { id: row.assignee_id, name: row.assignee_name, email: row.assignee_email, avatar_color: row.assignee_color }
    : null;

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    requester_id: row.requester_id,
    assignee_id: row.assignee_id ?? null,
    location_id: row.location_id ?? null,
    location_text: row.location_text ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    sla_due_at: row.sla_due_at ?? null,
    sla_breached: overdue || row.sla_breached === 1,
    sla_due_in_minutes: dueInMinutes,
    first_response_at: row.first_response_at ?? null,
    resolved_at: row.resolved_at ?? null,
    closed_at: row.closed_at ?? null,
    priority_overridden: row.priority_overridden === 1,
    reopen_count: row.reopen_count ?? 0,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
    age_minutes: minutesBetween(row.created_at),
    time_to_first_response_minutes: row.first_response_at ? minutesBetween(row.created_at, row.first_response_at) : null,
    time_to_resolve_minutes: row.resolved_at ? minutesBetween(row.created_at, row.resolved_at) : null,
    ai: {
      summary: row.ai_summary ?? null,
      confidence: row.ai_confidence ?? null,
      tags: parseJson(row.ai_tags, []),
      flags: parseJson(row.ai_flags, []),
      urgency: row.ai_urgency ?? 0,
      estimated_hours: row.ai_estimated_hours ?? null,
      model: row.ai_model ?? null,
      source: row.ai_source ?? null,
    },
    requester,
    assignee,
    zone: row.zone ?? null,
    building: row.building ?? null,
    comment_count: row.comment_count ?? undefined,
    attachment_count: row.attachment_count ?? undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Visibility & permissions                                                   */
/* -------------------------------------------------------------------------- */

export function canViewTicket(ticket, user) {
  if (!ticket || !user) return false;
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
  if (user.role === 'TECHNICIAN') {
    if (ticket.assignee_id === user.id) return true;
    if (ticket.requester_id === user.id) return true;
    return !ticket.assignee_id && !CLOSED_STATUSES.includes(ticket.status);
  }
  return ticket.requester_id === user.id;
}

/** Comment visibility: internal notes are staff-only. */
export function canSeeInternal(user) {
  return user.role !== 'REQUESTER';
}

export function assertCanView(ticket, user) {
  if (!ticket) throw ApiError.notFound('That ticket does not exist.');
  if (!canViewTicket(ticket, user)) throw ApiError.forbidden('You do not have access to this ticket.');
}

function isStaff(user) {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

const LIST_SELECT = `
  SELECT t.*,
         l.zone AS zone, l.building AS building,
         r.name AS requester_name, r.email AS requester_email, r.avatar_color AS requester_color,
         a.name AS assignee_name, a.email AS assignee_email, a.avatar_color AS assignee_color,
         (SELECT COUNT(*) FROM comments c WHERE c.ticket_id = t.id) AS comment_count,
         (SELECT COUNT(*) FROM ticket_attachments at WHERE at.ticket_id = t.id) AS attachment_count
    FROM tickets t
    JOIN users r ON r.id = t.requester_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN locations l ON l.id = t.location_id
`;

function buildFilters({ user, query }) {
  const where = [];
  const params = [];
  const csv = (value) => String(value).split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);

  // --- row-level security --------------------------------------------------
  if (user.role === 'REQUESTER') {
    where.push('t.requester_id = ?');
    params.push(user.id);
  } else if (user.role === 'TECHNICIAN') {
    where.push('(t.assignee_id = ? OR t.requester_id = ? OR (t.assignee_id IS NULL AND t.status NOT IN (?, ?, ?)))');
    params.push(user.id, user.id, 'RESOLVED', 'CLOSED', 'CANCELLED');
  }

  // --- explicit scopes -----------------------------------------------------
  const scope = (query.scope ?? '').toLowerCase();
  if (scope === 'mine') {
    where.push('t.requester_id = ?');
    params.push(user.id);
  } else if (scope === 'assigned') {
    where.push('t.assignee_id = ?');
    params.push(user.id);
  } else if (scope === 'unassigned') {
    where.push('t.assignee_id IS NULL');
  } else if (scope === 'open') {
    where.push(`t.status IN (${OPEN_STATUSES.map(() => '?').join(', ')})`);
    params.push(...OPEN_STATUSES);
  }

  if (query.status) {
    const statuses = csv(query.status);
    if (statuses.length) {
      where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
  }
  if (query.priority) {
    const priorities = csv(query.priority);
    if (priorities.length) {
      where.push(`t.priority IN (${priorities.map(() => '?').join(', ')})`);
      params.push(...priorities);
    }
  }
  if (query.category) {
    const categories = String(query.category).split(',').map((v) => v.trim()).filter(Boolean);
    if (categories.length) {
      where.push(`t.category IN (${categories.map(() => '?').join(', ')})`);
      params.push(...categories);
    }
  }
  if (query.assignee_id) {
    where.push('t.assignee_id = ?');
    params.push(Number(query.assignee_id));
  }
  if (query.requester_id) {
    where.push('t.requester_id = ?');
    params.push(Number(query.requester_id));
  }
  if (query.zone) {
    where.push('l.zone = ?');
    params.push(query.zone);
  }
  if (query.flagged) {
    where.push("t.ai_flags != '[]' AND t.ai_flags IS NOT NULL");
  }
  if (query.sla === 'breached') {
    where.push("t.sla_due_at IS NOT NULL AND t.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') AND datetime(t.sla_due_at) < datetime('now')");
  } else if (query.sla === 'at_risk') {
    where.push("t.sla_due_at IS NOT NULL AND t.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') AND datetime(t.sla_due_at) BETWEEN datetime('now') AND datetime('now', '+3 hours')");
  } else if (query.sla === 'on_track') {
    where.push("(t.sla_due_at IS NULL OR t.status IN ('RESOLVED', 'CLOSED', 'CANCELLED') OR datetime(t.sla_due_at) > datetime('now', '+3 hours'))");
  }
  if (query.from) {
    where.push('t.created_at >= ?');
    params.push(new Date(query.from).toISOString());
  }
  if (query.to) {
    where.push('t.created_at <= ?');
    params.push(new Date(query.to).toISOString());
  }
  if (query.q) {
    const term = `%${String(query.q).trim().toLowerCase()}%`;
    where.push('(lower(t.title) LIKE ? OR lower(t.description) LIKE ? OR lower(t.code) LIKE ? OR lower(t.location_text) LIKE ?)');
    params.push(term, term, term, term);
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SORTS = {
  newest: 't.created_at DESC',
  oldest: 't.created_at ASC',
  updated: 't.updated_at DESC',
  priority: `CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END ASC, t.created_at DESC`,
  sla: 't.sla_due_at IS NULL, t.sla_due_at ASC',
};

export function listTickets({ user, query }) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20));
  const offset = (page - 1) * limit;

  const { clause, params } = buildFilters({ user, query });
  const total = scalar(`SELECT COUNT(*) FROM tickets t LEFT JOIN locations l ON l.id = t.location_id ${clause}`, params);
  const order = SORTS[query.sort] ?? SORTS.newest;

  const rows = all(`${LIST_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);

  return {
    data: rows.map(serialiseTicket),
    meta: { page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)) },
  };
}

export function getTicketRow(id) {
  return get(`${LIST_SELECT} WHERE t.id = ?`, [Number(id)]);
}

export function getTicketDetail(id, user) {
  const row = getTicketRow(id);
  assertCanView(row, user);
  const ticket = serialiseTicket(row);

  const attachments = all(
    `SELECT at.*, u.name AS uploader_name FROM ticket_attachments at
       LEFT JOIN users u ON u.id = at.uploader_id
      WHERE at.ticket_id = ? ORDER BY at.created_at ASC`,
    [ticket.id],
  );

  const comments = all(
    `SELECT c.*, u.name AS author_name, u.role AS author_role, u.avatar_color AS author_color
       FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = ? ${canSeeInternal(user) ? '' : 'AND c.is_internal = 0'}
      ORDER BY c.created_at ASC`,
    [ticket.id],
  );

  const events = all(
    `SELECT e.*, u.name AS actor_name FROM ticket_events e
       LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.ticket_id = ? ORDER BY e.created_at ASC, e.id ASC`,
    [ticket.id],
  );

  const assignmentLogs = all(
    `SELECT al.*, u.name AS technician_name FROM assignment_logs al
       LEFT JOIN users u ON u.id = al.technician_id
      WHERE al.ticket_id = ? ORDER BY al.created_at DESC`,
    [ticket.id],
  );

  return {
    ...ticket,
    attachments: attachments.map((a) => ({ ...a, phase: a.phase ?? 'REPORT' })),
    comments: comments.map((c) => ({
      ...c,
      is_internal: c.is_internal === 1,
    })),
    events: events.map((e) => ({ ...e, meta: parseJson(e.meta, null) })),
    assignment_logs: assignmentLogs.map((log) => ({ ...log, reasons: parseJson(log.reasons, []) })),
    available_transitions: TRANSITIONS[ticket.status] ?? [],
  };
}

/** Suggested technicians (with score explanations) for the assign dialog. */
export function assignmentSuggestions(ticketId, user) {
  const row = getTicketRow(ticketId);
  assertCanView(row, user);
  if (!isStaff(user)) throw ApiError.forbidden('Only managers can view assignment suggestions.');
  const scoringTicket = ticketForScoring(ticketId);
  return rankTechnicians(scoringTicket, { limit: 8, includeUnavailable: true }).map((entry) => ({
    technician: {
      id: entry.technician.id,
      name: entry.technician.name,
      title: entry.technician.title,
      level: entry.technician.level,
      zone: entry.technician.zone,
      skills: entry.technician.skills,
      is_available: entry.technician.is_available,
      avatar_color: entry.technician.avatar_color,
    },
    score: entry.score,
    open_tickets: entry.open,
    available: entry.available,
    reasons: entry.reasons,
    breakdown: entry.breakdown,
  }));
}

/* -------------------------------------------------------------------------- */
/* Events & audit trail                                                       */
/* -------------------------------------------------------------------------- */

function recordEvent(ticketId, { actorId, type, message, fromValue, toValue, meta }) {
  run(
    `INSERT INTO ticket_events (ticket_id, actor_id, type, message, from_value, to_value, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, actorId ?? null, type, message ?? null, fromValue ?? null, toValue ?? null, meta ? JSON.stringify(meta) : null, nowIso()],
  );
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

function nextTicketCode() {
  const year = new Date().getUTCFullYear();
  const count = Number(scalar('SELECT COUNT(*) FROM tickets WHERE code LIKE ?', [`FF-${year}-%`]) ?? 0);
  let sequence = count + 1;
  let code = `FF-${year}-${String(sequence).padStart(4, '0')}`;
  // Defensive: keep incrementing if a code already exists (e.g. after deletions).
  while (scalar('SELECT 1 FROM tickets WHERE code = ?', [code])) {
    sequence += 1;
    code = `FF-${year}-${String(sequence).padStart(4, '0')}`;
  }
  return code;
}

function insertAttachments(ticketId, files, uploaderId, phase = 'REPORT') {
  const saved = [];
  for (const file of files ?? []) {
    const url = `/uploads/${file.filename}`;
    run(
      `INSERT INTO ticket_attachments (ticket_id, uploader_id, url, filename, mime, size, phase, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, uploaderId, url, file.originalname, file.mimetype, file.size, phase, nowIso()],
    );
    saved.push({ url, filename: file.originalname, mime: file.mimetype, size: file.size, phase });
  }
  return saved;
}

/**
 * Create a ticket: AI triage → SLA clock → auto-assignment → notifications.
 * Everything runs inside one transaction so a ticket is never half-created.
 */
export async function createTicket({ user, input, files = [] }) {
  const createdAt = nowIso();

  const analysis = await analyse({
    title: input.title,
    description: input.description,
    locationText: input.location_text,
    categoryHint: input.category_hint,
  });

  const category = input.category && input.category !== 'auto' ? input.category : analysis.category;
  const priority = input.priority && input.priority !== 'auto' ? input.priority : analysis.priority;
  const slaDueAt = computeSlaDueAt(category, priority, createdAt);

  const ticket = tx(() => {
    const code = nextTicketCode();
    const { lastInsertRowid } = run(
      `INSERT INTO tickets (
         code, title, description, category, priority, status,
         requester_id, location_id, location_text, latitude, longitude,
         ai_summary, ai_confidence, ai_tags, ai_flags, ai_urgency, ai_estimated_hours, ai_model, ai_source,
         sla_due_at, priority_overridden, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        input.title.trim(),
        input.description.trim(),
        category,
        priority,
        user.id,
        input.location_id ?? null,
        input.location_text ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        analysis.summary,
        analysis.confidence,
        JSON.stringify(analysis.tags),
        JSON.stringify(analysis.flags),
        analysis.urgency,
        analysis.estimatedHours,
        analysis.model,
        analysis.source,
        slaDueAt,
        input.priority && input.priority !== 'auto' && input.priority !== analysis.priority ? 1 : 0,
        input.source ?? 'WEB',
        createdAt,
        createdAt,
      ],
    );
    const ticketId = lastInsertRowid;

    insertAttachments(ticketId, files, user.id, 'REPORT');

    recordEvent(ticketId, {
      actorId: user.id,
      type: 'CREATED',
      message: `Ticket raised (${analysis.source === 'llm' ? 'AI + LLM' : 'AI'} triage: ${analysis.categoryLabel}, urgency ${analysis.urgency}/100)`,
    });
    recordEvent(ticketId, {
      actorId: null,
      type: 'AI_TRIAGE',
      message: analysis.summary,
      meta: {
        confidence: analysis.confidence,
        urgency: analysis.urgency,
        flags: analysis.flags,
        tags: analysis.tags,
        suggestedActions: analysis.suggestedActions,
        drivers: analysis.drivers,
        model: analysis.model,
      },
    });

    return { id: ticketId, code, category, priority };
  });

  // --- auto-assignment (outside the insert tx, still synchronous work) -----
  const scoringTicket = { ...ticketForScoring(ticket.id) };
  const best = pickBestTechnician(scoringTicket);

  if (best && !best.deferred) {
    assignTicket(ticket.id, { assigneeId: best.technician.id, mode: 'AUTO', actor: null, score: best.score, reasons: best.reasons });
  } else {
    if (best?.deferred) {
      recordEvent(ticket.id, {
        actorId: null,
        type: 'ASSIGNMENT_DEFERRED',
        message: 'No technician with the exact trade is free — routed to the manager queue.',
      });
    }
    notifyMany(managerIds(), {
      title: `New ${priority} ${category.replace(/_/g, ' ')} ticket needs routing`,
      body: `${ticket.code} — ${input.title}`,
      kind: priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      ticketId: ticket.id,
      link: `/tickets/${ticket.id}`,
    });
    // Nudge the trades that could cover it, so someone can self-serve.
    notifyMany(technicianIdsForCategory(category), {
      title: `Unassigned ${category.replace(/_/g, ' ')} job in the queue`,
      body: `${ticket.code} — ${input.title}`,
      kind: 'INFO',
      ticketId: ticket.id,
      link: `/tickets/${ticket.id}`,
    });
  }

  if (analysis.flags.length) {
    recordEvent(ticket.id, {
      actorId: null,
      type: 'SAFETY_FLAG',
      message: `Safety signals detected: ${analysis.flags.join(', ')}`,
    });
    if (ticket.priority === 'CRITICAL') {
      notifyMany(managerIds(), {
        title: `⚠ Safety-critical ticket ${ticket.code}`,
        body: analysis.summary,
        kind: 'CRITICAL',
        ticketId: ticket.id,
        link: `/tickets/${ticket.id}`,
      });
    }
  }

  const fresh = getTicketRow(ticket.id);
  emitTicketUpdate(fresh, [fresh.requester_id, fresh.assignee_id]);
  emitToBoard('stats:dirty', { reason: 'ticket:created' });
  return getTicketDetail(ticket.id, user);
}

/** Update editable fields (managers/owner-of-open-ticket). */
export function updateTicket(id, patch, actor) {
  const row = getTicketRow(id);
  assertCanView(row, actor);
  if (!isStaff(actor) && row.requester_id !== actor.id) {
    throw ApiError.forbidden('Only the reporter or a manager can edit this ticket.');
  }
  if (CLOSED_STATUSES.includes(row.status) && !isStaff(actor)) {
    throw ApiError.forbidden('Closed tickets can no longer be edited.');
  }

  const fields = [];
  const params = [];
  const changes = [];

  const setIf = (column, value, label) => {
    if (value === undefined) return;
    if (String(row[column]) === String(value)) return;
    fields.push(`${column} = ?`);
    params.push(value);
    changes.push({ field: label ?? column, from: row[column], to: value });
  };

  setIf('title', patch.title?.trim());
  setIf('description', patch.description?.trim());
  setIf('category', patch.category);
  setIf('location_text', patch.location_text);
  setIf('location_id', patch.location_id);

  // Priority change re-baselines the SLA clock and is recorded explicitly.
  if (patch.priority && patch.priority !== row.priority) {
    const newDue = computeSlaDueAt(patch.category ?? row.category, patch.priority, row.created_at);
    fields.push('priority = ?', 'sla_due_at = ?', 'priority_overridden = 1');
    params.push(patch.priority, newDue);
    changes.push({ field: 'priority', from: row.priority, to: patch.priority });
  }

  if (!fields.length) return getTicketDetail(id, actor);

  fields.push('updated_at = ?');
  params.push(nowIso(), id);
  run(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, params);

  for (const change of changes) {
    const type =
      change.field === 'priority' ? 'PRIORITY_CHANGED' : change.field === 'category' ? 'CATEGORY_CHANGED' : 'UPDATED';
    recordEvent(id, {
      actorId: actor.id,
      type,
      message: `${change.field} changed`,
      fromValue: change.from == null ? null : String(change.from),
      toValue: String(change.to),
    });
  }

  const fresh = getTicketRow(id);
  emitTicketUpdate(fresh, [fresh.requester_id, fresh.assignee_id]);
  notifyMany([fresh.requester_id, fresh.assignee_id].filter((uid) => uid && uid !== actor.id), {
    title: `Ticket ${fresh.code} was updated`,
    body: `${actor.name} changed ${changes.map((c) => c.field).join(', ')}.`,
    kind: 'INFO',
    ticketId: fresh.id,
    link: `/tickets/${fresh.id}`,
  });

  return getTicketDetail(id, actor);
}

/** Status transition with workflow validation, SLA stamps and notifications. */
export function changeStatus(id, { status, note }, actor) {
  const row = getTicketRow(id);
  assertCanView(row, actor);

  const target = String(status).toUpperCase();
  if (!STATUSES.includes(target)) throw ApiError.badRequest(`Unknown status "${status}".`);
  if (target === row.status) return getTicketDetail(id, actor);

  const allowed = TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(target)) {
    throw ApiError.conflict(`Cannot move a ${row.status} ticket to ${target}.`);
  }
  if (!ROLE_TRANSITIONS[actor.role]?.includes(target)) {
    throw ApiError.forbidden(`A ${actor.role.toLowerCase()} cannot set a ticket to ${target}.`);
  }
  // Technicians may only advance their own tickets (managers can move anything).
  if (actor.role === 'TECHNICIAN' && row.assignee_id && row.assignee_id !== actor.id) {
    throw ApiError.forbidden('This ticket is assigned to another technician.');
  }
  if (actor.role === 'TECHNICIAN' && !row.assignee_id && ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(target)) {
    // Self-serve pickup from the open queue.
    run('UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?', [actor.id, nowIso(), id]);
    recordEvent(id, { actorId: actor.id, type: 'ASSIGNED', message: 'Self-assigned from the open queue', toValue: actor.name });
  }

  const now = nowIso();
  const fields = ['status = ?', 'updated_at = ?'];
  const params = [target, now];

  if (!row.first_response_at && target !== 'NEW') {
    fields.push('first_response_at = ?');
    params.push(now);
  }
  if (target === 'RESOLVED' && !row.resolved_at) {
    fields.push('resolved_at = ?');
    params.push(now);
  }
  if (target === 'CLOSED' && !row.closed_at) {
    fields.push('closed_at = ?', 'resolved_at = COALESCE(resolved_at, ?)');
    params.push(now, now);
  }
  if (target === 'IN_PROGRESS' && CLOSED_STATUSES.includes(row.status)) {
    fields.push('reopen_count = reopen_count + 1', 'resolved_at = NULL', 'closed_at = NULL', 'sla_due_at = ?');
    params.push(computeSlaDueAt(row.category, row.priority, now));
  }
  if (CLOSED_STATUSES.includes(target)) {
    fields.push('sla_breached = CASE WHEN sla_due_at IS NOT NULL AND datetime(sla_due_at) < datetime(?) THEN 1 ELSE sla_breached END');
    params.push(now);
  }

  params.push(id);
  run(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, params);

  recordEvent(id, {
    actorId: actor.id,
    type: target === 'IN_PROGRESS' && CLOSED_STATUSES.includes(row.status) ? 'REOPENED' : 'STATUS_CHANGED',
    message: note?.trim() || `Status moved to ${target.replace(/_/g, ' ').toLowerCase()}`,
    fromValue: row.status,
    toValue: target,
  });

  if (note?.trim()) {
    run('INSERT INTO comments (ticket_id, author_id, body, is_internal, created_at) VALUES (?, ?, ?, 0, ?)', [
      id,
      actor.id,
      note.trim(),
      now,
    ]);
  }

  const audience = [row.requester_id, row.assignee_id].filter((uid) => uid && uid !== actor.id);
  const kind = target === 'RESOLVED' ? 'SUCCESS' : target === 'CANCELLED' ? 'WARNING' : 'INFO';
  notifyMany(audience, {
    title: `${row.code} → ${target.replace(/_/g, ' ')}`,
    body: note?.trim() || `${actor.name} updated the ticket status.`,
    kind,
    ticketId: id,
    link: `/tickets/${id}`,
  });
  if (target === 'ON_HOLD' || target === 'CANCELLED') {
    notifyMany(managerIds().filter((uid) => uid !== actor.id), {
      title: `${row.code} moved to ${target.replace(/_/g, ' ')}`,
      body: note?.trim() || `${actor.name} changed the status.`,
      kind: 'WARNING',
      ticketId: id,
      link: `/tickets/${id}`,
    });
  }

  const fresh = getTicketRow(id);
  emitTicketUpdate(fresh, [fresh.requester_id, fresh.assignee_id], 'ticket:status');
  emitToBoard('stats:dirty', { reason: 'status:changed' });

  return getTicketDetail(id, actor);
}

/** Manual or automatic assignment. */
export function assignTicket(id, { assigneeId, mode = 'MANUAL', actor = null, score = null, reasons = [] }) {
  const row = getTicketRow(id);
  if (!row) throw ApiError.notFound('That ticket does not exist.');

  const numericId = assigneeId == null ? null : Number(assigneeId);
  let technician = null;
  if (numericId) {
    technician = get('SELECT * FROM users WHERE id = ? AND role = ?', [numericId, 'TECHNICIAN']);
    if (!technician) throw ApiError.badRequest('That person is not a technician.');
  }

  const previous = row.assignee_id ?? null;
  const statusPatch = numericId && ['NEW', 'TRIAGED'].includes(row.status) ? ", status = 'ASSIGNED'" : '';
  run(`UPDATE tickets SET assignee_id = ?, updated_at = ?${statusPatch} WHERE id = ?`, [
    numericId,
    nowIso(),
    id,
  ]);

  run(
    `INSERT INTO assignment_logs (ticket_id, technician_id, score, mode, reasons, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, numericId, score, mode, JSON.stringify(reasons), nowIso()],
  );

  recordEvent(id, {
    actorId: actor?.id ?? null,
    type: 'ASSIGNED',
    message: technician
      ? `${mode === 'AUTO' ? 'Auto-assigned' : 'Assigned'} to ${technician.name}${reasons.length ? ` — ${reasons.slice(0, 2).join('; ')}` : ''}`
      : 'Unassigned — returned to the manager queue',
    fromValue: previous ? String(previous) : null,
    toValue: numericId ? String(numericId) : null,
    meta: { score, mode, reasons },
  });

  if (technician) {
    notifyUser({
      userId: technician.id,
      title: mode === 'AUTO' ? `Auto-assigned: ${row.code}` : `New assignment: ${row.code}`,
      body: `${row.title} · ${row.priority} priority${row.sla_due_at ? ` · SLA due ${new Date(row.sla_due_at).toUTCString()}` : ''}`,
      kind: row.priority === 'CRITICAL' ? 'CRITICAL' : 'INFO',
      ticketId: id,
      link: `/tickets/${id}`,
    });
    if (actor) {
      notifyUser({
        userId: row.requester_id,
        title: `${row.code} has been assigned`,
        body: `${technician.name} will handle your request.`,
        kind: 'INFO',
        ticketId: id,
        link: `/tickets/${id}`,
      });
    }
  } else if (actor) {
    notifyMany(managerIds().filter((uid) => uid !== actor.id), {
      title: `${row.code} was unassigned`,
      body: `${actor.name} returned the ticket to the queue.`,
      kind: 'WARNING',
      ticketId: id,
      link: `/tickets/${id}`,
    });
  }

  const fresh = getTicketRow(id);
  emitTicketUpdate(fresh, [fresh.requester_id, fresh.assignee_id], 'ticket:assigned');
  emitToBoard('stats:dirty', { reason: 'assignment' });
  return getTicketDetail(id, actor ?? { id: null, role: 'ADMIN', name: 'FixFlow Auto-Dispatch' });
}

export function addComment(id, { body, isInternal }, actor) {
  const row = getTicketRow(id);
  assertCanView(row, actor);
  const internal = isInternal === true && canSeeInternal(actor);
  const now = nowIso();

  run('INSERT INTO comments (ticket_id, author_id, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    actor.id,
    body.trim(),
    internal ? 1 : 0,
    now,
  ]);

  const fields = ['updated_at = ?'];
  const params = [now];
  // First staff reply starts the response-time clock.
  if (!row.first_response_at && actor.id !== row.requester_id) {
    fields.push('first_response_at = ?');
    params.push(now);
  }
  params.push(id);
  run(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, params);

  recordEvent(id, { actorId: actor.id, type: 'COMMENTED', message: internal ? 'Added an internal note' : 'Replied to the ticket' });

  if (!internal) {
    notifyMany([row.requester_id, row.assignee_id].filter((uid) => uid && uid !== actor.id), {
      title: `New message on ${row.code}`,
      body: body.trim().slice(0, 140),
      kind: 'INFO',
      ticketId: id,
      link: `/tickets/${id}`,
    });
  }

  const fresh = getTicketRow(id);
  emitTicketUpdate(fresh, [fresh.requester_id, fresh.assignee_id], 'ticket:commented');
  return getTicketDetail(id, actor);
}

/** Resolution proof / extra photos attached after creation. */
export function addAttachments(id, files, actor, phase = 'REPORT') {
  const row = getTicketRow(id);
  assertCanView(row, actor);
  if (!files?.length) throw ApiError.badRequest('No files were uploaded.');
  const saved = insertAttachments(id, files, actor.id, phase.toUpperCase() === 'RESOLUTION' ? 'RESOLUTION' : 'REPORT');
  run('UPDATE tickets SET updated_at = ? WHERE id = ?', [nowIso(), id]);
  recordEvent(id, {
    actorId: actor.id,
    type: 'ATTACHMENT',
    message: `Uploaded ${saved.length} file${saved.length === 1 ? '' : 's'}${phase.toUpperCase() === 'RESOLUTION' ? ' as proof of resolution' : ''}`,
  });
  const fresh = getTicketRow(id);
  emitTicketUpdate(fresh, [fresh.requester_id, fresh.assignee_id], 'ticket:attachment');
  return saved;
}

/* -------------------------------------------------------------------------- */
/* SLA sweep — called on an interval by the server                            */
/* -------------------------------------------------------------------------- */

export function sweepSlaBreaches() {
  const due = all(
    `SELECT t.id, t.code, t.title, t.priority, t.assignee_id, t.requester_id
       FROM tickets t
      WHERE t.sla_breached = 0
        AND t.sla_due_at IS NOT NULL
        AND t.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')
        AND datetime(t.sla_due_at) < datetime('now')`,
  );
  if (!due.length) return 0;

  for (const ticket of due) {
    run('UPDATE tickets SET sla_breached = 1, updated_at = ? WHERE id = ?', [nowIso(), ticket.id]);
    recordEvent(ticket.id, {
      actorId: null,
      type: 'SLA_BREACH',
      message: 'SLA target passed without resolution',
      toValue: 'BREACHED',
    });
    notifyMany([ticket.assignee_id, ...managerIds()].filter(Boolean), {
      title: `⏰ SLA breached on ${ticket.code}`,
      body: `${ticket.priority} priority: ${ticket.title}`,
      kind: 'CRITICAL',
      ticketId: ticket.id,
      link: `/tickets/${ticket.id}`,
    });
  }

  emitToBoard('stats:dirty', { reason: 'sla:sweep', count: due.length });
  if (due.length) emitToRole('ADMIN', 'sla:breached', { count: due.length });
  return due.length;
}

export function ticketCounts({ user }) {
  const visibleClause =
    user.role === 'REQUESTER'
      ? { sql: 'WHERE t.requester_id = ?', params: [user.id] }
      : user.role === 'TECHNICIAN'
        ? {
            sql: `WHERE (t.assignee_id = ? OR t.requester_id = ? OR (t.assignee_id IS NULL AND t.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')))`,
            params: [user.id, user.id],
          }
        : { sql: '', params: [] };

  const rows = all(`SELECT t.status, COUNT(*) AS count FROM tickets t ${visibleClause.sql} GROUP BY t.status`, visibleClause.params);
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}
