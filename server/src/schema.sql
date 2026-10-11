-- ---------------------------------------------------------------------------
-- FixFlow schema (SQLite)
-- Timestamps are ISO-8601 UTC strings so they round-trip through JSON untouched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER')),
  level          TEXT    NOT NULL DEFAULT 'JUNIOR' CHECK (level IN ('JUNIOR', 'SENIOR', 'LEAD')),
  phone          TEXT,
  title          TEXT,
  department     TEXT,
  zone           TEXT,
  skills         TEXT    NOT NULL DEFAULT '[]',   -- JSON array of category keys
  is_available   INTEGER NOT NULL DEFAULT 1,
  avatar_color   TEXT,
  created_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  key              TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  icon             TEXT,
  default_priority TEXT NOT NULL,
  sla_hours        INTEGER NOT NULL,
  description      TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  building TEXT,
  floor    TEXT,
  zone     TEXT,
  address  TEXT,
  lat      REAL,
  lng      REAL
);

CREATE TABLE IF NOT EXISTS tickets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  code                TEXT    NOT NULL UNIQUE,
  title               TEXT    NOT NULL,
  description         TEXT    NOT NULL,
  category            TEXT    NOT NULL REFERENCES categories(key),
  priority            TEXT    NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status              TEXT    NOT NULL CHECK (status IN ('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED')),
  requester_id        INTEGER NOT NULL REFERENCES users(id),
  assignee_id         INTEGER REFERENCES users(id),
  location_id         INTEGER REFERENCES locations(id),
  location_text       TEXT,
  latitude            REAL,
  longitude           REAL,
  -- AI triage output -------------------------------------------------------
  ai_summary          TEXT,
  ai_confidence       REAL,
  ai_tags             TEXT    NOT NULL DEFAULT '[]',
  ai_flags            TEXT    NOT NULL DEFAULT '[]',
  ai_urgency          INTEGER NOT NULL DEFAULT 0,
  ai_estimated_hours  REAL,
  ai_model            TEXT,
  ai_source           TEXT,
  -- Workflow / SLA ---------------------------------------------------------
  sla_due_at          TEXT,
  sla_breached        INTEGER NOT NULL DEFAULT 0,
  first_response_at   TEXT,
  resolved_at         TEXT,
  closed_at           TEXT,
  priority_overridden INTEGER NOT NULL DEFAULT 0,
  reopen_count        INTEGER NOT NULL DEFAULT 0,
  source              TEXT    NOT NULL DEFAULT 'WEB',
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploader_id INTEGER REFERENCES users(id),
  url        TEXT    NOT NULL,
  filename   TEXT    NOT NULL,
  mime       TEXT,
  size       INTEGER,
  phase      TEXT    NOT NULL DEFAULT 'REPORT',  -- REPORT (problem) | RESOLUTION (proof of fix)
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id),
  type       TEXT    NOT NULL,                    -- CREATED | ASSIGNED | STATUS_CHANGED | PRIORITY_CHANGED | COMMENTED | ATTACHMENT | REOPENED | SLA_BREACH | AI_TRIAGE
  message    TEXT,
  from_value TEXT,
  to_value   TEXT,
  meta       TEXT,                                -- JSON blob for structured extras
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  body        TEXT    NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT,
  kind       TEXT    NOT NULL DEFAULT 'INFO',
  ticket_id  INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES users(id),
  score       REAL,
  mode        TEXT    NOT NULL,                   -- AUTO | MANUAL
  reasons     TEXT,                               -- JSON array of human readable reasons
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority    ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category    ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee    ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester   ON tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created     ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_ticket       ON ticket_events(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ticket     ON comments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket  ON ticket_attachments(ticket_id);
