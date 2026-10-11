import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ensureRuntimeDirs, ROOT_DIR } from './config.js';

ensureRuntimeDirs();

/**
 * FixFlow uses Node's built-in SQLite driver (`node:sqlite`, stable since
 * Node 24, available behind `--experimental-sqlite` on Node 22.5+).
 * That means no native compilation, no Prisma engine downloads — `npm install`
 * can never fail on a C++ toolchain.
 *
 * NOTE: node:sqlite has no boolean type, so booleans are stored as 0/1.
 */
export const db = new DatabaseSync(config.dbFile, {
  enableForeignKeyConstraints: true,
});

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

const schemaPath = path.join(ROOT_DIR, 'server', 'src', 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

/** Convert a null-prototype SQLite row into a plain JS object. */
const plain = (row) => (row == null ? row : { ...row });

/** Run a query and return every row. */
export function all(sql, params = []) {
  return db.prepare(sql).all(...params).map(plain);
}

/** Run a query and return the first row (or undefined). */
export function get(sql, params = []) {
  return plain(db.prepare(sql).get(...params));
}

/** Run a statement, returning `{ changes, lastInsertRowid }`. */
export function run(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

/** Single scalar value helper. */
export function scalar(sql, params = []) {
  const row = db.prepare(sql).get(...params);
  if (!row) return null;
  return Object.values(row)[0];
}

/** Wrap a function in a transaction; rolls back on throw. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw error;
  }
}

/** Narrow select helper used by list endpoints (never interpolate user input). */
export function placeholders(items) {
  return items.map(() => '?').join(', ');
}

/** Parse a JSON column that may be null / malformed. */
export function parseJson(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export const toBool = (value) => value === 1 || value === true;
export const fromBool = (value) => (value ? 1 : 0);
export const nowIso = () => new Date().toISOString();
