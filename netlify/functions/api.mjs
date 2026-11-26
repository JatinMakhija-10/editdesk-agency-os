import fs from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import initSqlJs from 'sql.js';
import {
  initSchema,
  seedIfEmpty,
  wrapSqlJsDatabase,
} from '../../server/dbCore.mjs';
import { handleApiRequest } from '../../server/apiCore.mjs';
import { getWorkspaceSnapshot } from '../../server/ledgerService.mjs';

let sqlModulePromise = null;

function findWasmBinary() {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.resolve('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }
  return undefined;
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    const wasmBinary = findWasmBinary();
    sqlModulePromise = initSqlJs(wasmBinary ? { wasmBinary } : undefined);
  }
  return sqlModulePromise;
}

export function createMemoryBlobStore() {
  const map = new Map();
  return {
    async get(key, opts = {}) {
      const entry = map.get(key);
      if (!entry) return null;
      if (opts.type === 'json') return JSON.parse(Buffer.from(entry).toString('utf8'));
      if (opts.type === 'arrayBuffer') {
        const buf = Buffer.from(entry);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
      return Buffer.from(entry).toString('utf8');
    },
    async set(key, val) {
      map.set(key, Buffer.isBuffer(val) ? Uint8Array.from(val) : Buffer.from(String(val)));
    },
    async setJSON(key, obj) {
      map.set(key, Buffer.from(JSON.stringify(obj), 'utf8'));
    },
  };
}

export function createNetlifyHandler({ storeOverride = null } = {}) {
  return async (req) => {
    const url = new URL(req.url);
    let pathname = url.pathname.replace(/^\/\.netlify\/functions\/api/, '/api');
    if (!pathname.startsWith('/api')) {
      pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      return new Response(JSON.stringify({ sseSupported: false }), {
        status: 204,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const store = storeOverride || getStore({ name: 'editdesk', consistency: 'strong' });
    const SQL = await getSqlModule();

    const [dbBuf, metaObj] = await Promise.all([
      store.get('editdesk.db', { type: 'arrayBuffer' }),
      store.get('meta.json', { type: 'json' }),
    ]);

    let currentRev = Number(metaObj?.rev || 0);
    let needsInitialPersist = false;
    let rawDb;

    if (dbBuf && dbBuf.byteLength > 0) {
      rawDb = new SQL.Database(new Uint8Array(dbBuf));
    } else {
      rawDb = new SQL.Database();
      needsInitialPersist = true;
    }

    const db = wrapSqlJsDatabase(rawDb);
    initSchema(db);
    seedIfEmpty(db);

    if (needsInitialPersist) {
      currentRev = 1;
      await store.set('editdesk.db', Buffer.from(db.export()));
      await store.setJSON('meta.json', { rev: currentRev, updatedAt: new Date().toISOString() });
    }

    const headers = {};
    req.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    let body = {};
    let rawBody = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const contentType = headers['content-type'] || '';
      if (contentType.includes('application/octet-stream')) {
        rawBody = new Uint8Array(await req.arrayBuffer());
      } else {
        const text = await req.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = {};
          }
        }
      }
    }

    const isHttps =
      url.protocol === 'https:' || headers['x-forwarded-proto'] === 'https';

    let importedBytesPendingSave = false;

    const syncCallbacks = {
      exportDbBytes: () => Buffer.from(db.export()),
      importDbBytes: async (incomingBytes) => {
        if (!incomingBytes || incomingBytes.length < 100) {
          throw new Error('Invalid SQLite database payload');
        }
        const currentSecret = db
          .prepare("SELECT value FROM app_settings WHERE key = 'session_secret'")
          .get()?.value;
        const candidateRaw = new SQL.Database(new Uint8Array(incomingBytes));
        const candidateDb = wrapSqlJsDatabase(candidateRaw);
        let finalBytes;
        let snap;
        try {
          const check = candidateDb.prepare('SELECT COUNT(*) AS cnt FROM orders').get();
          if (!check || check.cnt === undefined) {
            throw new Error('Uploaded file is not a valid EditDesk SQLite ledger');
          }
          if (currentSecret) {
            candidateDb
              .prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('session_secret', ?)")
              .run(currentSecret);
          }
          finalBytes = Buffer.from(candidateDb.export());
          snap = getWorkspaceSnapshot(candidateDb);
        } finally {
          candidateDb.close();
        }
        currentRev += 1;
        await store.set('editdesk.db', finalBytes);
        await store.setJSON('meta.json', { rev: currentRev, updatedAt: new Date().toISOString() });
        importedBytesPendingSave = true;
        return { ok: true, rev: currentRev, snapshot: snap };
      },
    };

    try {
      const result = await handleApiRequest({
        method: req.method,
        pathname,
        headers,
        body,
        rawBody,
        db,
        isLoopback: false,
        isCloudRuntime: true,
        isHttps,
        syncCallbacks,
        currentRev,
      });

      if (result.mutated && !importedBytesPendingSave) {
        currentRev += 1;
        await store.set('editdesk.db', Buffer.from(db.export()));
        await store.setJSON('meta.json', { rev: currentRev, updatedAt: new Date().toISOString() });
      }

      const outHeaders = {
        'Cache-Control': 'no-store',
        ...(result.headers || {}),
      };
      return new Response(result.body, {
        status: result.status,
        headers: outHeaders,
      });
    } finally {
      db.close();
    }
  };
}

export default createNetlifyHandler();
