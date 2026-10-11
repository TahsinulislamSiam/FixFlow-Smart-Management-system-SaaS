/**
 * Typed-ish API client.
 * - one place that knows about the token, JSON envelopes and error shapes
 * - unwraps the server's `{ data, meta }` envelope so callers get plain objects
 * - throws `ApiError` with field-level `details` for form validation
 */

const TOKEN_KEY = 'fixflow.token';

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage disabled — session stays in memory */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

function buildQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request(path, { method = 'GET', body, form, query, signal, raw = false } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form; // FormData — let the browser set the boundary
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}${buildQuery(query)}`, { method, headers, body: payload, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the FixFlow API. Is the server running?', 0);
  }

  if (response.status === 204) return raw ? response : null;

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const message = json?.error ?? `Request failed (${response.status})`;
    if (response.status === 401) tokenStore.clear();
    throw new ApiError(message, response.status, json?.details ?? null);
  }

  return raw ? response : (json?.data ?? json);
}

/** Like `request`, but keeps the pagination `meta` from the server envelope. */
async function requestWithMeta(path, { query, signal } = {}) {
  const response = await fetch(`/api${path}${buildQuery(query)}`, {
    headers: tokenStore.get() ? { authorization: `Bearer ${tokenStore.get()}` } : {},
    signal,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) tokenStore.clear();
    throw new ApiError(json?.error ?? `Request failed (${response.status})`, response.status, json?.details ?? null);
  }
  return { data: json.data ?? [], meta: json.meta };
}

export const api = {
  /* ---------------------------------------------------------------- auth */
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (input) => request('/auth/register', { method: 'POST', body: input }),
  me: () => request('/auth/me'),
  updateMe: (input) => request('/auth/me', { method: 'PATCH', body: input }),
  demoAccounts: () => request('/auth/demo-accounts'),
  meta: () => request('/auth/meta'),

  /* ------------------------------------------------------------- tickets */
  tickets: {
    /** Returns `{ data, meta }` so the list view can render pagination. */
    list: (query, signal) => requestWithMeta('/tickets', { query, signal }),
    counts: () => request('/tickets/counts'),
    get: (id) => request(`/tickets/${id}`),
    create: (form) => request('/tickets', { method: 'POST', form }),
    update: (id, body) => request(`/tickets/${id}`, { method: 'PATCH', body }),
    setStatus: (id, status, note) => request(`/tickets/${id}/status`, { method: 'POST', body: { status, note } }),
    assign: (id, body) => request(`/tickets/${id}/assign`, { method: 'POST', body }),
    suggestions: (id) => request(`/tickets/${id}/suggestions`),
    comment: (id, body, is_internal) => request(`/tickets/${id}/comments`, { method: 'POST', body: { body, is_internal } }),
    upload: (id, form) => request(`/tickets/${id}/attachments`, { method: 'POST', form }),
    preview: (input, signal) => request('/tickets/ai/preview', { method: 'POST', body: input, signal }),
  },

  /* --------------------------------------------------------------- users */
  users: {
    list: (query) => request('/users', { query }),
    technicians: () => request('/users/technicians'),
    get: (id) => request(`/users/${id}`),
    update: (id, body) => request(`/users/${id}`, { method: 'PATCH', body }),
    create: (body) => request('/users', { method: 'POST', body }),
    resetPassword: (id, password) => request(`/users/${id}/reset-password`, { method: 'POST', body: { password } }),
    skillCatalog: () => request('/users/skills/catalog'),
  },

  /* ----------------------------------------------------------- analytics */
  analytics: {
    summary: () => request('/analytics/summary'),
    overview: () => request('/analytics/overview'),
    categories: () => request('/analytics/categories'),
    technicians: () => request('/analytics/technicians'),
    sla: () => request('/analytics/sla'),
    hotspots: () => request('/analytics/hotspots'),
  },

  dashboard: () => request('/dashboard'),

  /* ------------------------------------------------------- notifications */
  notifications: {
    list: (query) => request('/notifications', { query }),
    unread: () => request('/notifications/unread-count'),
    read: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
    readAll: () => request('/notifications/read-all', { method: 'POST' }),
    remove: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  },

  /* --------------------------------------------------------------- meta */
  meta: {
    health: () => request('/meta/health'),
    categories: () => request('/meta/categories'),
    locations: () => request('/meta/locations'),
    zones: () => request('/meta/zones'),
    publicStats: () => request('/meta/public-stats'),
  },
};

export { buildQuery, request };
