import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/index.mjs';
import { createMemoryBlobStore, createNetlifyHandler } from '../netlify/functions/api.mjs';

test('Netlify Cloud Function: strict PIN lock, sql.js Blob persistence, and Desktop <-> Cloud sync', async () => {
  const store = createMemoryBlobStore();
  const handler = createNetlifyHandler({ storeOverride: store });

  // Start temporary cloud HTTP server wrapping the Netlify Web Request/Response handler
  const http = await import('node:http');
  const cloudServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyBuf = Buffer.concat(chunks);
    const fullUrl = `http://127.0.0.1:${cloudServer.address().port}${req.url}`;
    const webReq = new Request(fullUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuf : undefined,
    });
    const webRes = await handler(webReq);
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    const outBuf = Buffer.from(await webRes.arrayBuffer());
    res.end(outBuf);
  });

  await new Promise((r) => cloudServer.listen(0, '127.0.0.1', r));
  const cloudPort = cloudServer.address().port;
  const cloudUrl = `http://127.0.0.1:${cloudPort}`;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editdesk-sync-'));
  const desktopDbPath = path.join(dir, 'desktop.db');
  const desktop = createApp({ dbPath: desktopDbPath });

  try {
    // 1. Unauthenticated cloud request MUST return 401
    const unauth = await fetch(`${cloudUrl}/api/workspace`);
    assert.equal(unauth.status, 401);

    // 2. PIN auth returns token
    const pinResp = await fetch(`${cloudUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2026' }),
    });
    assert.equal(pinResp.status, 200);
    const { token } = await pinResp.json();
    assert.ok(token);

    // 3. Push Desktop SQLite database to Cloud
    const pushRes = await desktop.pushToCloud({ cloud_url: cloudUrl, cloud_pin: '2026' });
    assert.equal(pushRes.ok, true);

    // Enable auto-sync on Desktop
    desktop.db
      .prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('cloud_sync_enabled', '1')")
      .run();

    // 4. Simulate iPhone adding order SYN0013 directly against Cloud URL
    const mobileOrderResp = await fetch(`${cloudUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        client_name: 'Bloom Care',
        title: 'Added from iPhone 5G',
        category: 'Shorts',
        amount: 1600,
      }),
    });
    assert.equal(mobileOrderResp.status, 201);
    const mobileCreated = await mobileOrderResp.json();
    assert.ok(mobileCreated.snapshot.orders.some((o) => o.title === 'Added from iPhone 5G'));

    // 5. Desktop background sync tick automatically detects newer Cloud rev & pulls it locally
    await desktop.runBackgroundSyncTick();

    const orderRow = desktop.db
      .prepare("SELECT * FROM orders WHERE title = 'Added from iPhone 5G'")
      .get();
    assert.ok(orderRow, 'Desktop local SQLite should now contain the order created on iPhone via Cloud');
    assert.equal(orderRow.amount, 1600);
  } finally {
    cloudServer.close();
    desktop.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
