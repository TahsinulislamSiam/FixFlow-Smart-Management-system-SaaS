# 🔧 FixFlow — Smart Maintenance Management SaaS

> Report a maintenance problem, let FixFlow categorise it, route it to the right technician,
> track the repair in real time, and prove the fix with response-time analytics — all in one place.

FixFlow is a full-stack **facility / maintenance management** MVP for apartments, offices,
universities, clinics and businesses. Anyone can raise a ticket with a photo and GPS in seconds;
FixFlow's AI triage engine sorts it, a transparent skill-and-workload scorer assigns it, and
managers get a live SLA + performance dashboard on top.

---

## ✨ Feature highlights

FixFlow is built around five standout features:

| # | Feature | What it does |
|---|---------|--------------|
| 1 | **📸 Photo & location reports** | Multi-photo ticket creation with GPS capture, a site/dealer directory, and a map pin per location. Photos are served from `/uploads`. |
| 2 | **🧠 Skill & workload auto-assignment** | A transparent weighted scorer picks the best technician by trade match, zone proximity, spare capacity, seniority and track record — with a human-readable "why this technician" breakdown. |
| 3 | **⚡ Realtime status & notifications** | Socket.IO pushes ticket updates, assignment changes, comments, SLA breaches and a live notification inbox to every connected client. |
| 4 | **📊 Admin analytics dashboard** | SLA compliance, resolution times, category mix, technician leaderboard, hotspot zones and a priority matrix — rendered with Recharts. |
| 5 | **🤖 AI complaint categorisation & urgency** | A deterministic in-house NLP engine (`fixflow-triage-v1`) predicts category, urgency, sentiment, safety flags and suggested actions; optionally blended with an LLM. |

Plus the expected plumbing: role-based access control, a full ticket workflow/state machine,
threaded comments, audit trail, notifications, technician profiles and admin user management.

---

## 🖼️ Screenshots

> Add your own screenshots to `docs/screenshots/` and link them here.

| Login | Dashboard |
|-------|-----------|
| _`docs/screenshots/login.png`_ | _`docs/screenshots/dashboard.png`_ |

| Ticket detail | Analytics |
|---------------|-----------|
| _`docs/screenshots/ticket.png`_ | _`docs/screenshots/analytics.png`_ |

---

## 🧱 Tech stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 22+, Express 4, Socket.IO 4, `jsonwebtoken`, `bcryptjs`, `zod`, `multer` |
| **Database** | SQLite via the **built-in `node:sqlite`** module (no native build step) |
| **Frontend** | React 18, Vite 6, Tailwind CSS 4, React Router 7, Recharts 2, `socket.io-client` |
| **Tests** | `node:test` (built-in) — 11 tests across the AI engine and assignment scorer |
| **Monorepo** | npm workspaces (`server` + `web`) |

**Zero native dependencies.** The whole stack installs and runs with a single `npm install`.

---

## 📁 Project structure

```
fixflow/
├── package.json              # npm workspaces root + orchestration scripts
├── .env.example              # documented configuration template
├── server/
│   ├── package.json
│   ├── data/                 # SQLite database (git-ignored, created on seed)
│   ├── uploads/              # Uploaded photos (git-ignored, created at runtime)
│   ├── test/                 # node:test suites (ai, assignment)
│   └── src/
│       ├── index.js          # Express app + HTTP server + Socket.IO bootstrap
│       ├── config.js         # env parsing & runtime dirs
│       ├── db.js             # node:sqlite wrapper (all/get/run/scalar/…)
│       ├── schema.sql        # tables, indexes, views
│       ├── seed.js           # reproducible demo data generator
│       ├── realtime.js       # Socket.IO rooms, presence, event emitters
│       ├── middleware/       # auth (JWT), upload (multer)
│       ├── routes/           # auth, tickets, users, analytics, notifications, meta
│       ├── services/         # ai, assignment, tickets, analytics, notifications
│       └── util/             # http helpers, password hashing
└── web/
    ├── package.json
    ├── vite.config.js        # dev proxy → :4000
    └── src/
        ├── main.jsx / App.jsx  # router + providers
        ├── pages/              # Login, Register, Dashboard, Tickets, NewTicket,
        │                       # TicketDetail, Team, Analytics, Settings
        ├── components/         # AppShell, TicketCard, NotificationPanel, Charts, AiInsight, ui, icons
        ├── context/            # Auth, Meta, Toast, Realtime
        ├── hooks/              # useNotifications
        └── lib/                # api client, constants, format helpers
```

---

## 🚀 Quickstart

### Prerequisites

- **Node.js ≥ 22.5** (needs the built-in `node:sqlite` module) — `node -v`
- **npm ≥ 10**

### 1. Install & seed

```bash
npm run setup        # installs both workspaces, then seeds the demo database
```

### 2. (Optional) configure

```bash
cp .env.example .env
```

The app runs with sensible defaults, so this step is optional for the demo.

### 3. Run

```bash
npm run dev
```

This starts both services together:

- **API** → http://localhost:4000  (`/api/health`)
- **Web** → http://localhost:5173  ← open this in your browser

The Vite dev server proxies `/api`, `/uploads` and `/socket.io` to the API on port 4000.

---

## 🔑 Demo accounts

The seed script creates a full set of personas. **All demo accounts use the password `FixFlow123!`.**

| Role | Email | Persona |
|------|-------|---------|
| **ADMIN** | `admin@fixflow.dev` | Amara Osei — Chief Operations Officer |
| **MANAGER** | `manager@fixflow.dev` | Daniel Fischer — Maintenance Manager |
| **TECHNICIAN** | `tech.electrical@fixflow.dev` | Marcus Reed — Senior Electrical Engineer |
| **REQUESTER** | `hannah@fixflow.dev` | Hannah Cole — Office Manager |

Other seeded logins: `manager2@fixflow.dev`, plus technicians for HVAC, plumbing, IT,
lifts, cleaning, structural, security and appliances (`tech.hvac@fixflow.dev`, etc.),
and requesters (`omar@`, `yuki@`, `fatima@`, `peter@`, `chloe@`, `samuel@`, `ines@`).

The login screen offers **one-click demo logins** (served from `GET /api/auth/demo-accounts`),
so you can hop between roles instantly rather than typing credentials.

### Seeded demo data

Reproducible (seeded PRNG) so every machine looks the same:
**20 users · 9 technicians · 12 categories · 14 locations · 46 tickets · 61 comments ·
413 events · 49 attachments · 44 notifications.**

---

## 📜 npm scripts

Run from the repository root:

| Script | Description |
|--------|-------------|
| `npm run setup` | `npm install` + seed the database |
| `npm run dev` | Run API + web dev server together (concurrently) |
| `npm run dev:api` | API only (watch mode) |
| `npm run dev:web` | Web dev server only |
| `npm run seed` | Seed demo data |
| `npm run reset` | Drop & re-seed the database from scratch |
| `npm test` | Run the backend test suite (`node:test`) |
| `npm run build` | Production build of the web client → `web/dist` |
| `npm run preview` | Preview the built web client |
| `npm start` | Run the API in production mode (serves `web/dist` if present) |

> **Note:** the API scripts pass `--experimental-sqlite`, so you will see a
> `ExperimentalWarning: SQLite is an experimental feature` line on startup. That is expected.

---

## 🔍 How the standout features work

### 1. Photo & location reports
`POST /api/tickets` accepts `multipart/form-data` with up to 8 `photos[]`. Coordinates come
from the browser's geolocation API (or are typed in), and each ticket binds to a row in the
`locations` directory (building / floor / zone / address / lat / lng). Attachments can also be
added after the fact with a `REPORT` / `RESOLUTION` phase.

### 2. Skill & workload auto-assignment
`server/src/services/assignment.js` scores every available technician and explains itself:

| Factor | Weight |
|--------|-------:|
| Exact trade match | **+40** |
| Adjacent/crossover trade | +18 |
| Spare capacity (20 − 5 × open tickets) | **+20** |
| Same zone as the fault | +16 |
| Available for work | +10 |
| Same building | +8 |
| Seniority (LEAD / SENIOR, JUNIOR penalty) | +12 / +8 / −10 |
| Track record (resolved tickets) | up to +8 |
| Ticket on hold | −6 |

Scores are capped at 100. Managers can request ranked `GET /api/tickets/:id/suggestions`,
or one-click **auto-assign** (`POST /api/tickets/:id/assign` with `mode: "AUTO"`).

### 3. Realtime status & notifications
Socket.IO rooms key off the authenticated user and the focused ticket. Events emitted:
`notification`, `ticket:created`, `ticket:updated`, `ticket:status`, `ticket:assigned`,
`ticket:commented`, `ticket:attachment`, `stats:dirty`, `sla:breached`, `presence:update`.
A background watchdog sweeps for SLA breaches every 60 seconds and pushes alerts.

### 4. Admin analytics dashboard
`GET /api/analytics/summary` (and friends) feed the Recharts dashboard: SLA compliance %,
first-response and resolution times, reopen rate, category mix, technician leaderboard,
zone hotspots and a priority × category matrix.

### 5. AI complaint categorisation & urgency
`server/src/services/ai.js` implements **`fixflow-triage-v1`**: a lexicon + rules engine that
predicts category, priority (`LOW/MEDIUM/HIGH/CRITICAL`), an urgency score, sentiment,
safety flags (e.g. `STRUCTURAL_RISK`, fire/smoke, electrical hazard), tags, a one-line summary
and suggested first actions. A live preview powers the "AI insight" panel while the user types
(`POST /api/tickets/ai/preview`).

If `OPENAI_API_KEY` is set, the heuristic result is blended with an LLM and falls back
**silently** to the heuristic on any error — so the demo always works offline and deterministically.

**SLA policy:** `due_at = created_at + category_baseline_hours × priority_multiplier`
(`CRITICAL ×0.25`, `HIGH ×0.5`, `MEDIUM ×1`, `LOW ×2`).

---

## 🧮 Domain model

**Roles:** `ADMIN`, `MANAGER`, `TECHNICIAN`, `REQUESTER`
**Technician levels:** `JUNIOR`, `SENIOR`, `LEAD`

**Ticket statuses** (workflow):
`NEW → TRIAGED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`
side states: `ON_HOLD`, `CANCELLED`

**Ticket priorities:** `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

**Core tables:** `users`, `categories`, `locations`, `tickets`, `ticket_comments`,
`ticket_events` (audit trail), `attachments`, `notifications`, `assignment_logs`.

---

## 🌐 API reference

All responses are JSON shaped as `{ "data": … }` on success and `{ "error": "…" }` on failure.
Authenticated routes expect `Authorization: Bearer <token>`.

### Auth — `/api/auth`
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/register` | Self-signup as `REQUESTER` or `TECHNICIAN` only |
| `POST` | `/login` | Returns `{ token, user }` |
| `GET` | `/me` | Current user |
| `PATCH` | `/me` | Update profile, skills, availability, password |
| `GET` | `/demo-accounts` | One-click persona list (disabled in production) |
| `GET` | `/meta` | Category list + AI metadata |

### Meta — `/api/meta` (public)
`GET /health` · `GET /categories` · `GET /locations` · `GET /zones` ·
`GET /public-stats` · `GET /users/:id/card`

### Tickets — `/api/tickets`
| Method | Path | Access | Notes |
|--------|------|--------|-------|
| `GET` | `/` | auth | Filters: `status`, `priority`, `category`, `scope` (`mine\|assigned\|unassigned\|open`), `sla`, `q`, `sort`, `page`, `limit`; `?view=board` for kanban |
| `GET` | `/counts` | auth | Badge counts per status/scope |
| `POST` | `/ai/preview` | auth | Live triage prediction while typing |
| `GET` | `/:id` | auth | Full detail: comments, events, attachments, assignment log, transitions |
| `GET` | `/:id/suggestions` | manager | Ranked technician suggestions |
| `POST` | `/` | auth | Create (multipart `photos[]`) |
| `PATCH` | `/:id` | auth | Edit title/description/category/priority/location |
| `POST` | `/:id/status` | auth | Transition status (+ optional note) |
| `POST` | `/:id/assign` | manager | `mode: MANUAL \| AUTO` |
| `POST` | `/:id/comments` | auth | Add comment (public or internal) |
| `POST` | `/:id/attachments` | auth | Add photos (`REPORT`/`RESOLUTION` phase) |

### Users — `/api/users`
`GET /technicians` (auth) · `GET /` (manager) · `GET /:id` (self/manager) ·
`POST /` (admin) · `PATCH /:id` (admin) · `POST /:id/reset-password` (admin) ·
`GET /skills/catalog`

### Analytics — `/api/analytics` (manager)
`GET /overview` · `/categories` · `/technicians` · `/sla` · `/hotspots` ·
`/priority-matrix` · `/summary`

### Dashboard — `/api/dashboard` (auth, role-aware)
`GET /` — returns a payload tuned to the caller's role (personal stats, queue, needs-action
list, activity feed, and for managers the full analytics summary).

### Notifications — `/api/notifications` (auth)
`GET /` · `GET /unread-count` · `POST /:id/read` · `POST /read-all` · `DELETE /:id`

---

## 🧪 Testing

```bash
npm test
```

Runs the backend suite with the Node built-in test runner:

- `server/test/ai.test.js` — triage categorisation, urgency, safety flags
- `server/test/assignment.test.js` — scoring, skill match, workload balancing

---

## 📦 Production build (single-port mode)

```bash
npm run build     # builds web/dist
npm start         # API serves the built SPA + API on :4000
```

When `web/dist/index.html` exists, Express serves the SPA and falls back to `index.html` for
client-side routes, so the whole app runs on a single port. For a real deployment, set a strong
`JWT_SECRET`, restrict `CORS_ORIGIN`, and put the app behind a reverse proxy / HTTPS terminator.

---

## ⚙️ Configuration (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | API port |
| `JWT_SECRET` | `change-me-in-production` | Token signing secret (**change in prod**) |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed origins (comma-separated) |
| `DB_FILE` | `server/data/fixflow.db` | SQLite file |
| `UPLOAD_DIR` | `server/uploads` | Photo storage |
| `MAX_UPLOAD_MB` | `10` | Max photo size |
| `OPENAI_API_KEY` | _(empty)_ | Enables optional LLM blending |
| `OPENAI_MODEL` | `gpt-4o-mini` | LLM model when enabled |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | LLM endpoint |
| `AI_TIMEOUT_MS` | `9000` | LLM request timeout before heuristic fallback |
| `VITE_API_URL` | _(empty)_ | **Web client** API origin for production deploys (e.g. Netlify). Empty = same-origin/proxied. |

---

## 🚀 Deployment

### Option A — Netlify (frontend) + separately-hosted API ✅

Netlify can only host the **static** React build. The Express + SQLite API needs a Node host
with a persistent disk (render/railway/fly/VPS), because SQLite and uploaded photos are files
on disk and Socket.IO needs a long-lived process.

**1. Deploy the API** (example: Render → *New → Web Service*)

| Setting | Value |
|---------|-------|
| Root Directory | _(leave empty — repo root)_ |
| Build Command | `npm install` |
| Start Command | `npm --workspace server run start` |
| Env `NODE_VERSION` | `22` |
| Env `JWT_SECRET` | a long random string |
| Env `CORS_ORIGIN` | `https://your-site.netlify.app` (your Netlify URL) |
| Env `DB_FILE` | `/var/data/fixflow.db` |
| Env `UPLOAD_DIR` | `/var/data/uploads` |

Add a **persistent disk** mounted at `/var/data` (otherwise the database and photos are wiped on
every deploy/restart), then seed once from the service **Shell** tab with `npm run seed`.
Your API is now live at e.g. `https://fixflow-api.onrender.com` — verify `/api/health`.

**2. Deploy the frontend on Netlify**

The repo ships a `netlify.toml` that already sets the build command, publish directory, Node
version and SPA fallback. Connect the repo and leave **Base directory empty** (Netlify UI →
*Site configuration → Build & deploy*). Then add one environment variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://fixflow-api.onrender.com` (your API URL, no trailing slash) |

Redeploy. The client now sends `/api` and Socket.IO traffic directly to the API host, and the
`CORS_ORIGIN` on the API authorises the Netlify origin.

> **Why this fixes the 404:** without `VITE_API_URL`, login POSTs to
> `https://your-site.netlify.app/api/auth/login` — a path Netlify knows nothing about, so it 404s.

### Option B — single Node service (skip Netlify)

Because the server serves `web/dist` when it exists, you can run the whole app on one Node host:

```bash
npm run build     # build the SPA
npm start         # API serves the SPA + API on one port
```

Deploy with build `npm run build` and start `npm --workspace server run start`, and open the
service URL directly. No `VITE_API_URL` or CORS configuration is needed.

---

## 🛠️ Troubleshooting

- **`ExperimentalWarning: SQLite`** — expected; the app uses Node's built-in `node:sqlite`.
- **`EADDRINUSE` on port 4000/5173** — another instance is running. Kill it, or change `PORT`.
- **Login returns 404 after deploying to Netlify** — Netlify hosts only the static app. Deploy the
  API separately and set `VITE_API_URL` on Netlify (see **Deployment** above).
- **Blank page after opening a ticket** — make sure you are on the latest code and hard-refresh
  (`Ctrl+Shift+R`); a stale dev-server hot-reload can cache a broken module.
- **No demo data** — run `npm run reset` to rebuild the database.
- **Node version error** — upgrade to Node ≥ 22.5 (`node:sqlite` requirement).

---

## 📝 Notes

- Uploaded photos in the demo seed are generated SVG placeholders — no binary assets required.
- The AI triage engine is intentionally deterministic so demos and tests are reproducible.
- All mutations are written to `ticket_events`, giving every ticket a complete audit trail.

---

## 📄 License

Released for demonstration/educational purposes. Add your preferred license here before
distributing.
