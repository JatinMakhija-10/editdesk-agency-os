import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { resetToSeed } from './dbCore.mjs';
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
import {
  autoSuggestForOrder,
  generateAutoReminder,
  generateClientReminder,
  runAiCommand,
  testAiProviders,
} from './aiService.mjs';
import { importSpreadsheetCsv, previewSpreadsheetCsv } from './csvImportService.mjs';

export function parseCookies(cookieHeader = '') {
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

export function getOrCreateAuthSecret(db) {
  if (process.env.EDITDESK_AUTH_SECRET && process.env.EDITDESK_AUTH_SECRET.trim()) {
    return process.env.EDITDESK_AUTH_SECRET.trim();
  }
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'session_secret'").get();
  if (row?.value) return row.value;
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('session_secret', ?)").run(secret);
  return secret;
}

export function signAuthToken(secret, pin) {
  const payload = `${pin}:${Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 30))}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyAuthToken(secret, token, currentPin) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return payload.startsWith(`${currentPin}:`);
}

export function getEffectiveOwnerPin(db, isCloudRuntime = false) {
  const envPin = (process.env.EDITDESK_OWNER_PIN || '').trim();
  if (isCloudRuntime && envPin) return envPin;
  const settings = getSettingMap(db);
  return settings.mobile_pin || envPin || '2026';
}

export function checkAuthorization({
  db,
  headers = {},
  isLoopback = false,
  isCloudRuntime = false,
}) {
  const settings = getSettingMap(db);
  const pinEnabled = isCloudRuntime ? true : settings.pin_enabled === '1';
  const currentPin = getEffectiveOwnerPin(db, isCloudRuntime);

  const forceRemote = headers['x-editdesk-remote-test'] === '1';
  const hostHeader = String(headers.host || '');

  if (
    !isCloudRuntime &&
    !forceRemote &&
    isLoopback &&
    /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostHeader)
  ) {
    return { authorized: true, isLocal: true, pinEnabled };
  }
  if (!pinEnabled) {
    return { authorized: true, isLocal: false, pinEnabled: false };
  }

  const secret = getOrCreateAuthSecret(db);
  const cookies = parseCookies(headers.cookie);
  const authHeader = String(headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || cookies.editdesk_session || '';
  const ok = verifyAuthToken(secret, token, currentPin);
  return { authorized: ok, isLocal: false, pinEnabled: true };
}

function jsonResp(status, data, extraHeaders = {}) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
    body: JSON.stringify(data),
  };
}

export async function handleApiRequest({
  method,
  pathname,
  headers = {},
  body = {},
  rawBody = null,
  db,
  isLoopback = false,
  isCloudRuntime = false,
  isHttps = false,
  getNetworkInfo = null,
  syncCallbacks = null,
  currentRev = 0,
}) {
  const settings = getSettingMap(db);

  if (method === 'GET' && pathname === '/api/health') {
    return jsonResp(200, {
      ok: true,
      agency: settings.agency_name || 'EditDesk Studio',
      pinEnabled: isCloudRuntime ? true : settings.pin_enabled === '1',
      cloudRuntime: isCloudRuntime,
      rev: currentRev,
    });
  }

  if (method === 'GET' && pathname === '/api/auth/status') {
    return jsonResp(200, checkAuthorization({ db, headers, isLoopback, isCloudRuntime }));
  }

  if (method === 'POST' && pathname === '/api/auth/pin') {
    const currentPin = getEffectiveOwnerPin(db, isCloudRuntime);
    const entered = String(body?.pin || '').trim();
    if (entered !== currentPin) {
      return jsonResp(401, {
        error: isCloudRuntime
          ? 'Incorrect PIN'
          : 'Incorrect PIN. Check the PIN shown on your Desktop App.',
      });
    }
    const hadSecret = Boolean(
      db.prepare("SELECT value FROM app_settings WHERE key = 'session_secret'").get()?.value
    );
    const secret = getOrCreateAuthSecret(db);
    const token = signAuthToken(secret, currentPin);
    const cookie = `editdesk_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax;${
      isHttps ? ' Secure;' : ''
    } Max-Age=${60 * 60 * 24 * 30}`;
    return {
      ...jsonResp(200, { ok: true, token }, { 'Set-Cookie': cookie }),
      mutated: hadSecret ? undefined : 'auth_secret_init',
    };
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    return jsonResp(
      200,
      { ok: true },
      { 'Set-Cookie': 'editdesk_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }
    );
  }

  const auth = checkAuthorization({ db, headers, isLoopback, isCloudRuntime });
  if (!auth.authorized) {
    return jsonResp(401, { error: 'PIN required for remote/mobile access', pinRequired: true });
  }

  try {
    if (method === 'GET' && pathname === '/api/workspace') {
      return jsonResp(200, getWorkspaceSnapshot(db));
    }

    if (method === 'GET' && pathname === '/api/mobile-info') {
      const netInfo = getNetworkInfo ? getNetworkInfo(settings) : {
        port: Number(settings.port || 4747),
        addresses: [],
        primaryUrl: '',
        tailscaleUrl: null,
      };
      const primaryQr = netInfo.primaryUrl
        ? await QRCode.toDataURL(netInfo.primaryUrl, {
            margin: 1,
            width: 220,
            color: { dark: '#141415', light: '#ffffff' },
          })
        : null;
      const tailscaleQr = netInfo.tailscaleUrl
        ? await QRCode.toDataURL(netInfo.tailscaleUrl, {
            margin: 1,
            width: 220,
            color: { dark: '#141415', light: '#ffffff' },
          })
        : null;

      const proto = headers['x-forwarded-proto'] || (isHttps ? 'https' : 'http');
      const host = headers.host || '';
      const cloudUrl = isCloudRuntime
        ? host
          ? `${proto}://${host}`
          : ''
        : (settings.cloud_url || '').trim().replace(/\/+$/, '');
      const cloudQr = cloudUrl
        ? await QRCode.toDataURL(cloudUrl, {
            margin: 1,
            width: 220,
            color: { dark: '#141415', light: '#ffffff' },
          })
        : null;

      return jsonResp(200, {
        port: netInfo.port,
        pinEnabled: isCloudRuntime ? true : settings.pin_enabled === '1',
        mobilePin: auth.isLocal ? getEffectiveOwnerPin(db, false) : '••••',
        addresses: netInfo.addresses,
        primaryUrl: netInfo.primaryUrl || cloudUrl,
        primaryQr,
        tailscaleUrl: netInfo.tailscaleUrl,
        tailscaleQr,
        cloudUrl: cloudUrl || null,
        cloudQr,
        cloudSyncEnabled: settings.cloud_sync_enabled === '1',
        isCloudRuntime,
      });
    }

    if (method === 'POST' && pathname === '/api/orders') {
      if (Array.isArray(body?.orders)) {
        const ids = createBatchOrders(db, body.orders);
        return { ...jsonResp(201, { ids, snapshot: getWorkspaceSnapshot(db) }), mutated: 'batch_orders_created' };
      }
      const id = createOrder(db, body);
      return { ...jsonResp(201, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'order_created' };
    }

    const orderMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
    if (orderMatch) {
      const orderId = Number(orderMatch[1]);
      if (method === 'PATCH') {
        const id = updateOrder(db, orderId, body);
        return { ...jsonResp(200, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'order_updated' };
      }
      if (method === 'DELETE') {
        deleteOrder(db, orderId);
        return { ...jsonResp(200, { ok: true, snapshot: getWorkspaceSnapshot(db) }), mutated: 'order_deleted' };
      }
    }

    if (method === 'POST' && pathname === '/api/payments') {
      const result = recordClientPayment(db, body);
      return { ...jsonResp(201, { result, snapshot: getWorkspaceSnapshot(db) }), mutated: 'client_payment' };
    }

    const payAllocMatch = pathname.match(/^\/api\/payments\/(\d+)\/allocate$/);
    if (method === 'POST' && payAllocMatch) {
      const result = allocateClientAdvance(db, {
        payment_id: payAllocMatch[1],
        order_id: body.order_id,
        amount: body.amount,
      });
      return { ...jsonResp(200, { result, snapshot: getWorkspaceSnapshot(db) }), mutated: 'advance_allocated' };
    }

    if (method === 'POST' && pathname === '/api/editor-payouts') {
      const result = recordEditorPayout(db, body);
      return { ...jsonResp(201, { result, snapshot: getWorkspaceSnapshot(db) }), mutated: 'editor_payout' };
    }

    const edAllocMatch = pathname.match(/^\/api\/editor-payouts\/(\d+)\/allocate$/);
    if (method === 'POST' && edAllocMatch) {
      const result = allocateEditorAdvance(db, {
        payout_id: edAllocMatch[1],
        order_id: body.order_id,
        amount: body.amount,
      });
      return {
        ...jsonResp(200, { result, snapshot: getWorkspaceSnapshot(db) }),
        mutated: 'editor_advance_allocated',
      };
    }

    if (method === 'POST' && pathname === '/api/expenses') {
      const id = recordExpense(db, body);
      return { ...jsonResp(201, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'expense_recorded' };
    }

    const expMatch = pathname.match(/^\/api\/expenses\/(\d+)$/);
    if (method === 'DELETE' && expMatch) {
      deleteExpense(db, expMatch[1]);
      return { ...jsonResp(200, { ok: true, snapshot: getWorkspaceSnapshot(db) }), mutated: 'expense_deleted' };
    }

    if (method === 'POST' && pathname === '/api/clients') {
      const id = upsertClient(db, body);
      return { ...jsonResp(201, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'client_saved' };
    }

    const clientMatch = pathname.match(/^\/api\/clients\/(\d+)$/);
    if (method === 'PATCH' && clientMatch) {
      const id = upsertClient(db, { ...body, id: Number(clientMatch[1]) });
      return { ...jsonResp(200, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'client_saved' };
    }

    const reminderMatch = pathname.match(/^\/api\/clients\/(\d+)\/reminder$/);
    if (method === 'GET' && reminderMatch) {
      return jsonResp(200, generateClientReminder(db, reminderMatch[1]));
    }

    if (method === 'POST' && pathname === '/api/editors') {
      const id = upsertEditor(db, body);
      return { ...jsonResp(201, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'editor_saved' };
    }

    const editorMatch = pathname.match(/^\/api\/editors\/(\d+)$/);
    if (method === 'PATCH' && editorMatch) {
      const id = upsertEditor(db, { ...body, id: Number(editorMatch[1]) });
      return { ...jsonResp(200, { id, snapshot: getWorkspaceSnapshot(db) }), mutated: 'editor_saved' };
    }

    if (method === 'POST' && pathname === '/api/ai/command') {
      const result = await runAiCommand(db, body?.text || '');
      if (body?.autoExecute && Array.isArray(result.drafts) && result.drafts.length > 0) {
        const orderDrafts = result.drafts.filter((d) => d.type === 'order');
        const allOrdersComplete =
          orderDrafts.length > 0 &&
          orderDrafts.length === result.drafts.length &&
          orderDrafts.every((d) => (d.client_id || String(d.client_name || '').trim()) && d.amount != null);
        const singlePaymentReady =
          result.drafts.length === 1 &&
          result.drafts[0].type === 'client_payment' &&
          result.drafts[0].client_id &&
          Number(result.drafts[0].amount) > 0;
        const singlePayoutReady =
          result.drafts.length === 1 &&
          result.drafts[0].type === 'editor_payout' &&
          result.drafts[0].editor_id &&
          Number(result.drafts[0].amount) > 0;
        const singleExpenseReady =
          result.drafts.length === 1 &&
          result.drafts[0].type === 'expense' &&
          Number(result.drafts[0].amount) > 0;

        if (allOrdersComplete) {
          const ids =
            orderDrafts.length > 1
              ? createBatchOrders(db, orderDrafts)
              : [createOrder(db, orderDrafts[0])];
          const snapshot = getWorkspaceSnapshot(db);
          return {
            ...jsonResp(200, {
              ...result,
              autoExecuted: true,
              createdIds: ids,
              snapshot,
            }),
            mutated: 'ai_auto_executed',
          };
        }
        if (singlePaymentReady) {
          recordClientPayment(db, result.drafts[0]);
          return {
            ...jsonResp(200, { ...result, autoExecuted: true, snapshot: getWorkspaceSnapshot(db) }),
            mutated: 'ai_auto_executed',
          };
        }
        if (singlePayoutReady) {
          recordEditorPayout(db, result.drafts[0]);
          return {
            ...jsonResp(200, { ...result, autoExecuted: true, snapshot: getWorkspaceSnapshot(db) }),
            mutated: 'ai_auto_executed',
          };
        }
        if (singleExpenseReady) {
          recordExpense(db, result.drafts[0]);
          return {
            ...jsonResp(200, { ...result, autoExecuted: true, snapshot: getWorkspaceSnapshot(db) }),
            mutated: 'ai_auto_executed',
          };
        }
      }
      return jsonResp(200, result);
    }

    if (method === 'POST' && pathname === '/api/ai/test') {
      const results = await testAiProviders(db, body || {});
      return jsonResp(200, { ok: true, results });
    }

    if (method === 'POST' && pathname === '/api/auto/suggest') {
      const suggestions = autoSuggestForOrder(db, body || {});
      return jsonResp(200, { ok: true, suggestions });
    }

    if (method === 'POST' && pathname === '/api/auto/reminder') {
      const res = generateAutoReminder(db, body || {});
      return jsonResp(200, res);
    }

    if (method === 'POST' && pathname === '/api/import/csv/preview') {
      const preview = previewSpreadsheetCsv(db, body?.csvText || '');
      return jsonResp(200, preview);
    }

    if (method === 'POST' && pathname === '/api/import/csv') {
      const result = importSpreadsheetCsv(db, body?.csvText || '', { mode: body?.mode || 'upsert' });
      return { ...jsonResp(200, { result, snapshot: getWorkspaceSnapshot(db) }), mutated: 'csv_imported' };
    }

    if (method === 'PATCH' && pathname === '/api/settings') {
      const allowed = [
        'agency_name',
        'owner_name',
        'order_prefix',
        'pin_enabled',
        'mobile_pin',
        'ai_provider',
        'ai_api_key',
        'groq_api_key',
        'gemini_api_key',
        'openrouter_api_key',
        'openai_api_key',
        'ai_model',
        'ai_auto_fulfill',
        'minimize_to_tray',
        'cloud_url',
        'cloud_pin',
        'cloud_sync_enabled',
      ];
      const secretKeys = new Set([
        'ai_api_key',
        'groq_api_key',
        'gemini_api_key',
        'openrouter_api_key',
        'openai_api_key',
      ]);
      const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
      for (const k of allowed) {
        if (body[k] === undefined) continue;
        if (k === 'pin_enabled' || k === 'minimize_to_tray' || k === 'cloud_sync_enabled' || k === 'ai_auto_fulfill') {
          stmt.run(k, body[k] ? '1' : '0');
        } else if (secretKeys.has(k)) {
          if (body[`clear_${k}`] || body.clear_ai_key) stmt.run(k, '');
          else if (String(body[k]).trim()) stmt.run(k, String(body[k]).trim());
        } else if (k === 'cloud_pin') {
          if (String(body[k]).trim()) stmt.run(k, String(body[k]).trim());
        } else {
          stmt.run(k, String(body[k]));
        }
      }
      logActivity(db, 'settings_updated', 'Updated agency & sync settings', 'system', null);
      return { ...jsonResp(200, { snapshot: getWorkspaceSnapshot(db) }), mutated: 'settings_updated' };
    }

    if (method === 'GET' && pathname === '/api/export/orders.csv') {
      const csv = exportOrdersCsv(db);
      return {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="editdesk-orders.csv"',
        },
        body: csv,
      };
    }

    if (method === 'GET' && pathname === '/api/export/backup.json') {
      const snap = getWorkspaceSnapshot(db);
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="editdesk-backup.json"',
        },
        body: JSON.stringify(snap, null, 2),
      };
    }

    if (method === 'POST' && pathname === '/api/system/reset-seed') {
      resetToSeed(db);
      return { ...jsonResp(200, { snapshot: getWorkspaceSnapshot(db) }), mutated: 'reset_seed' };
    }

    // Sync Endpoints
    if (method === 'GET' && pathname === '/api/sync/meta') {
      const updated = db.prepare('SELECT MAX(updated_at) AS ts FROM orders').get()?.ts || '';
      return jsonResp(200, { rev: currentRev, updated_at: updated });
    }

    if (method === 'GET' && pathname === '/api/sync/export-db' && syncCallbacks?.exportDbBytes) {
      const bytes = syncCallbacks.exportDbBytes();
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-EditDesk-Rev': String(currentRev),
        },
        body: bytes,
      };
    }

    if (method === 'POST' && pathname === '/api/sync/import-db' && syncCallbacks?.importDbBytes) {
      const res = await syncCallbacks.importDbBytes(rawBody);
      return jsonResp(200, res);
    }

    if (method === 'POST' && pathname === '/api/sync/push' && syncCallbacks?.pushToCloud) {
      const res = await syncCallbacks.pushToCloud(body);
      return jsonResp(200, res);
    }

    if (method === 'POST' && pathname === '/api/sync/pull' && syncCallbacks?.pullFromCloud) {
      const res = await syncCallbacks.pullFromCloud(body);
      return jsonResp(200, res);
    }

    return jsonResp(404, { error: 'Endpoint not found' });
  } catch (err) {
    return jsonResp(400, { error: err.message || 'Bad request' });
  }
}
