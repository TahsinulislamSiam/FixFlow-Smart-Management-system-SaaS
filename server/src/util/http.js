/**
 * Small HTTP helpers: typed errors, async wrapping, pagination and a
 * consistent JSON envelope (`{ data, meta }` / `{ error }`).
 */

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'You must be signed in to do that.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Your role does not allow this action.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }
}

/** Wrap an async route handler so rejections reach the error middleware. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function pagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit ?? String(defaultLimit), 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginated(data, total, { page, limit }) {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}

/** Zod → ApiError(400) with a readable field map. */
export function parseBody(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!details[key]) details[key] = issue.message;
    }
    throw ApiError.badRequest('Please check the highlighted fields.', details);
  }
  return result.data;
}
