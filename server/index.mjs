import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { openDatabase, resetToSeed } from './db.mjs';
import {
  allocateClientAdvance,
  allocateEditorAdvance,
  createBatchOrders,
  createOrder,
  deleteExpense,
  deleteOrder,
  exportOrdersCsv,
  getSettingMap,
  getWorkspaceSnapshot,
  logActivity,
  recordClientPayment,
  recordEditorPayout,
  recordExpense,
  updateOrder,
  upsertClient,
  upsertEditor,
} from './ledgerService.mjs';
import { generateClientReminder, runAiCommand } from './aiService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function isLoopbackIp(ip = '') {
  const clean = String(ip).replace(/^::ffff:/, '');
  return clean === '127.0.0.1' || clean === '::1' || clean === 'localhost';
}

function getSessionSecret(db) {
  let row = db.prepare("SELECT value FROM app_settings WHERE key = 'session_secret'").get();
  if (!row?.value) {
    const secret = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('session_secret', ?)").run(secret);
    return secret;
  }
  return row.value;
}

function signToken(secret, pin) {
  const payload = `${pin}:${Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 30))}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(secret, token, currentPin) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return payload.startsWith(`${currentPin}:`);
}

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
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

export function createApp({ dbPath, distDir } = {}) {
  const db = openDatabase(dbPath);
  const sessionSecret = getSessionSecret(db);
  const app = express();
  app.use(express.json({ limit: '4mb' }));

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

  const isRequestAuthorized = (req) => {
    const settings = getSettingMap(db);
    const pinEnabled = settings.pin_enabled === '1';
    const currentPin = settings.mobile_pin || '2026';

    const remoteIp = req.ip || req.socket?.remoteAddress || '';
    const hostHeader = String(req.headers.host || '');
    const forceRemoteCheck = req.headers['x-editdesk-remote-test'] === '1';

    if (!forceRemoteCheck && isLoopbackIp(remoteIp) && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostHeader)) {
      return { authorized: true, isLocal: true, pinEnabled };
    }
    if (!pinEnabled) {
      return { authorized: true, isLocal: false, pinEnabled: false };
    }
    const cookies = parseCookies(req.headers.cookie);
    const authHeader = String(req.headers.authorization || '');
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || cookies.editdesk_session || '';
    const ok = verifyToken(sessionSecret, token, currentPin);
    return { authorized: ok, isLocal: false, pinEnabled: true };
  };

  const requireAuth = (req, res, next) => {
    const status = isRequestAuthorized(req);
    if (!status.authorized) {
      return res.status(401).json({ error: 'PIN required for remote/mobile access', pinRequired: true });
    }
    req.authStatus = status;
    next();
  };

  app.get('/api/health', (_req, res) => {
    const settings = getSettingMap(db);
    res.json({ ok: true, agency: settings.agency_name || 'EditDesk Studio', pinEnabled: settings.pin_enabled === '1' });
  });

  app.get('/api/auth/status', (req, res) => {
    res.json(isRequestAuthorized(req));
  });

  app.post('/api/auth/pin', (req, res) => {
    const settings = getSettingMap(db);
    const currentPin = settings.mobile_pin || '2026';
    const entered = String(req.body?.pin || '').trim();
    if (entered !== currentPin) {
      return res.status(401).json({ error: 'Incorrect PIN. Check the PIN shown on your Desktop App.' });
    }
    const token = signToken(sessionSecret, currentPin);
    res.setHeader(
      'Set-Cookie',
      `editdesk_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
    );
    res.json({ ok: true, token });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'editdesk_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/events', requireAuth, (req, res) => {
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

  app.get('/api/workspace', requireAuth, (_req, res) => {
    res.json(getWorkspaceSnapshot(db));
  });

  app.get('/api/mobile-info', requireAuth, async (req, res) => {
    const settings = getSettingMap(db);
    const port = Number(process.env.EDITDESK_PORT || settings.port || 4747);
    const addresses = detectNetworkInterfaces(port);
    const primary = addresses.find((a) => a.kind === 'lan') || addresses.find((a) => a.kind === 'tailscale') || addresses[0];
    const tailscale = addresses.find((a) => a.kind === 'tailscale') || null;
    const primaryQr = primary
      ? await QRCode.toDataURL(primary.url, { margin: 1, width: 220, color: { dark: '#090b10', light: '#ffffff' } })
      : null;
    const tailscaleQr = tailscale
      ? await QRCode.toDataURL(tailscale.url, { margin: 1, width: 220, color: { dark: '#090b10', light: '#ffffff' } })
      : null;

    res.json({
      port,
      pinEnabled: settings.pin_enabled === '1',
      mobilePin: req.authStatus.isLocal ? settings.mobile_pin || '2026' : '••••',
      addresses,
      primaryUrl: primary?.url || `http://localhost:${port}`,
      primaryQr,
      tailscaleUrl: tailscale?.url || null,
      tailscaleQr,
    });
  });

  app.post('/api/orders', requireAuth, (req, res) => {
    try {
      if (Array.isArray(req.body?.orders)) {
        const ids = createBatchOrders(db, req.body.orders);
        broadcastChange('batch_orders_created');
        return res.status(201).json({ ids, snapshot: getWorkspaceSnapshot(db) });
      }
      const id = createOrder(db, req.body);
      broadcastChange('order_created');
      res.status(201).json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/orders/:id', requireAuth, (req, res) => {
    try {
      const id = updateOrder(db, req.params.id, req.body);
      broadcastChange('order_updated');
      res.json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/orders/:id', requireAuth, (req, res) => {
    try {
      deleteOrder(db, req.params.id);
      broadcastChange('order_deleted');
      res.json({ ok: true, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/payments', requireAuth, (req, res) => {
    try {
      const result = recordClientPayment(db, req.body);
      broadcastChange('client_payment');
      res.status(201).json({ result, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/payments/:id/allocate', requireAuth, (req, res) => {
    try {
      const result = allocateClientAdvance(db, {
        payment_id: req.params.id,
        order_id: req.body.order_id,
        amount: req.body.amount,
      });
      broadcastChange('advance_allocated');
      res.json({ result, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/editor-payouts', requireAuth, (req, res) => {
    try {
      const result = recordEditorPayout(db, req.body);
      broadcastChange('editor_payout');
      res.status(201).json({ result, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/editor-payouts/:id/allocate', requireAuth, (req, res) => {
    try {
      const result = allocateEditorAdvance(db, {
        payout_id: req.params.id,
        order_id: req.body.order_id,
        amount: req.body.amount,
      });
      broadcastChange('editor_advance_allocated');
      res.json({ result, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/expenses', requireAuth, (req, res) => {
    try {
      const id = recordExpense(db, req.body);
      broadcastChange('expense_recorded');
      res.status(201).json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/expenses/:id', requireAuth, (req, res) => {
    try {
      deleteExpense(db, req.params.id);
      broadcastChange('expense_deleted');
      res.json({ ok: true, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/clients', requireAuth, (req, res) => {
    try {
      const id = upsertClient(db, req.body);
      broadcastChange('client_saved');
      res.status(201).json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/clients/:id', requireAuth, (req, res) => {
    try {
      const id = upsertClient(db, { ...req.body, id: Number(req.params.id) });
      broadcastChange('client_saved');
      res.json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/clients/:id/reminder', requireAuth, (req, res) => {
    try {
      res.json(generateClientReminder(db, req.params.id));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/editors', requireAuth, (req, res) => {
    try {
      const id = upsertEditor(db, req.body);
      broadcastChange('editor_saved');
      res.status(201).json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/editors/:id', requireAuth, (req, res) => {
    try {
      const id = upsertEditor(db, { ...req.body, id: Number(req.params.id) });
      broadcastChange('editor_saved');
      res.json({ id, snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/ai/command', requireAuth, async (req, res) => {
    try {
      const result = await runAiCommand(db, req.body?.text || '');
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/settings', requireAuth, (req, res) => {
    try {
      const allowed = [
        'agency_name',
        'owner_name',
        'order_prefix',
        'pin_enabled',
        'mobile_pin',
        'ai_provider',
        'ai_api_key',
        'ai_model',
        'minimize_to_tray',
      ];
      const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
      for (const k of allowed) {
        if (req.body[k] === undefined) continue;
        if (k === 'pin_enabled' || k === 'minimize_to_tray') {
          stmt.run(k, req.body[k] ? '1' : '0');
        } else if (k === 'ai_api_key') {
          // Only overwrite key when non-empty or explicit clear flag
          if (req.body.clear_ai_key) stmt.run(k, '');
          else if (String(req.body[k]).trim()) stmt.run(k, String(req.body[k]).trim());
        } else {
          stmt.run(k, String(req.body[k]));
        }
      }
      logActivity(db, 'settings_updated', 'Updated agency & AI settings', 'system', null);
      broadcastChange('settings_updated');
      res.json({ snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/export/orders.csv', requireAuth, (_req, res) => {
    const csv = exportOrdersCsv(db);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="editdesk-orders.csv"');
    res.send(csv);
  });

  app.get('/api/export/backup.json', requireAuth, (_req, res) => {
    const snap = getWorkspaceSnapshot(db);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="editdesk-backup.json"');
    res.send(JSON.stringify(snap, null, 2));
  });

  app.post('/api/system/reset-seed', requireAuth, (_req, res) => {
    try {
      resetToSeed(db);
      broadcastChange('reset_seed');
      res.json({ snapshot: getWorkspaceSnapshot(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
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

  return { app, db, broadcastChange };
}

export function startServer({ port = 4747, host = '0.0.0.0', dbPath, distDir } = {}) {
  const { app, db, broadcastChange } = createApp({ dbPath, distDir });
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      const actualPort = server.address().port;
      console.log(`EditDesk Server listening on http://127.0.0.1:${actualPort} (LAN ${host}:${actualPort})`);
      resolve({ server, app, db, port: actualPort, broadcastChange });
    });
  });
}

// Run standalone if invoked directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.EDITDESK_PORT || 4747);
  startServer({ port, host: '0.0.0.0' });
}
