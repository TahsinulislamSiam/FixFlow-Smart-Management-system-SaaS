import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, parseBody, ApiError } from '../util/http.js';
import { requireAuth, requireManager } from '../middleware/auth.js';
import { uploadPhotos } from '../middleware/upload.js';
import {
  addAttachments,
  addComment,
  assignTicket,
  assignmentSuggestions,
  changeStatus,
  createTicket,
  getTicketDetail,
  getTicketRow,
  listTickets,
  assertCanView,
  ticketCounts,
  updateTicket,
  STATUSES,
  PRIORITIES,
} from '../services/tickets.js';
import { analyse } from '../services/ai.js';

export const ticketsRouter = Router();

/** Multipart bodies arrive as strings — normalise the numeric/boolean fields. */
function coerceForm(body = {}) {
  const out = { ...body };
  for (const key of ['location_id', 'latitude', 'longitude']) {
    if (out[key] === '' || out[key] === undefined || out[key] === null) out[key] = null;
    else {
      const parsed = Number(out[key]);
      out[key] = Number.isFinite(parsed) ? parsed : null;
    }
  }
  if (out.priority) out.priority = String(out.priority).toUpperCase();
  if (out.category && out.category !== 'auto') out.category = String(out.category);
  if (out.is_internal !== undefined) out.is_internal = out.is_internal === true || out.is_internal === 'true' || out.is_internal === '1';
  return out;
}

const ticketId = (req) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw ApiError.notFound('That ticket does not exist.');
  return id;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

ticketsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listTickets({ user: req.user, query: req.query ?? {} });
    return res.json(result);
  }),
);

ticketsRouter.get(
  '/counts',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, ticketCounts({ user: req.user }))),
);

/** Live AI preview while the user is still typing — powers the form's "AI insight" panel. */
ticketsRouter.post(
  '/ai/preview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        title: z.string().trim().max(160).default(''),
        description: z.string().trim().max(4000).default(''),
        category_hint: z.string().optional(),
        location_text: z.string().trim().max(200).optional(),
      }),
      req.body ?? {},
    );
    if (`${input.title}${input.description}`.trim().length < 8) {
      return ok(res, { skipped: true, reason: 'Add a few more words for a triage prediction.' });
    }
    const analysis = await analyse(input);
    return ok(res, {
      skipped: false,
      category: analysis.category,
      category_label: analysis.categoryLabel,
      priority: analysis.priority,
      urgency: analysis.urgency,
      confidence: analysis.confidence,
      sentiment: analysis.sentiment,
      flags: analysis.flags,
      tags: analysis.tags,
      summary: analysis.summary,
      suggested_actions: analysis.suggestedActions,
      estimated_hours: analysis.estimatedHours,
      drivers: analysis.drivers,
      model: analysis.model,
      source: analysis.source,
    });
  }),
);

ticketsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, getTicketDetail(ticketId(req), req.user))),
);

ticketsRouter.get(
  '/:id/suggestions',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => ok(res, assignmentSuggestions(ticketId(req), req.user))),
);

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  title: z.string().trim().min(5, 'Give the issue a short title.').max(160),
  description: z.string().trim().min(10, 'Describe the problem in a little more detail.').max(4000),
  category: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  location_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  location_text: z.string().trim().max(200).nullable().optional(),
  latitude: z.union([z.number(), z.string(), z.null()]).optional(),
  longitude: z.union([z.number(), z.string(), z.null()]).optional(),
  source: z.string().trim().max(20).optional(),
});

ticketsRouter.post(
  '/',
  requireAuth,
  uploadPhotos,
  asyncHandler(async (req, res) => {
    const input = parseBody(createSchema, coerceForm(req.body));
    const ticket = await createTicket({ user: req.user, input, files: req.files ?? [] });
    return ok(res, ticket, 201);
  }),
);

const patchSchema = z.object({
  title: z.string().trim().min(5).max(160).optional(),
  description: z.string().trim().min(10).max(4000).optional(),
  category: z.string().trim().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  location_id: z.number().int().positive().nullable().optional(),
  location_text: z.string().trim().max(200).nullable().optional(),
});

ticketsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(patchSchema, req.body ?? {});
    return ok(res, updateTicket(ticketId(req), input, req.user));
  }),
);

ticketsRouter.post(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        status: z.enum(STATUSES),
        note: z.string().trim().max(1000).optional(),
      }),
      req.body ?? {},
    );
    return ok(res, changeStatus(ticketId(req), input, req.user));
  }),
);

ticketsRouter.post(
  '/:id/assign',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => {
    const id = ticketId(req);
    const input = parseBody(
      z.object({
        assignee_id: z.union([z.number().int().positive(), z.null()]).optional(),
        mode: z.enum(['AUTO', 'MANUAL']).default('MANUAL'),
      }),
      req.body ?? {},
    );

    if (input.mode === 'AUTO' && input.assignee_id == null) {
      const { pickBestTechnician, ticketForScoring } = await import('../services/assignment.js');
      const best = pickBestTechnician(ticketForScoring(id));
      if (!best) throw ApiError.conflict('No suitable technician is available right now.');
      return ok(res, assignTicket(id, {
        assigneeId: best.technician.id,
        mode: 'AUTO',
        actor: req.user,
        score: best.score,
        reasons: best.reasons,
      }));
    }

    return ok(res, assignTicket(id, { assigneeId: input.assignee_id ?? null, mode: input.mode, actor: req.user }));
  }),
);

ticketsRouter.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        body: z.string().trim().min(1, 'Write a message first.').max(4000),
        is_internal: z.boolean().default(false),
      }),
      req.body ?? {},
    );
    return ok(res, addComment(ticketId(req), input, req.user), 201);
  }),
);

ticketsRouter.post(
  '/:id/attachments',
  requireAuth,
  uploadPhotos,
  asyncHandler(async (req, res) => {
    const id = ticketId(req);
    assertCanView(getTicketRow(id), req.user);
    const phase = String(req.body?.phase ?? 'REPORT');
    const saved = addAttachments(id, req.files ?? [], req.user, phase);
    return ok(res, { attachments: saved, ticket: getTicketDetail(id, req.user) }, 201);
  }),
);

export const TICKET_STATUSES = STATUSES;
export const TICKET_PRIORITIES = PRIORITIES;
