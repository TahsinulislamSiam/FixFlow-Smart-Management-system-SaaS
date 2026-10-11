import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config, ensureRuntimeDirs, ROOT_DIR } from './config.js';
import { attachUser } from './middleware/auth.js';
import { ApiError } from './util/http.js';
import { authRouter } from './routes/auth.js';
import { ticketsRouter } from './routes/tickets.js';
import { usersRouter } from './routes/users.js';
import { analyticsRouter, dashboardRouter } from './routes/analytics.js';
import { notificationsRouter } from './routes/notifications.js';
import { metaRouter } from './routes/meta.js';
import { initRealtime } from './realtime.js';
import { sweepSlaBreaches } from './services/tickets.js';

ensureRuntimeDirs();

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Concise request log — enough to debug, quiet enough for a demo.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (req.path === '/api/health') return;
      console.log(`${res.statusCode} ${req.method.padEnd(6)} ${req.originalUrl} ${ms.toFixed(1)}ms`);
    });
    next();
  });

  // Uploaded photos are served read-only.
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: '1h',
      fallthrough: true,
      index: false,
      dotfiles: 'deny',
    }),
  );

  app.use(attachUser);

  app.use('/api/auth', authRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/notifications', notificationsRouter);

  app.get('/api', (_req, res) => {
    res.json({
      data: {
        name: 'FixFlow API',
        version: '1.0.0',
        docs: [
          'GET    /api/meta/health',
          'POST   /api/auth/register',
          'POST   /api/auth/login',
          'GET    /api/auth/me',
          'GET    /api/tickets?status&priority&category&scope&sla&q&sort&page',
          'POST   /api/tickets            (multipart: photos[], title, description, location_text, latitude, longitude)',
          'POST   /api/tickets/ai/preview',
          'GET    /api/tickets/:id',
          'PATCH  /api/tickets/:id',
          'POST   /api/tickets/:id/status',
          'POST   /api/tickets/:id/assign',
          'GET    /api/tickets/:id/suggestions',
          'POST   /api/tickets/:id/comments',
          'POST   /api/tickets/:id/attachments',
          'GET    /api/users/technicians',
          'GET    /api/analytics/summary',
          'GET    /api/dashboard',
          'GET    /api/notifications',
        ],
      },
    });
  });

  // Serve the built SPA when it exists (single-port production mode).
  const webDist = path.join(ROOT_DIR, 'web', 'dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use((req, _res, next) => next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`)));

  // eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Each photo must be under ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`
          : `Upload failed: ${error.message}`;
      return res.status(400).json({ error: message, code: error.code });
    }
    const status = error instanceof ApiError ? error.status : 500;
    const payload = {
      error: status === 500 ? 'Something went wrong on our side.' : error.message,
      ...(error.details ? { details: error.details } : {}),
    };
    if (status === 500) console.error('[fixflow] unhandled error:', error);
    return res.status(status).json(payload);
  });

  return app;
}

export function startServer({ port = config.port } = {}) {
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  // Periodic SLA watchdog: marks breaches and pushes alerts.
  const sweep = setInterval(() => {
    try {
      sweepSlaBreaches();
    } catch (error) {
      console.error('[fixflow] SLA sweep failed:', error.message);
    }
  }, 60_000);
  sweep.unref?.();
  setTimeout(() => {
    try {
      sweepSlaBreaches();
    } catch {
      /* non-fatal */
    }
  }, 2_000).unref?.();

  server.listen(port, () => {
    console.log(`\n  FixFlow API ready  →  http://localhost:${port}/api/health`);
    console.log(`  AI triage mode     →  ${config.ai.apiKey ? `llm+heuristic (${config.ai.model})` : 'heuristic (offline, deterministic)'}`);
    console.log(`  Database           →  ${config.dbFile}\n`);
  });

  const shutdown = (signal) => () => {
    console.log(`\n[fixflow] ${signal} received — shutting down.`);
    clearInterval(sweep);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));

  return server;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('index.js');
if (isDirectRun) startServer();
