import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { openDatabase, resolveDefaultDbPath } from './db.mjs';
import { handleApiRequest, checkAuthorization } from './apiCore.mjs';
import { getSettingMap, getWorkspaceSnapshot } from './ledgerService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function isLoopbackIp(ip = '') {
  const clean = String(ip).replace(/^::ffff:/, '');
  return clean === '127.0.0.1' || clean === '::1' || clean === 'localhost';
}

function detectNetworkInterfaces(port) {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const [name, list] of Object.entries(nets)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const isTailscale = iface.address.startsWith('100.') || /tailscale/i.test(name);
      const isVirtual =
        /vEthernet|WSL|Hyper-V|VMware|VirtualBox|Loopback/i.test(name) ||
        iface.address.startsWith('169.254.');
      addresses.push({
        name,
        ip: iface.address,
        url: `http://${iface.address}:${port}`,
        kind: isTailscale ? 'tailscale' : isVirtual ? 'virtual' : 'lan',
      });
    }
  }
  addresses.sort((a, b) => {
    const rank = { lan: 0, tailscale: 1, virtual: 2 };
    return (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3);
  });
  return addresses;
}

const DESKTOP_LOCAL_SETTINGS_KEYS = [
  'cloud_url',
  'cloud_pin',
  'cloud_sync_enabled',
  'last_cloud_rev',
  'last_cloud_sync',
  'pending_cloud_push',
  'minimize_to_tray',
  'port',
  'session_secret',
];

export function createApp({ dbPath, distDir } = {}) {
  const resolvedDbPath = dbPath ? path.resolve(dbPath) : resolveDefaultDbPath();
  const dbState = { db: openDatabase(resolvedDbPath), dbPath: resolvedDbPath };
  let localRev = Number(
    dbState.db.prepare("SELECT value FROM app_settings WHERE key = 'local_rev'").get()?.value || 1
  );

  const app = express();
  app.use((req, res, next) => {
    if (req.path === '/api/sync/import-db') {
      return express.raw({ type: '*/*', limit: '25mb' })(req, res, next);
    }
    return express.json({ limit: '6mb' })(req, res, next);
  });

  const sseClients = new Set();
  const broadcastChange = (reason = 'updated') => {
    const payload = `data: ${JSON.stringify({ reason, ts: Date.now() })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  };

  const exportDbBytes = () => {
    const tmp = `${dbState.dbPath}.export.${Date.now()}.tmp`;
    dbState.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    try {
      return fs.readFileSync(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  };

  const importDbBytes = async (bytes) => {
    if (!bytes || bytes.length < 100) {
      throw new Error('Invalid SQLite database bytes');
    }
    const incomingPath = `${dbState.dbPath}.incoming.${Date.now()}.tmp`;
    fs.writeFileSync(incomingPath, bytes);
    try {
      // Verify SQLite integrity and preserve desktop-local settings
      const preserved = {};
      const currentSettings = getSettingMap(dbState.db);
      for (const k of DESKTOP_LOCAL_SETTINGS_KEYS) {
        if (currentSettings[k] !== undefined) preserved[k] = currentSettings[k];
      }

      const testDb = new DatabaseSync(incomingPath);
      try {
        testDb.prepare('SELECT COUNT(*) AS cnt FROM orders').get();
        const stmt = testDb.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(preserved)) {
          stmt.run(k, String(v));
        }
      } finally {
        testDb.close();
      }

      dbState.db.close();
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${dbState.dbPath}${suffix}`, { force: true });
      }
      fs.renameSync(incomingPath, dbState.dbPath);
      dbState.db = openDatabase(dbState.dbPath);
      localRev += 1;
      broadcastChange('cloud_synced');
      return { ok: true, rev: localRev, snapshot: getWorkspaceSnapshot(dbState.db) };
    } catch (err) {
      fs.rmSync(incomingPath, { force: true });
      if (!dbState.db) {
        dbState.db = openDatabase(dbState.dbPath);
      }
      throw err;
    }
  };

  let cloudTokenCache = { url: '', pin: '', token: '' };
  let syncInFlight = false;

  async function getCloudAuthToken(cloudUrl, cloudPin) {
    if (
      cloudTokenCache.token &&
      cloudTokenCache.url === cloudUrl &&
      cloudTokenCache.pin === cloudPin
    ) {
      return cloudTokenCache.token;
    }
    const resp = await fetch(`${cloudUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cloudPin }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Cloud authentication failed (HTTP ${resp.status})`);
    }
    const { token } = await resp.json();
    cloudTokenCache = { url: cloudUrl, pin: cloudPin, token };
    return token;
  }

  async function pushToCloud(override = {}) {
    const settings = getSettingMap(dbState.db);
    const cloudUrl = String(override.cloud_url || settings.cloud_url || '')
      .trim()
      .replace(/\/+$/, '');
    const cloudPin = String(override.cloud_pin || settings.cloud_pin || settings.mobile_pin || '2026').trim();
    if (!cloudUrl) throw new Error('Published Cloud URL is required in Settings');

    let token = await getCloudAuthToken(cloudUrl, cloudPin);
    const bytes = exportDbBytes();

    let resp = await fetch(`${cloudUrl}/api/sync/import-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${token}`,
      },
      body: bytes,
    });

    if (resp.status === 401) {
      cloudTokenCache = { url: '', pin: '', token: '' };
      token = await getCloudAuthToken(cloudUrl, cloudPin);
      resp = await fetch(`${cloudUrl}/api/sync/import-db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: `Bearer ${token}`,
        },
        body: bytes,
      });
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Cloud push failed (HTTP ${resp.status})`);
    }
    const data = await resp.json();
    const now = new Date().toISOString();
    const stmt = dbState.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
    stmt.run('cloud_url', cloudUrl);
    if (override.cloud_pin) stmt.run('cloud_pin', cloudPin);
    stmt.run('last_cloud_rev', String(data.rev || 1));
    stmt.run('last_cloud_sync', now);
    stmt.run('pending_cloud_push', '0');

    return { ok: true, rev: data.rev, syncedAt: now, snapshot: getWorkspaceSnapshot(dbState.db) };
  }

  async function pullFromCloud(override = {}) {
    const settings = getSettingMap(dbState.db);
    const cloudUrl = String(override.cloud_url || settings.cloud_url || '')
      .trim()
      .replace(/\/+$/, '');
    const cloudPin = String(override.cloud_pin || settings.cloud_pin || settings.mobile_pin || '2026').trim();
    if (!cloudUrl) throw new Error('Published Cloud URL is required in Settings');

    const token = await getCloudAuthToken(cloudUrl, cloudPin);
    const resp = await fetch(`${cloudUrl}/api/sync/export-db`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Cloud pull failed (HTTP ${resp.status})`);
    }
    const cloudRev = Number(resp.headers.get('x-editdesk-rev') || 0);
    const buf = Buffer.from(await resp.arrayBuffer());
    await importDbBytes(buf);

    const now = new Date().toISOString();
    const stmt = dbState.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
    stmt.run('cloud_url', cloudUrl);
    if (override.cloud_pin) stmt.run('cloud_pin', cloudPin);
    if (cloudRev > 0) stmt.run('last_cloud_rev', String(cloudRev));
    stmt.run('last_cloud_sync', now);
    stmt.run('pending_cloud_push', '0');

    return { ok: true, rev: cloudRev, syncedAt: now, snapshot: getWorkspaceSnapshot(dbState.db) };
  }

  const runBackgroundSyncTick = async () => {
    if (syncInFlight) return;
    const settings = getSettingMap(dbState.db);
    if (settings.cloud_sync_enabled !== '1' || !settings.cloud_url) return;
    syncInFlight = true;
    try {
      if (settings.pending_cloud_push === '1') {
        await pushToCloud();
        return;
      }
      const cloudUrl = settings.cloud_url.trim().replace(/\/+$/, '');
      const cloudPin = (settings.cloud_pin || settings.mobile_pin || '2026').trim();
      const token = await getCloudAuthToken(cloudUrl, cloudPin);
      const metaResp = await fetch(`${cloudUrl}/api/sync/meta`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!metaResp.ok) return;
      const meta = await metaResp.json();
      const lastRev = Number(settings.last_cloud_rev || 0);
      if (Number(meta.rev || 0) > lastRev) {
        await pullFromCloud();
      }
    } catch {
      // Offline or transient network error — will retry next tick
    } finally {
      syncInFlight = false;
    }
  };

  app.get('/api/events', (req, res) => {
    const auth = checkAuthorization({
      db: dbState.db,
      headers: req.headers,
      isLoopback: isLoopbackIp(req.ip || req.socket?.remoteAddress || ''),
      isCloudRuntime: false,
    });
    if (!auth.authorized) {
      return res.status(401).json({ error: 'PIN required', pinRequired: true });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ reason: 'connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.all('/api/{*splat}', async (req, res) => {
    const isBinary = Buffer.isBuffer(req.body);
    const result = await handleApiRequest({
      method: req.method,
      pathname: req.path,
      headers: req.headers,
      body: isBinary ? {} : req.body || {},
      rawBody: isBinary ? req.body : null,
      db: dbState.db,
      isLoopback: isLoopbackIp(req.ip || req.socket?.remoteAddress || ''),
      isCloudRuntime: false,
      isHttps: req.protocol === 'https',
      currentRev: localRev,
      getNetworkInfo: (settings) => {
        const port = Number(process.env.EDITDESK_PORT || settings.port || 4747);
        const addresses = detectNetworkInterfaces(port);
        const primary =
          addresses.find((a) => a.kind === 'lan') ||
          addresses.find((a) => a.kind === 'tailscale') ||
          addresses[0];
        const tailscale = addresses.find((a) => a.kind === 'tailscale') || null;
        return {
          port,
          addresses,
          primaryUrl: primary?.url || `http://localhost:${port}`,
          tailscaleUrl: tailscale?.url || null,
        };
      },
      syncCallbacks: {
        exportDbBytes,
        importDbBytes,
        pushToCloud,
        pullFromCloud,
      },
    });

    if (result.mutated) {
      localRev += 1;
      dbState.db
        .prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('local_rev', ?)")
        .run(String(localRev));
      broadcastChange(result.mutated);

      const settings = getSettingMap(dbState.db);
      if (settings.cloud_sync_enabled === '1' && settings.cloud_url) {
        dbState.db
          .prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pending_cloud_push', '1')")
          .run();
        void runBackgroundSyncTick();
      }
    }

    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }
    }
    res.status(result.status).send(result.body);
  });

  // Serve built frontend + public PWA assets
  const resolvedDist = distDir || path.join(ROOT_DIR, 'dist');
  const publicDir = path.join(ROOT_DIR, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }
  if (fs.existsSync(resolvedDist)) {
    app.use(express.static(resolvedDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(resolvedDist, 'index.html'));
    });
  }

  return {
    app,
    get db() {
      return dbState.db;
    },
    broadcastChange,
    runBackgroundSyncTick,
    pushToCloud,
    pullFromCloud,
  };
}

export function startServer({ port = 4747, host = '0.0.0.0', dbPath, distDir } = {}) {
  const { app, db, broadcastChange, runBackgroundSyncTick } = createApp({ dbPath, distDir });
  const syncTimer = setInterval(() => {
    void runBackgroundSyncTick();
  }, 8000);
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      const actualPort = server.address().port;
      console.log(`EditDesk Server listening on http://127.0.0.1:${actualPort} (LAN ${host}:${actualPort})`);
      void runBackgroundSyncTick();
      resolve({
        server,
        app,
        db,
        port: actualPort,
        broadcastChange,
        stopSync: () => clearInterval(syncTimer),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.EDITDESK_PORT || 4747);
  startServer({ port, host: '0.0.0.0' });
}
