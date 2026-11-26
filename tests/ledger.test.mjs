import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../server/db.mjs';
import {
  allocateClientAdvance,
  createBatchOrders,
  createOrder,
  exportOrdersCsv,
  getWorkspaceSnapshot,
  recordClientPayment,
  recordEditorPayout,
  recordExpense,
  updateOrder,
} from '../server/ledgerService.mjs';
import { generateClientReminder, parseOfflineCommand } from '../server/aiService.mjs';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editdesk-test-'));
  const dbPath = path.join(dir, 'test.db');
  const db = openDatabase(dbPath);
  return { db, dir, dbPath };
}

test('Sample 2025 & 2026 SYN0001-SYN0012 baseline totals and normalization are exact', () => {
  const { db, dir } = makeTempDb();
  try {
    const snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.equal(snap.orders.length, 12);
    assert.equal(snap.kpis.total_billed, 19500);
    assert.equal(snap.kpis.total_collected, 15200);
    assert.equal(snap.kpis.total_receivable, 4300);
    assert.equal(snap.kpis.total_editor_committed, 9200);
    assert.equal(snap.kpis.gross_project_profit, 10300);

    // Check 2025 baseline preserved
    const y2025 = snap.yearlySummary.find((y) => y.year === '2025');
    assert.ok(y2025);
    assert.equal(y2025.project_billed, 18500);
    assert.equal(y2025.editor_cost_committed, 11200);
    assert.equal(y2025.project_profit, 7300);

    // Check normalized clients & editors
    assert.ok(snap.clients.find((c) => c.name === 'Nova Fitness'));
    assert.ok(snap.clients.find((c) => c.name === 'Bloom Care'));
    assert.equal(snap.clients.find((c) => c.name === 'Nova Fit'), undefined);
    assert.equal(snap.clients.find((c) => c.name === 'Bloom'), undefined);

    const owner = snap.editors.find((e) => e.name === 'Owner');
    assert.ok(owner?.is_self);

    // Submitted unpaid payouts: Rohan (1100 + 650 = 1750; SYN0012 1200 excluded until submitted), Kabir (450)
    const rohan = snap.editors.find((e) => e.name === 'Rohan');
    const kabir = snap.editors.find((e) => e.name === 'Kabir');
    assert.equal(rohan.payout_due, 1750);
    assert.equal(kabir.payout_due, 450);
    assert.equal(snap.kpis.total_editor_due, 2200);

    // Check SYN0009 unassigned & SYN0010 Rate Pending in attention
    assert.ok(snap.attention.unassigned.some((o) => o.order_code === 'SYN0009'));
    assert.ok(snap.attention.needsReview.some((o) => o.order_code === 'SYN0010' && o.payment_status === 'Rate Pending'));
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Order -> delayed lump-sum 5k FIFO allocation + unallocated advance + next order apply', () => {
  const { db, dir } = makeTempDb();
  try {
    // UrbanRoast currently has 0 unpaid due; create 3 orders (1500 + 2000 + 1000 = 4500)
    const id1 = createOrder(db, {
      client_name: 'UrbanRoast',
      order_date: '2026-11-26',
      title: 'Espresso Reel',
      category: 'Shorts',
      amount: 1500,
      editor_name: 'Rohan',
      editor_cost: 600,
      production_deadline: '2026-11-28',
    });
    const id2 = createOrder(db, {
      client_name: 'UrbanRoast',
      order_date: '2026-11-27',
      title: 'Latte Art Short',
      category: 'Shorts',
      amount: 2000,
      editor_name: 'Rohan',
      editor_cost: 700,
    });
    const id3 = createOrder(db, {
      client_name: 'UrbanRoast',
      order_date: '2026-11-28',
      title: 'Cafe Tour Edit',
      category: 'Video Edit',
      amount: 1000,
    });

    // UrbanRoast sends ₹5,000 a month later -> FIFO covers 1500 + 2000 + 1000 = 4500, leaving 500 advance
    const client = getWorkspaceSnapshot(db).clients.find((c) => c.name === 'UrbanRoast');
    const payRes = recordClientPayment(db, {
      client_id: client.id,
      payment_date: '2026-12-26',
      amount: 5000,
      method: 'UPI',
      mode: 'fifo',
    });

    assert.equal(payRes.allocated_amount, 4500);
    assert.equal(payRes.unallocated_amount, 500);

    let snap = getWorkspaceSnapshot(db, '2026-12-26');
    const o1 = snap.orders.find((o) => o.id === id1);
    const o2 = snap.orders.find((o) => o.id === id2);
    const o3 = snap.orders.find((o) => o.id === id3);
    assert.equal(o1.order_code, 'SYN0013');
    assert.equal(o1.payment_status, 'Paid');
    assert.equal(o2.payment_status, 'Paid');
    assert.equal(o3.payment_status, 'Paid');
    assert.equal(snap.clients.find((c) => c.id === client.id).unallocated_advance, 500);

    // Next order SYN0016 for ₹1,200 -> apply ₹500 unallocated advance
    const id4 = createOrder(db, {
      client_id: client.id,
      order_date: '2026-12-28',
      title: 'New Year Promo',
      category: 'Shorts',
      amount: 1200,
    });
    allocateClientAdvance(db, { payment_id: payRes.payment_id, order_id: id4 });

    snap = getWorkspaceSnapshot(db, '2026-12-28');
    const o4 = snap.orders.find((o) => o.id === id4);
    assert.equal(o4.allocated_paid, 500);
    assert.equal(o4.balance_due, 700);
    assert.equal(o4.payment_status, 'Partially paid');
    assert.equal(snap.clients.find((c) => c.id === client.id).unallocated_advance, 0);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Editor payout lock until editor_work_submitted + partial FIFO payout + separate deadlines', () => {
  const { db, dir } = makeTempDb();
  try {
    const idNew = createOrder(db, {
      client_name: 'Pixel Labs',
      order_date: '2026-11-15',
      title: 'Product Highlight',
      category: 'Shorts',
      amount: 1000,
      editor_name: 'Kabir',
      editor_cost: 400,
      production_deadline: '2026-11-20', // overdue production on 2026-11-26
      payment_due_date: null,
    });

    let snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.ok(snap.attention.overdueProduction.some((o) => o.id === idNew));
    assert.ok(!snap.attention.overdueInvoices.some((o) => o.id === idNew));

    // Payout due for Kabir should still only be 450 (SYN0010), NOT 450+400 until work submitted
    let kabir = snap.editors.find((e) => e.name === 'Kabir');
    assert.equal(kabir.payout_due, 450);

    // Mark work submitted on new order
    updateOrder(db, idNew, { editor_work_submitted: true, production_status: 'Delivered' });
    snap = getWorkspaceSnapshot(db, '2026-11-26');
    kabir = snap.editors.find((e) => e.name === 'Kabir');
    assert.equal(kabir.payout_due, 850);

    // Partial payout of 700 settles older order idNew (2026-11-15, 400) + 300 of SYN0010 (2026-11-18, 450)
    const payoutRes = recordEditorPayout(db, {
      editor_id: kabir.id,
      amount: 700,
      payout_date: '2026-11-26',
      mode: 'fifo',
    });
    assert.equal(payoutRes.allocated_amount, 700);
    assert.equal(payoutRes.unallocated_amount, 0);

    snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.equal(snap.editors.find((e) => e.id === kabir.id).payout_due, 150);
    assert.equal(snap.orders.find((o) => o.id === idNew).editor_payout_status, 'Paid');
    const syn10 = snap.orders.find((o) => o.order_code === 'SYN0010');
    assert.equal(syn10.editor_payout_status, 'Partially paid');
    assert.equal(syn10.editor_balance_due, 150);

    // Operating expense reduces net profit without changing gross project profit
    recordExpense(db, {
      expense_date: '2026-11-26',
      category: 'Software',
      description: 'Adobe Creative Cloud',
      amount: 1500,
    });
    snap = getWorkspaceSnapshot(db, '2026-11-26');
    assert.equal(snap.kpis.total_expenses, 1500);
    assert.equal(snap.kpis.net_profit_after_expenses, snap.kpis.gross_project_profit - 1500);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Offline AI parser drafts single order, multi-order chat, lump-sum payment, and reminder', () => {
  const { db, dir } = makeTempDb();
  try {
    const orderRes = parseOfflineCommand(db, 'Bloom Care wants a new short on winter skincare, assign to Rohan');
    assert.equal(orderRes.intent, 'order');
    assert.equal(orderRes.drafts.length, 1);
    assert.equal(orderRes.drafts[0].client_name, 'Bloom Care');
    assert.equal(orderRes.drafts[0].title, 'Winter skincare');
    assert.equal(orderRes.drafts[0].editor_name, 'Rohan');
    assert.equal(orderRes.drafts[0].category, 'Shorts');
    assert.equal(orderRes.drafts[0].amount, null);

    const batchRes = parseOfflineCommand(
      db,
      'Need 3 shorts for Nova Fitness:\n1) Gym myth reel\n2) Protein recipe\n3) Client transformation'
    );
    assert.equal(batchRes.intent, 'batch_orders');
    assert.equal(batchRes.drafts.length, 3);
    createBatchOrders(db, batchRes.drafts);

    const payRes = parseOfflineCommand(db, 'Bloom Care sent 5k UPI');
    assert.equal(payRes.intent, 'client_payment');
    assert.equal(payRes.drafts[0].amount, 5000);
    assert.equal(payRes.drafts[0].client_name, 'Bloom Care');

    const ansRes = parseOfflineCommand(db, 'How much do I owe Rohan?');
    assert.equal(ansRes.intent, 'answer');
    assert.match(ansRes.answer, /1,750/);

    const reminder = generateClientReminder(
      db,
      getWorkspaceSnapshot(db).clients.find((c) => c.name === 'Bloom Care').id
    );
    assert.match(reminder.message, /Bloom Care/);

    const csv = exportOrdersCsv(db);
    assert.match(csv, /SYN0001/);
    assert.match(csv, /SYN0015/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
