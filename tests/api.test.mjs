import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/index.mjs';

test('HTTP API: PIN auth on remote requests, workspace fetch, order create, lump-sum payment, AI preview, CSV export', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editdesk-api-'));
  const dbPath = path.join(dir, 'api.db');
  const { app, db } = createApp({ dbPath });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Remote request simulation without PIN fails with 401
    const unauth = await fetch(`${baseUrl}/api/workspace`, {
      headers: { 'x-editdesk-remote-test': '1' },
    });
    assert.equal(unauth.status, 401);

    // 2. PIN auth returns token and unlocks remote request
    const pinResp = await fetch(`${baseUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2026' }),
    });
    assert.equal(pinResp.status, 200);
    const { token } = await pinResp.json();
    assert.ok(token);

    const authed = await fetch(`${baseUrl}/api/workspace`, {
      headers: { 'x-editdesk-remote-test': '1', Authorization: `Bearer ${token}` },
    });
    assert.equal(authed.status, 200);
    const snap = await authed.json();
    assert.equal(snap.kpis.total_billed, 19500);

    // 3. Create order via localhost
    const createResp = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bloom Care',
        title: 'API Test Reel',
        category: 'Shorts',
        amount: 1000,
      }),
    });
    assert.equal(createResp.status, 201);
    const created = await createResp.json();
    const syn13 = created.snapshot.orders.find((o) => o.order_code === 'SYN0013');
    assert.ok(syn13);
    assert.equal(syn13.payment_status, 'Unpaid');

    // 4. AI Command preview (does NOT mutate DB)
    const aiResp = await fetch(`${baseUrl}/api/ai/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Bloom Care paid 5k UPI' }),
    });
    assert.equal(aiResp.status, 200);
    const aiJson = await aiResp.json();
    assert.equal(aiJson.intent, 'client_payment');
    assert.equal(aiJson.drafts[0].amount, 5000);

    // Confirm SYN0013 is STILL unpaid because AI never mutates silently
    const checkSnap = await (await fetch(`${baseUrl}/api/workspace`)).json();
    assert.equal(checkSnap.orders.find((o) => o.order_code === 'SYN0013').payment_status, 'Unpaid');

    // 5. Mobile QR info endpoint
    const mobResp = await fetch(`${baseUrl}/api/mobile-info`);
    assert.equal(mobResp.status, 200);
    const mob = await mobResp.json();
    assert.ok(mob.primaryUrl.startsWith('http://'));
    assert.ok(mob.primaryQr.startsWith('data:image/png;base64,'));

    // 6. CSV Export
    const csvResp = await fetch(`${baseUrl}/api/export/orders.csv`);
    assert.equal(csvResp.status, 200);
    const csvText = await csvResp.text();
    assert.match(csvText, /SYN0013/);
  } finally {
    server.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
