import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { importSpreadsheetCsv, previewSpreadsheetCsv } from '../server/csvImportService.mjs';
import { exportOrdersCsv, getWorkspaceSnapshot } from '../server/ledgerService.mjs';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editdesk-csv-'));
  const db = openDatabase(path.join(dir, 'csv.db'));
  return { db, dir };
}

const SAMPLE_MULTI_SECTION_CSV = `Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status,,,Notes
SYN0001,2026-01-05,Nova Fit,Shorts,1000,Completed,,,
SYN0002,2026-02-01,Bloom ,Script Writing,500,Completed,,,
SYN0003,2026-02-06,Nova Fitness,Video Edit,2500,Completed,0,,
SYN0004,2026-11-20,Bloom Care,Shorts,0,Completed,,,Bundled
SYN0005,2026-11-22,UrbanRoast,Shorts,1200,,,,
SYN0006,2026-11-25,Bloom,Shorts,,,,,
SYN0007,,,,,,,,
Total: 5200,,,,,,,,

Project ID,Order date,Editor Name,Project Description,Amount Paid,Payment Status,
SYN0001,2026-01-05,Rohan,Shorts,600,Completed,
SYN0002,2026-02-01,Owner ,Script Writing,0,Completed,
SYN0003,2026-02-06,Rohan,Video Edit,1500,Completed,0
SYN0004,2026-11-20,Rohan,Shorts,200,,
SYN0005,2026-11-22,,Shorts,,,
SYN0006,2026-11-25,Kabir,Shorts,450,,
SYN0007,,,,,,

Yearly,Total Amount Received,Total Amount Paid,Total Profit,Profit Percentage,,
2025,18500,11200,7300,39.46%,,
2026,5200,2750,2450,47.12%,,
`;

test('Multi-section CSV preview, replace import, and idempotent re-import upsert', () => {
  const { db, dir } = makeTempDb();
  try {
    const prev = previewSpreadsheetCsv(db, SAMPLE_MULTI_SECTION_CSV);
    assert.equal(prev.orderCount, 6);
    assert.equal(prev.totalReceived, 5200);
    assert.equal(prev.totalEditorCost, 2750);
    assert.equal(prev.totalProfit, 2450);
    assert.deepEqual(prev.baselineYears, [2025]);

    const res1 = importSpreadsheetCsv(db, SAMPLE_MULTI_SECTION_CSV, { mode: 'replace' });
    assert.equal(res1.inserted, 6);
    assert.equal(res1.baselineCount, 1);

    let snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.equal(snap.orders.length, 6);
    assert.equal(snap.kpis.total_billed, 5200);
    assert.equal(snap.kpis.total_collected, 5200);
    assert.equal(snap.kpis.total_editor_committed, 2750);
    assert.equal(snap.kpis.gross_project_profit, 2450);
    // Rohan (SYN0004: 200) + Kabir (SYN0006: 450) pending payout
    assert.equal(snap.kpis.total_editor_due, 650);
    // SYN0005 unassigned
    assert.ok(snap.attention.unassigned.some((o) => o.order_code === 'SYN0005'));
    // SYN0006 rate pending
    assert.equal(snap.orders.find((o) => o.order_code === 'SYN0006').payment_status, 'Rate Pending');

    // Re-importing same CSV with upsert produces zero duplicates and updates cleanly
    const updatedCsv = SAMPLE_MULTI_SECTION_CSV.replace(
      'SYN0006,2026-11-25,Bloom,Shorts,,,,,',
      'SYN0006,2026-11-25,Bloom,Shorts,1500,Completed,,,'
    );
    const res2 = importSpreadsheetCsv(db, updatedCsv, { mode: 'upsert' });
    assert.equal(res2.inserted, 0);
    assert.equal(res2.updated, 6);

    snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.equal(snap.orders.length, 6);
    assert.equal(snap.kpis.total_billed, 6700);
    assert.equal(snap.kpis.total_collected, 6700);
    assert.equal(snap.orders.find((o) => o.order_code === 'SYN0006').payment_status, 'Paid');

    // Round-trip standard single-table EditDesk CSV export -> import back idempotently
    const exported = exportOrdersCsv(db);
    const res3 = importSpreadsheetCsv(db, exported, { mode: 'upsert' });
    assert.equal(res3.inserted, 0);
    assert.equal(res3.updated, 6);
    snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.equal(snap.kpis.total_billed, 6700);
    assert.equal(snap.kpis.total_collected, 6700);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
