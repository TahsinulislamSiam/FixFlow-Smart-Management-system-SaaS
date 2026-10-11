import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Project root (the folder that contains /server and /web). */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Minimal `.env` loader so the project has zero-config startup without
 * pulling in `dotenv`. Values already present in `process.env` always win,
 * which keeps CI/shell overrides authoritative.
 */
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

/** Resolve a possibly-relative path against the project root. */
function resolveFromRoot(value, fallback) {
  const target = value && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(target) ? target : path.join(ROOT_DIR, target);
}

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'fixflow-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  dbFile: resolveFromRoot(process.env.DB_FILE, 'server/data/fixflow.db'),
  uploadDir: resolveFromRoot(process.env.UPLOAD_DIR, 'server/uploads'),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  ai: {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    baseUrl: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 9000),
  },
};

export function ensureRuntimeDirs() {
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
}
