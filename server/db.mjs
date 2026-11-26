import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ensureDefaultSettings,
  initSchema,
  resetToSeed,
  seedHistoricalData,
  seedIfEmpty,
  withTransaction,
} from './dbCore.mjs';

export { ensureDefaultSettings, initSchema, resetToSeed, seedHistoricalData, seedIfEmpty, withTransaction };

export function resolveDefaultDbPath() {
  if (process.env.EDITDESK_DB_PATH) {
    return path.resolve(process.env.EDITDESK_DB_PATH);
  }
  return path.resolve(process.cwd(), 'data', 'editdesk.db');
}

export function openDatabase(dbPath = resolveDefaultDbPath()) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  initSchema(db);
  seedIfEmpty(db);
  return db;
}
