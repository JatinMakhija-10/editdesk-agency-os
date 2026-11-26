import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { resetForFreshStart } from '../server/dbCore.mjs';
import {
  allocateClientAdvance,
  allocateEditorAdvance,
  createBatchOrders,
  createOrder,
  deleteExpense,
  deleteOrder,
  exportOrdersCsv,
  getNextOrderCode,
  getWorkspaceSnapshot,
  ORDER_CATEGORIES,
  PRODUCTION_STAGES,
  recordClientPayment,
  recordEditorPayout,
  recordExpense,
  updateOrder,
  upsertClient,
  upsertEditor,
} from '../server/ledgerService.mjs';
import {
  autoSuggestForOrder,
  generateAutoReminder,
  generateClientReminder,
  parseOfflineCommand,
} from '../server/aiService.mjs';
import { importSpreadsheetCsv, previewSpreadsheetCsv } from '../server/csvImportService.mjs';
import { createApp } from '../server/index.mjs';

function makeFreshDb({ keepClientsAndEditors = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editdesk-s100-'));
  const dbPath = path.join(dir, 'stress.db');
  const db = openDatabase(dbPath);
  resetForFreshStart(db, { keepClientsAndEditors });
  return { db, dir, dbPath };
}

function cleanup({ db, dir }) {
  try {
    db?.close();
  } catch {
    // ignore
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// ============================================================================
// 1..15: Jan 2027 Fresh Start, Client List Management & Micro-Order Tracking
// ============================================================================

test('TC001: Fresh start preserving clients & editors clears all orders and financial totals', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: true });
  try {
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-01');
    assert.equal(snap.orders.length, 0);
    assert.ok(snap.clients.length > 0);
    assert.ok(snap.editors.length > 0);
    assert.equal(snap.kpis.total_billed, 0);
    assert.equal(snap.kpis.total_collected, 0);
    assert.equal(snap.kpis.total_editor_due, 0);
    assert.equal(snap.yearlySummary.length, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC002: Blank fresh start clears clients & editors too and stays empty after reopen', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    ctx.db.close();
    ctx.db = openDatabase(ctx.dbPath);
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-01');
    assert.equal(snap.clients.length, 0);
    assert.equal(snap.editors.length, 0);
    assert.equal(snap.orders.length, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC003: Order numbering restarts cleanly at SYN0001 after clearing orders', () => {
  const ctx = makeFreshDb();
  try {
    assert.equal(getNextOrderCode(ctx.db, 'SYN'), 'SYN0001');
  } finally {
    cleanup(ctx);
  }
});

test('TC004: Add new client with full contact metadata, aliases, and default rates', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = upsertClient(ctx.db, {
      name: 'Apex Fitness Studio',
      aliases: 'Apex, Apex Gym',
      phone: '+91 9800000001',
      email: 'billing@apex.example',
      default_rate_shorts: 1000,
      default_rate_video: 2500,
      default_billing_type: 'monthly_package',
      notes: 'Net 7 invoicing',
    });
    const c = getWorkspaceSnapshot(ctx.db, '2027-01-05').clients.find((x) => x.id === id);
    assert.equal(c.name, 'Apex Fitness Studio');
    assert.equal(c.aliases, 'Apex, Apex Gym');
    assert.equal(c.default_rate_shorts, 1000);
    assert.equal(c.default_rate_video, 2500);
  } finally {
    cleanup(ctx);
  }
});

test('TC005: Reject creating client with empty/whitespace name', () => {
  const ctx = makeFreshDb();
  try {
    assert.throws(() => upsertClient(ctx.db, { name: '   ' }), /required/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC006: Prevent renaming client to collide with another existing client', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertClient(ctx.db, { name: 'Alpha Media' });
    const id2 = upsertClient(ctx.db, { name: 'Beta Media' });
    assert.throws(() => upsertClient(ctx.db, { id: id2, name: 'Alpha Media' }), /UNIQUE|already exists/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC007: Client alias matching maps abbreviated order client name to canonical client', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const cid = upsertClient(ctx.db, { name: 'Peak Athletics', aliases: 'Peak, PeakFit' });
    const oid = createOrder(ctx.db, {
      client_name: 'PeakFit',
      order_date: '2027-01-03',
      title: 'Intro Reel',
      category: 'Shorts',
      amount: 500,
    });
    const order = getWorkspaceSnapshot(ctx.db, '2027-01-03').orders.find((o) => o.id === oid);
    assert.equal(order.client_id, cid);
    assert.equal(order.client_name, 'Peak Athletics');
  } finally {
    cleanup(ctx);
  }
});

test('TC008: Track ultra-small micro-orders accurately (₹50, ₹100, ₹150, ₹250)', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const amounts = [50, 100, 150, 250];
    for (const [idx, amt] of amounts.entries()) {
      createOrder(ctx.db, {
        client_name: 'MicroClient',
        order_date: `2027-01-0${idx + 1}`,
        title: `Small Order #${idx + 1}`,
        category: 'Instagram Posts',
        amount: amt,
        editor_name: 'Mira',
        editor_cost: amt * 0.4,
      });
    }
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    assert.equal(snap.orders.length, 4);
    assert.equal(snap.kpis.total_billed, 550);
    assert.equal(snap.kpis.total_editor_committed, 220);
    assert.equal(snap.kpis.gross_project_profit, 330);
  } finally {
    cleanup(ctx);
  }
});

test('TC009: Track every supported category in ORDER_CATEGORIES for Jan 2027', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    for (const [i, cat] of ORDER_CATEGORIES.entries()) {
      createOrder(ctx.db, {
        client_name: 'CategoryCo',
        order_date: `2027-01-${String(i + 1).padStart(2, '0')}`,
        title: `${cat} sample`,
        category: cat,
        amount: 300,
      });
    }
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-20');
    assert.equal(snap.categoryBreakdown.length, ORDER_CATEGORIES.length);
    assert.equal(snap.kpis.total_billed, ORDER_CATEGORIES.length * 300);
  } finally {
    cleanup(ctx);
  }
});

test('TC010: Jan 2027 P&L groups strictly under 2027-01 and yearly 2027', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'BrightBrew',
      order_date: '2027-01-14',
      title: 'Launch Short',
      category: 'Shorts',
      amount: 1200,
      editor_name: 'Dev',
      editor_cost: 480,
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-20');
    assert.equal(snap.monthlySummary[0].month, '2027-01');
    assert.equal(snap.monthlySummary[0].project_billed, 1200);
    assert.equal(snap.monthlySummary[0].project_profit, 720);
    assert.equal(snap.yearlySummary[0].year, '2027');
    assert.equal(snap.yearlySummary[0].project_billed, 1200);
  } finally {
    cleanup(ctx);
  }
});

test('TC011: Reject negative order amount', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    assert.throws(
      () => createOrder(ctx.db, { client_name: 'BadAmt', order_date: '2027-01-01', title: 'Neg', amount: -10 }),
      /non-negative/i
    );
  } finally {
    cleanup(ctx);
  }
});

test('TC012: Reject negative editor cost on create', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    assert.throws(
      () =>
        createOrder(ctx.db, {
          client_name: 'BadEd',
          order_date: '2027-01-01',
          title: 'NegCost',
          amount: 500,
          editor_cost: -50,
        }),
      /zero or positive/i
    );
  } finally {
    cleanup(ctx);
  }
});

test('TC013: Blank amount saves order cleanly as Rate Pending (not ₹0)', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, {
      client_name: 'TBDClient',
      order_date: '2027-01-02',
      title: 'Open Quote',
      amount: '',
    });
    const o = getWorkspaceSnapshot(ctx.db, '2027-01-02').orders.find((x) => x.id === id);
    assert.equal(o.amount, null);
    assert.equal(o.payment_status, 'Rate Pending');
    assert.equal(o.balance_due, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC014: Zero amount order saves as Zero / Bundled cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, {
      client_name: 'BundleClient',
      order_date: '2027-01-02',
      title: 'Free revision',
      amount: 0,
    });
    const o = getWorkspaceSnapshot(ctx.db, '2027-01-02').orders.find((x) => x.id === id);
    assert.equal(o.amount, 0);
    assert.equal(o.payment_status, 'Zero / Bundled');
    assert.equal(o.balance_due, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC015: Production stages update across all valid workflow stages and reject invalid ones', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, {
      client_name: 'StageCo',
      order_date: '2027-01-04',
      title: 'Stage Test',
      amount: 900,
    });
    for (const st of PRODUCTION_STAGES) {
      updateOrder(ctx.db, id, { production_status: st });
    }
    const o = getWorkspaceSnapshot(ctx.db, '2027-01-04').orders.find((x) => x.id === id);
    assert.equal(o.production_status, 'Delivered');
    assert.throws(() => updateOrder(ctx.db, id, { production_status: 'BogusStage' }), /Invalid production/i);
  } finally {
    cleanup(ctx);
  }
});

// ============================================================================
// 16..35: Client Payments, FIFO Allocations, Selected Orders & Advances
// ============================================================================

test('TC016: Batch orders create sequential SYN codes atomically', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const ids = createBatchOrders(ctx.db, [
      { client_name: 'BatchCo', order_date: '2027-01-01', title: 'Clip 1', amount: 400 },
      { client_name: 'BatchCo', order_date: '2027-01-02', title: 'Clip 2', amount: 600 },
      { client_name: 'BatchCo', order_date: '2027-01-03', title: 'Clip 3', amount: 800 },
    ]);
    assert.equal(ids.length, 3);
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.deepEqual(
      snap.orders.map((o) => o.order_code).sort(),
      ['SYN0001', 'SYN0002', 'SYN0003']
    );
  } finally {
    cleanup(ctx);
  }
});

test('TC017: Exact single-order payment marks order Paid with ₹0 balance due', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'PayCo', order_date: '2027-01-02', title: 'Ad', amount: 750 });
    recordClientPayment(ctx.db, { client_name: 'PayCo', payment_date: '2027-01-03', amount: 750 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].payment_status, 'Paid');
    assert.equal(snap.orders[0].balance_due, 0);
    assert.equal(snap.kpis.total_receivable, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC018: Partial payment transitions order to Partially paid with exact remaining balance', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'PartCo', order_date: '2027-01-02', title: 'Edit', amount: 1500 });
    recordClientPayment(ctx.db, { client_name: 'PartCo', payment_date: '2027-01-03', amount: 600 });
    const o = getWorkspaceSnapshot(ctx.db, '2027-01-05').orders[0];
    assert.equal(o.payment_status, 'Partially paid');
    assert.equal(o.allocated_paid, 600);
    assert.equal(o.balance_due, 900);
  } finally {
    cleanup(ctx);
  }
});

test('TC019: FIFO settles 5 small micro-orders oldest-first and partially settles the 6th', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    for (let i = 1; i <= 6; i++) {
      createOrder(ctx.db, {
        client_name: 'TinyCo',
        order_date: `2027-01-0${i}`,
        title: `Short ${i}`,
        amount: 400,
      });
    }
    recordClientPayment(ctx.db, { client_name: 'TinyCo', payment_date: '2027-01-10', amount: 2150, mode: 'fifo' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    const ordered = [...snap.orders].sort((a, b) => a.order_date.localeCompare(b.order_date));
    assert.equal(ordered[0].payment_status, 'Paid');
    assert.equal(ordered[4].payment_status, 'Paid');
    assert.equal(ordered[5].payment_status, 'Partially paid');
    assert.equal(ordered[5].allocated_paid, 150);
    assert.equal(ordered[5].balance_due, 250);
  } finally {
    cleanup(ctx);
  }
});

test('TC020: Overpayment stores remainder as unallocated client advance', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'AdvCo', order_date: '2027-01-02', title: 'Banner', amount: 800 });
    const payRes = recordClientPayment(ctx.db, {
      client_name: 'AdvCo',
      payment_date: '2027-01-05',
      amount: 2000,
      mode: 'fifo',
    });
    assert.equal(payRes.allocated_amount, 800);
    assert.equal(payRes.unallocated_amount, 1200);
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.kpis.unallocated_client_advances, 1200);
  } finally {
    cleanup(ctx);
  }
});

test('TC021: Allocate held advance onto a future Jan 2027 small order', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertClient(ctx.db, { name: 'RetainerCo' });
    const pay = recordClientPayment(ctx.db, {
      client_name: 'RetainerCo',
      payment_date: '2027-01-01',
      amount: 1000,
      mode: 'unallocated',
    });
    const o1 = createOrder(ctx.db, {
      client_name: 'RetainerCo',
      order_date: '2027-01-06',
      title: 'Small reel #1',
      amount: 350,
    });
    allocateClientAdvance(ctx.db, { payment_id: pay.payment_id, order_id: o1 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-06');
    assert.equal(snap.orders[0].payment_status, 'Paid');
    assert.equal(snap.clients[0].unallocated_advance, 650);
  } finally {
    cleanup(ctx);
  }
});

test('TC022: Selected-orders payment allocates strictly to picked order IDs', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const o1 = createOrder(ctx.db, { client_name: 'PickCo', order_date: '2027-01-01', title: 'O1', amount: 500 });
    const o2 = createOrder(ctx.db, { client_name: 'PickCo', order_date: '2027-01-02', title: 'O2', amount: 500 });
    recordClientPayment(ctx.db, {
      client_name: 'PickCo',
      payment_date: '2027-01-05',
      amount: 500,
      mode: 'selected',
      selected_order_ids: [o2],
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders.find((o) => o.id === o1).payment_status, 'Unpaid');
    assert.equal(snap.orders.find((o) => o.id === o2).payment_status, 'Paid');
  } finally {
    cleanup(ctx);
  }
});

test('TC023: Reject zero or negative client payment amount', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertClient(ctx.db, { name: 'ZeroPayCo' });
    assert.throws(
      () => recordClientPayment(ctx.db, { client_name: 'ZeroPayCo', amount: 0 }),
      /greater than zero/i
    );
    assert.throws(
      () => recordClientPayment(ctx.db, { client_name: 'ZeroPayCo', amount: -200 }),
      /greater than zero/i
    );
  } finally {
    cleanup(ctx);
  }
});

test('TC024: Prevent lowering order amount below already-allocated payment total', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, { client_name: 'LockAmtCo', order_date: '2027-01-02', title: 'Lock', amount: 1000 });
    recordClientPayment(ctx.db, { client_name: 'LockAmtCo', payment_date: '2027-01-03', amount: 800 });
    assert.throws(() => updateOrder(ctx.db, oid, { amount: 600 }), /already has/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC025: Prevent changing client on an order with allocated payments', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, { client_name: 'OrigCo', order_date: '2027-01-02', title: 'C', amount: 1000 });
    const otherId = upsertClient(ctx.db, { name: 'OtherCo' });
    recordClientPayment(ctx.db, { client_name: 'OrigCo', payment_date: '2027-01-03', amount: 500 });
    assert.throws(() => updateOrder(ctx.db, oid, { client_id: otherId }), /Cannot change client/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC026: Deleting an unpaid unallocated order succeeds; deleting an allocated order is blocked', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oFree = createOrder(ctx.db, { client_name: 'DelCo', order_date: '2027-01-01', title: 'Free', amount: 400 });
    assert.equal(deleteOrder(ctx.db, oFree), true);

    const oPaid = createOrder(ctx.db, { client_name: 'DelCo', order_date: '2027-01-02', title: 'Paid', amount: 400 });
    recordClientPayment(ctx.db, { client_name: 'DelCo', payment_date: '2027-01-02', amount: 400 });
    assert.throws(() => deleteOrder(ctx.db, oPaid), /Cannot delete/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC027: Allocating client advance to a different client order is rejected', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertClient(ctx.db, { name: 'ClientA' });
    const oB = createOrder(ctx.db, { client_name: 'ClientB', order_date: '2027-01-02', title: 'B', amount: 500 });
    const pay = recordClientPayment(ctx.db, { client_name: 'ClientA', amount: 500, mode: 'unallocated' });
    assert.throws(() => allocateClientAdvance(ctx.db, { payment_id: pay.payment_id, order_id: oB }), /different client/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC028: Allocating more advance than available throws an error', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, { client_name: 'CapCo', order_date: '2027-01-02', title: 'Big', amount: 1000 });
    const pay = recordClientPayment(ctx.db, { client_name: 'CapCo', amount: 300, mode: 'unallocated' });
    assert.throws(() => allocateClientAdvance(ctx.db, { payment_id: pay.payment_id, order_id: oid, amount: 400 }), /unallocated/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC029: Fractional paise/decimal orders & payments reconcile with round2 precision', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'FracCo',
      order_date: '2027-01-02',
      title: 'Fraction Edit',
      amount: 333.33,
      editor_name: 'Zed',
      editor_cost: 166.67,
    });
    recordClientPayment(ctx.db, { client_name: 'FracCo', payment_date: '2027-01-03', amount: 333.33 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].balance_due, 0);
    assert.equal(snap.kpis.gross_project_profit, 166.66);
  } finally {
    cleanup(ctx);
  }
});

test('TC030: Resolving Rate Pending order dynamically transitions status from TBD to Unpaid and then Paid via advance', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const pay = recordClientPayment(ctx.db, { client_name: 'RateWaitCo', amount: 1000, mode: 'unallocated' });
    const oid = createOrder(ctx.db, { client_name: 'RateWaitCo', order_date: '2027-01-05', title: 'Custom' });
    let snap = getWorkspaceSnapshot(ctx.db, '2027-01-06');
    assert.equal(snap.orders[0].payment_status, 'Rate Pending');
    updateOrder(ctx.db, oid, { amount: 900 });
    allocateClientAdvance(ctx.db, { payment_id: pay.payment_id, order_id: oid });
    snap = getWorkspaceSnapshot(ctx.db, '2027-01-06');
    assert.equal(snap.orders[0].payment_status, 'Paid');
    assert.equal(snap.clients[0].unallocated_advance, 100);
  } finally {
    cleanup(ctx);
  }
});

test('TC031: Attention radar separates production deadline overdue from invoice payment due date', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, {
      client_name: 'DueCo',
      order_date: '2027-01-01',
      title: 'Split Deadlines',
      amount: 1000,
      production_deadline: '2027-01-05',
      payment_due_date: '2027-01-25',
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    assert.ok(snap.attention.overdueProduction.some((o) => o.id === id));
    assert.equal(snap.attention.overdueInvoices.some((o) => o.id === id), false);
  } finally {
    cleanup(ctx);
  }
});

test('TC032: Attention radar flags upcoming production (<=3d) and upcoming invoices (<=7d)', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, {
      client_name: 'SoonCo',
      order_date: '2027-01-01',
      title: 'Upcoming Both',
      amount: 1000,
      production_deadline: '2027-01-12',
      payment_due_date: '2027-01-16',
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    assert.ok(snap.attention.upcomingProduction.some((o) => o.id === id));
    assert.ok(snap.attention.upcomingInvoices.some((o) => o.id === id));
  } finally {
    cleanup(ctx);
  }
});

test('TC033: Delivered orders drop out of overdueProduction and active_orders count', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, {
      client_name: 'DoneCo',
      order_date: '2027-01-01',
      title: 'Ship',
      amount: 600,
      production_deadline: '2027-01-02',
    });
    updateOrder(ctx.db, id, { production_status: 'Delivered' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    assert.equal(snap.kpis.active_orders, 0);
    assert.equal(snap.kpis.delivered_orders, 1);
    assert.equal(snap.attention.overdueProduction.length, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC034: Holding advance preserves open balance_due until explicitly allocated', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'HoldCo', order_date: '2027-01-01', title: 'Edit', amount: 500 });
    recordClientPayment(ctx.db, { client_name: 'HoldCo', amount: 500, mode: 'unallocated' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-02');
    assert.equal(snap.orders[0].balance_due, 500);
    assert.equal(snap.clients[0].unallocated_advance, 500);
  } finally {
    cleanup(ctx);
  }
});

test('TC035: Multiple payments to same order track cumulative allocated_paid accurately', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'SplitPayCo', order_date: '2027-01-01', title: 'Split', amount: 1200 });
    recordClientPayment(ctx.db, { client_name: 'SplitPayCo', amount: 400 });
    recordClientPayment(ctx.db, { client_name: 'SplitPayCo', amount: 400 });
    recordClientPayment(ctx.db, { client_name: 'SplitPayCo', amount: 400 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].payment_status, 'Paid');
    assert.equal(snap.orders[0].allocated_paid, 1200);
    assert.equal(snap.payments.length, 3);
  } finally {
    cleanup(ctx);
  }
});

// ============================================================================
// 36..55: Editors, Submission Locks, Payout FIFO, Expenses & Net Cash
// ============================================================================

test('TC036: Assigned editor payout stays locked until editor_work_submitted is true', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'C1',
      order_date: '2027-01-02',
      title: 'Job',
      amount: 1000,
      editor_name: 'Nikhil',
      editor_cost: 600,
      editor_work_submitted: false,
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].editor_payout_status, 'Awaiting Submission');
    assert.equal(snap.editors[0].payout_due, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC037: Submitting editor work immediately unlocks payout_due', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, {
      client_name: 'C1',
      order_date: '2027-01-02',
      title: 'Job',
      amount: 1000,
      editor_name: 'Nikhil',
      editor_cost: 600,
    });
    updateOrder(ctx.db, oid, { editor_work_submitted: true });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].editor_payout_status, 'Unpaid');
    assert.equal(snap.editors[0].payout_due, 600);
  } finally {
    cleanup(ctx);
  }
});

test('TC038: FIFO editor payout settles multiple small submitted jobs in chronological order', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    for (let i = 1; i <= 4; i++) {
      createOrder(ctx.db, {
        client_name: 'C1',
        order_date: `2027-01-0${i}`,
        title: `Reel ${i}`,
        amount: 500,
        editor_name: 'Karan',
        editor_cost: 200,
        editor_work_submitted: true,
      });
    }
    recordEditorPayout(ctx.db, { editor_name: 'Karan', payout_date: '2027-01-10', amount: 500, mode: 'fifo' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    const ordered = [...snap.orders].sort((a, b) => a.order_date.localeCompare(b.order_date));
    assert.equal(ordered[0].editor_payout_status, 'Paid');
    assert.equal(ordered[1].editor_payout_status, 'Paid');
    assert.equal(ordered[2].editor_payout_status, 'Partially paid');
    assert.equal(ordered[2].editor_balance_due, 100);
    assert.equal(ordered[3].editor_payout_status, 'Unpaid');
  } finally {
    cleanup(ctx);
  }
});

test('TC039: Selected-jobs editor payout settles specific chosen jobs', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const o1 = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-01',
      title: 'J1',
      amount: 500,
      editor_name: 'Samir',
      editor_cost: 250,
      editor_work_submitted: true,
    });
    const o2 = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-02',
      title: 'J2',
      amount: 500,
      editor_name: 'Samir',
      editor_cost: 250,
      editor_work_submitted: true,
    });
    recordEditorPayout(ctx.db, {
      editor_name: 'Samir',
      amount: 250,
      mode: 'selected',
      selected_order_ids: [o2],
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders.find((o) => o.id === o1).editor_payout_status, 'Unpaid');
    assert.equal(snap.orders.find((o) => o.id === o2).editor_payout_status, 'Paid');
  } finally {
    cleanup(ctx);
  }
});

test('TC040: Prevent unmarking editor_work_submitted after payout allocation', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-01',
      title: 'J',
      amount: 500,
      editor_name: 'Zoya',
      editor_cost: 200,
      editor_work_submitted: true,
    });
    recordEditorPayout(ctx.db, { editor_name: 'Zoya', amount: 100 });
    assert.throws(() => updateOrder(ctx.db, oid, { editor_work_submitted: false }), /Cannot unmark/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC041: Prevent reassigning or unassigning editor after payout allocated', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-01',
      title: 'J',
      amount: 500,
      editor_name: 'Ed1',
      editor_cost: 200,
      editor_work_submitted: true,
    });
    const ed2 = upsertEditor(ctx.db, { name: 'Ed2' });
    recordEditorPayout(ctx.db, { editor_name: 'Ed1', amount: 100 });
    assert.throws(() => updateOrder(ctx.db, oid, { editor_id: null }), /Cannot unassign/i);
    assert.throws(() => updateOrder(ctx.db, oid, { editor_id: ed2 }), /Cannot change editor/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC042: Prevent lowering editor_cost below allocated payout amount', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-01',
      title: 'J',
      amount: 500,
      editor_name: 'Ed',
      editor_cost: 300,
      editor_work_submitted: true,
    });
    recordEditorPayout(ctx.db, { editor_name: 'Ed', amount: 250 });
    assert.throws(() => updateOrder(ctx.db, oid, { editor_cost: 200 }), /already has/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC043: Editor advance payment allocates cleanly when new submitted order arrives', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertEditor(ctx.db, { name: 'AdvEd' });
    const p = recordEditorPayout(ctx.db, { editor_name: 'AdvEd', amount: 500, mode: 'unallocated' });
    const oid = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-05',
      title: 'Submitted Ad',
      amount: 1000,
      editor_name: 'AdvEd',
      editor_cost: 400,
      editor_work_submitted: true,
    });
    allocateEditorAdvance(ctx.db, { payout_id: p.payout_id, order_id: oid });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-06');
    assert.equal(snap.orders[0].editor_payout_status, 'Paid');
    assert.equal(snap.editors[0].unallocated_advance, 100);
  } finally {
    cleanup(ctx);
  }
});

test('TC044: Reject allocating editor advance onto unsubmitted order', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertEditor(ctx.db, { name: 'LockEd' });
    const p = recordEditorPayout(ctx.db, { editor_name: 'LockEd', amount: 500, mode: 'unallocated' });
    const oid = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-05',
      title: 'WIP',
      amount: 1000,
      editor_name: 'LockEd',
      editor_cost: 400,
      editor_work_submitted: false,
    });
    assert.throws(() => allocateEditorAdvance(ctx.db, { payout_id: p.payout_id, order_id: oid }), /submitted/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC045: Owner / Self editor resolves cleanly with Zero Cost status', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'SelfCo',
      order_date: '2027-01-02',
      title: 'Inhouse script',
      category: 'Script Writing',
      amount: 600,
      editor_name: 'Owner',
      editor_cost: 0,
      editor_work_submitted: true,
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.editors[0].is_self, true);
    assert.equal(snap.orders[0].editor_payout_status, 'Zero Cost');
    assert.equal(snap.kpis.gross_project_profit, 600);
  } finally {
    cleanup(ctx);
  }
});

test('TC046: Operating expenses deduct from net profit & monthly net cashflow cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'ExpCo',
      order_date: '2027-01-03',
      title: 'Video',
      amount: 3000,
      editor_name: 'Ed',
      editor_cost: 1200,
    });
    recordClientPayment(ctx.db, { client_name: 'ExpCo', payment_date: '2027-01-04', amount: 3000 });
    const expId = recordExpense(ctx.db, {
      expense_date: '2027-01-05',
      category: 'Software',
      description: 'CapCut Pro',
      amount: 500,
    });
    let snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    assert.equal(snap.kpis.gross_project_profit, 1800);
    assert.equal(snap.kpis.net_profit_after_expenses, 1300);
    assert.equal(snap.monthlySummary[0].net_cash_profit, 2500);

    deleteExpense(ctx.db, expId);
    snap = getWorkspaceSnapshot(ctx.db, '2027-01-10');
    assert.equal(snap.kpis.total_expenses, 0);
  } finally {
    cleanup(ctx);
  }
});

test('TC047: Reject invalid expense amount <= 0 and missing description', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    assert.throws(() => recordExpense(ctx.db, { description: 'X', amount: 0 }), /positive|greater than zero/i);
    assert.throws(() => recordExpense(ctx.db, { description: '', amount: 100 }), /required/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC048: Unassigned order automatically lands in Needs Attention queue', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, { client_name: 'UnCo', order_date: '2027-01-02', title: 'No Editor', amount: 500 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].production_status, 'Unassigned');
    assert.ok(snap.attention.unassigned.some((o) => o.id === id));
  } finally {
    cleanup(ctx);
  }
});

test('TC049: Assigning editor to Unassigned order auto-promotes status to Assigned', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const id = createOrder(ctx.db, { client_name: 'PromCo', order_date: '2027-01-02', title: 'Auto Stage', amount: 500 });
    updateOrder(ctx.db, id, { editor_name: 'Arjun', editor_cost: 200 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].production_status, 'Assigned');
  } finally {
    cleanup(ctx);
  }
});

test('TC050: Upsert editor updates specialty & default rates cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const eid = upsertEditor(ctx.db, { name: 'Ritu', specialty: 'Static Ads', default_rate_shorts: 500 });
    upsertEditor(ctx.db, { id: eid, name: 'Ritu', specialty: 'Motion & Static Ads', default_rate_shorts: 600 });
    const ed = getWorkspaceSnapshot(ctx.db, '2027-01-05').editors.find((x) => x.id === eid);
    assert.equal(ed.specialty, 'Motion & Static Ads');
    assert.equal(ed.default_rate_shorts, 600);
  } finally {
    cleanup(ctx);
  }
});

test('TC051: Prevent deleting non-existent order or deleting paid editor job', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    assert.throws(() => deleteOrder(ctx.db, 99999), /not found/i);
    const id = createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-02',
      title: 'PaidEd',
      amount: 1000,
      editor_name: 'Ed',
      editor_cost: 400,
      editor_work_submitted: true,
    });
    recordEditorPayout(ctx.db, { editor_name: 'Ed', amount: 400 });
    assert.throws(() => deleteOrder(ctx.db, id), /Cannot delete/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC052: Negative-margin order calculates negative profit and margin accurately', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'LossCo',
      order_date: '2027-01-03',
      title: 'Promo Bonus',
      amount: 0,
      editor_name: 'Ed',
      editor_cost: 150,
    });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].profit, -150);
    assert.equal(snap.kpis.gross_project_profit, -150);
  } finally {
    cleanup(ctx);
  }
});

test('TC053: Reject duplicate editor name collision on rename', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertEditor(ctx.db, { name: 'EdA' });
    const b = upsertEditor(ctx.db, { name: 'EdB' });
    assert.throws(() => upsertEditor(ctx.db, { id: b, name: 'EdA' }), /UNIQUE|already exists/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC054: Zero/negative editor payout throws clean validation error', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertEditor(ctx.db, { name: 'Ed' });
    assert.throws(() => recordEditorPayout(ctx.db, { editor_name: 'Ed', amount: 0 }), /greater than zero/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC055: Editor payout across non-existent editor ID or blank editor throws clear error', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    assert.throws(() => recordEditorPayout(ctx.db, { editor_id: 99999, amount: 500 }), /not found/i);
    assert.throws(() => recordEditorPayout(ctx.db, { editor_name: '', amount: 500 }), /required/i);
  } finally {
    cleanup(ctx);
  }
});

// ============================================================================
// 56..75: AI Smart Engine, Auto-Suggest, Self-Fulfill Packages & Reminders
// ============================================================================

test('TC056: Offline AI parses "got 30 static ads order for 10k" accurately (not payment)', () => {
  const ctx = makeFreshDb();
  try {
    const res = parseOfflineCommand(ctx.db, 'i got 30 static ads order for 10k');
    assert.equal(res.intent, 'order');
    assert.equal(res.drafts[0].category, 'Static Ads');
    assert.equal(res.drafts[0].quantity, 30);
    assert.equal(res.drafts[0].amount, 10000);
    assert.equal(res.drafts[0].unit_rate, 333.33);
  } finally {
    cleanup(ctx);
  }
});

test('TC057: Offline AI parses "got 30 static ads for 10k" without word "order" as order too', () => {
  const ctx = makeFreshDb();
  try {
    const res = parseOfflineCommand(ctx.db, 'got 30 static ads for 10k');
    assert.equal(res.intent, 'order');
    assert.equal(res.drafts[0].category, 'Static Ads');
    assert.equal(res.drafts[0].amount, 10000);
  } finally {
    cleanup(ctx);
  }
});

test('TC058: Self-fulfilling order strips "from" noise when creating package title', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertClient(ctx.db, { name: 'BlueWave' });
    const res = parseOfflineCommand(ctx.db, 'got 30 static ads order for 10k from BlueWave');
    assert.equal(res.drafts[0].client_name, 'BlueWave');
    assert.equal(res.drafts[0].title, '30 Static Ads');
  } finally {
    cleanup(ctx);
  }
});

test('TC059: Auto-suggest excludes owner_name when picking outsourced team editor', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    upsertEditor(ctx.db, { name: 'Owner', is_self: false });
    upsertEditor(ctx.db, { name: 'Tanya' });
    createOrder(ctx.db, {
      client_name: 'Client1',
      order_date: '2027-01-01',
      title: 'Script',
      category: 'Script Writing',
      amount: 500,
      editor_name: 'Owner',
      editor_cost: 0,
    });
    createOrder(ctx.db, {
      client_name: 'Client1',
      order_date: '2027-01-02',
      title: 'Ad',
      category: 'Static Ads',
      amount: 1000,
      editor_name: 'Tanya',
      editor_cost: 500,
    });
    const sugg = autoSuggestForOrder(ctx.db, { client_name: 'Client1', category: 'Static Ads', amount: 10000 });
    assert.equal(sugg.editor.name, 'Tanya');
    assert.equal(sugg.editor.suggestedCost, 5000);
  } finally {
    cleanup(ctx);
  }
});

test('TC060: Offline AI parses thumbnails & menu design & script categories', () => {
  const ctx = makeFreshDb();
  try {
    assert.equal(parseOfflineCommand(ctx.db, 'Bloom Care 5 thumbnails 1k').drafts[0].category, 'Thumbnails');
    assert.equal(parseOfflineCommand(ctx.db, 'Bloom Care menu design 2k').drafts[0].category, 'Menu Design');
    assert.equal(parseOfflineCommand(ctx.db, 'Bloom Care 3 scripts 900').drafts[0].category, 'Script Writing');
  } finally {
    cleanup(ctx);
  }
});

test('TC061: Offline AI parses "k" shorthand with decimals (e.g., 4.5k, ₹2,500)', () => {
  const ctx = makeFreshDb();
  try {
    const r1 = parseOfflineCommand(ctx.db, 'Bloom Care sent 4.5k');
    assert.equal(r1.drafts[0].amount, 4500);
    const r2 = parseOfflineCommand(ctx.db, 'Bloom Care sent ₹2,500 bank transfer');
    assert.equal(r2.drafts[0].amount, 2500);
    assert.equal(r2.drafts[0].method, 'Bank Transfer');
  } finally {
    cleanup(ctx);
  }
});

test('TC062: Offline AI parses multi-line batch orders cleanly', () => {
  const ctx = makeFreshDb();
  try {
    const res = parseOfflineCommand(
      ctx.db,
      'Nova Fitness needs:\n1) Intro reel 500\n2) Product showcase short 600\n3) Testimonial blog 400'
    );
    assert.equal(res.intent, 'batch_orders');
    assert.equal(res.drafts.length, 3);
    assert.equal(res.drafts[0].amount, 500);
    assert.equal(res.drafts[1].amount, 600);
    assert.equal(res.drafts[2].amount, 400);
  } finally {
    cleanup(ctx);
  }
});

test('TC063: Offline AI answers client balance questions', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'AlphaCo', order_date: '2027-01-02', title: 'Ad', amount: 1250 });
    const res = parseOfflineCommand(ctx.db, 'How much does AlphaCo owe?');
    assert.equal(res.intent, 'answer');
    assert.match(res.answer, /1,250/);
  } finally {
    cleanup(ctx);
  }
});

test('TC064: Offline AI answers editor payout questions', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'AlphaCo',
      order_date: '2027-01-02',
      title: 'Ad',
      amount: 1200,
      editor_name: 'Kabir',
      editor_cost: 650,
      editor_work_submitted: true,
    });
    const res = parseOfflineCommand(ctx.db, 'How much do I owe Kabir?');
    assert.equal(res.intent, 'answer');
    assert.match(res.answer, /650/);
  } finally {
    cleanup(ctx);
  }
});

test('TC065: Offline AI drafts expense command with category matching', () => {
  const ctx = makeFreshDb();
  try {
    const res = parseOfflineCommand(ctx.db, 'Adobe Creative Cloud subscription 1800');
    assert.equal(res.intent, 'expense');
    assert.equal(res.drafts[0].category, 'Software');
    assert.equal(res.drafts[0].amount, 1800);
  } finally {
    cleanup(ctx);
  }
});

test('TC066: Offline AI drafts explicit order update from SYN code', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'C', order_date: '2027-01-02', title: 'R', amount: 500 });
    const res = parseOfflineCommand(ctx.db, 'SYN0001 delivered submitted');
    assert.equal(res.intent, 'order_update');
    assert.equal(res.drafts[0].patch.production_status, 'Delivered');
    assert.equal(res.drafts[0].patch.editor_work_submitted, true);
  } finally {
    cleanup(ctx);
  }
});

test('TC067: Empty AI command throws user-friendly validation error', () => {
  const ctx = makeFreshDb();
  try {
    assert.throws(() => parseOfflineCommand(ctx.db, '   '), /enter a command/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC068: Relative dates ("today", "tomorrow", "next week", "in 4 days") resolve cleanly', () => {
  const ctx = makeFreshDb();
  try {
    const r = parseOfflineCommand(ctx.db, 'Bloom Care new short due in 4 days');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.drafts[0].production_deadline));
  } finally {
    cleanup(ctx);
  }
});

test('TC069: Client reminder formats unpaid orders, rate pending, and advance credit cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const cid = upsertClient(ctx.db, { name: 'RemCo' });
    createOrder(ctx.db, { client_name: 'RemCo', order_date: '2027-01-02', title: 'Reel 1', amount: 700 });
    createOrder(ctx.db, { client_name: 'RemCo', order_date: '2027-01-03', title: 'Reel 2' });
    const rem = generateClientReminder(ctx.db, cid);
    assert.match(rem.message, /SYN0001/);
    assert.match(rem.message, /Rate Pending/);
    assert.ok(rem.waUrl.startsWith('https://wa.me/?text='));
  } finally {
    cleanup(ctx);
  }
});

test('TC070: Order-level auto reminder builds WhatsApp link cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const oid = createOrder(ctx.db, { client_name: 'OrdRem', order_date: '2027-01-02', title: 'Static Ad', amount: 450 });
    const rem = generateAutoReminder(ctx.db, { orderId: oid });
    assert.equal(rem.ok, true);
    assert.match(rem.reminderText, /SYN0001/);
    assert.match(rem.reminderText, /450/);
  } finally {
    cleanup(ctx);
  }
});

test('TC071: Auto-suggest falls back cleanly on brand new workspace with zero orders', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const sugg = autoSuggestForOrder(ctx.db, { category: 'Static Ads', amount: 10000, quantity: 30 });
    assert.equal(sugg.editor, null);
    assert.equal(sugg.deadline.days, 10);
  } finally {
    cleanup(ctx);
  }
});

test('TC072: Offline AI "Who owes me money?" handles empty receivables cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const res = parseOfflineCommand(ctx.db, 'Who owes me money?');
    assert.equal(res.intent, 'answer');
    assert.match(res.answer, /fully paid/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC073: Offline AI "attention status" summarizes workspace counts cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'AttCo', order_date: '2027-01-01', title: 'Open', amount: 300 });
    const res = parseOfflineCommand(ctx.db, 'Show attention alerts');
    assert.match(res.answer, /Unassigned Editors: 1/);
  } finally {
    cleanup(ctx);
  }
});

test('TC074: Offline AI detects editor payout draft cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'C',
      order_date: '2027-01-02',
      title: 'Clip',
      amount: 1000,
      editor_name: 'Rohan',
      editor_cost: 400,
      editor_work_submitted: true,
    });
    const res = parseOfflineCommand(ctx.db, 'Pay Rohan 400');
    assert.equal(res.intent, 'editor_payout');
    assert.equal(res.drafts[0].editor_name, 'Rohan');
    assert.equal(res.drafts[0].amount, 400);
  } finally {
    cleanup(ctx);
  }
});

test('TC075: Offline AI asks clarify when payer amount specified but client unknown', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const res = parseOfflineCommand(ctx.db, 'UnknownClient sent 3000 UPI');
    assert.equal(res.intent, 'client_payment');
    assert.equal(res.drafts[0].client_id, null);
    assert.ok(res.warnings.some((w) => /Could not identify/i.test(w)));
  } finally {
    cleanup(ctx);
  }
});

// ============================================================================
// 76..90: CSV & Multi-Section Spreadsheet Importer Edge Cases
// ============================================================================

test('TC076: Single-table CSV import adds Jan 2027 micro-orders cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Order Code,Order Date,Client Name,Title / Topic,Category,Order Amount (INR),Client Payment Status,Editor Name,Editor Cost (INR)',
      'SYN0001,2027-01-02,Acme Co,Daily Post,Instagram Posts,200,Completed,Maya,80',
      'SYN0002,2027-01-03,Acme Co,Reel #2,Shorts,350,Unpaid,Maya,150',
    ].join('\n');
    const res = importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    assert.equal(res.inserted, 2);
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.kpis.total_billed, 550);
    assert.equal(snap.kpis.total_collected, 200);
    assert.equal(snap.kpis.total_receivable, 350);
  } finally {
    cleanup(ctx);
  }
});

test('TC077: Two-pass client normalization merges prefix client name seen before full name', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status',
      'SYN0001,2027-01-01,Orbit,Shorts,500,Completed',
      'SYN0002,2027-01-02,Orbit Media,Shorts,700,Completed',
    ].join('\n');
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.clients.length, 1);
    assert.equal(snap.clients[0].name, 'Orbit Media');
  } finally {
    cleanup(ctx);
  }
});

test('TC078: Excel serial date numbers convert cleanly to YYYY-MM-DD during CSV import', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    // 46388 in Excel serial days = 2027-01-01
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status',
      'SYN0001,46388,SerialCo,Shorts,500,Completed',
    ].join('\n');
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].order_date, '2027-01-01');
  } finally {
    cleanup(ctx);
  }
});

test('TC079: Blank pre-numbered spreadsheet template rows and Total lines are skipped', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status',
      'SYN0001,2027-01-01,CleanCo,Shorts,500,Completed',
      'SYN0002,,,,,',
      'Total:,500,,,,',
    ].join('\n');
    const prev = previewSpreadsheetCsv(ctx.db, csv);
    assert.equal(prev.orderCount, 1);
  } finally {
    cleanup(ctx);
  }
});

test('TC080: Empty/unrecognized CSV throws helpful error', () => {
  const ctx = makeFreshDb();
  try {
    assert.throws(() => importSpreadsheetCsv(ctx.db, 'foo,bar\n1,2'), /No recognizable/i);
  } finally {
    cleanup(ctx);
  }
});

test('TC081: Multi-section CSV with yearly baseline preserves baseline only for years without orders', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status',
      'SYN0001,2027-01-05,FreshCo,Shorts,1000,Completed',
      '',
      'Yearly,Total Amount Received,Total Amount Paid,Total Profit',
      '2026,50000,25000,25000',
      '2027,1000,400,600',
    ].join('\n');
    const prev = previewSpreadsheetCsv(ctx.db, csv);
    assert.deepEqual(prev.baselineYears, [2026]);
  } finally {
    cleanup(ctx);
  }
});

test('TC082: Re-importing CSV in upsert mode never duplicates payments', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status',
      'SYN0001,2027-01-02,IdemCo,Shorts,900,Completed',
    ].join('\n');
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.kpis.total_billed, 900);
    assert.equal(snap.kpis.total_collected, 900);
    assert.equal(snap.payments.length, 1);
  } finally {
    cleanup(ctx);
  }
});

test('TC083: Quoted CSV cells with commas and currency symbols parse cleanly', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status,Notes',
      'SYN0001,2027-01-02,"Studio, Inc.",Shorts,"₹1,250",Completed,"Deliver ""final"" cut"',
    ].join('\n');
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].client_name, 'Studio, Inc.');
    assert.equal(snap.orders[0].amount, 1250);
    assert.match(snap.orders[0].notes, /Deliver "final" cut/);
  } finally {
    cleanup(ctx);
  }
});

test('TC084: CSV export includes all required ledger columns and escapes quotes', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, {
      client_name: 'QCo',
      order_date: '2027-01-02',
      title: 'Quote "Reel"',
      category: 'Shorts',
      amount: 800,
    });
    const csv = exportOrdersCsv(ctx.db);
    assert.match(csv, /Project ID,Order Date,Client Name/);
    assert.match(csv, /"Quote ""Reel"""/);
  } finally {
    cleanup(ctx);
  }
});

test('TC085: Multi-section CSV merges separate Client Income and Editor Payout sections by Project ID', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Project ID,Order date,Client Name,Project Description,Amount Received,Payment Status',
      'SYN0001,2027-01-02,MergeCo,Shorts,1000,Completed',
      '',
      'Project ID,Order date,Editor Name,Project Description,Amount Paid,Payment Status',
      'SYN0001,2027-01-02,Ayaan,Shorts,450,Completed',
    ].join('\n');
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].client_name, 'MergeCo');
    assert.equal(snap.orders[0].editor_name, 'Ayaan');
    assert.equal(snap.orders[0].editor_cost, 450);
    assert.equal(snap.orders[0].profit, 550);
  } finally {
    cleanup(ctx);
  }
});

test('TC086: Auto-generated IMP code assigns safely when Project ID is omitted in CSV', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    const csv = [
      'Order Date,Client Name,Title,Amount,Client Payment Status',
      '2027-01-05,NoCodeCo,Micro Edit,250,Completed',
    ].join('\n');
    importSpreadsheetCsv(ctx.db, csv, { mode: 'upsert' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].order_code, 'IMP0001');
  } finally {
    cleanup(ctx);
  }
});

test('TC087: Replace mode clears prior orders cleanly before importing fresh CSV', () => {
  const ctx = makeFreshDb();
  try {
    createOrder(ctx.db, { client_name: 'OldCo', order_date: '2026-12-31', title: 'Old', amount: 999 });
    const csv = 'Order Code,Order Date,Client Name,Title,Amount\nSYN0001,2027-01-01,NewCo,New,300';
    importSpreadsheetCsv(ctx.db, csv, { mode: 'replace' });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-01');
    assert.equal(snap.orders.length, 1);
    assert.equal(snap.orders[0].client_name, 'NewCo');
  } finally {
    cleanup(ctx);
  }
});

test('TC088: Preview CSV counts inserts vs updates accurately against existing orders', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { order_code: 'SYN0001', client_name: 'A', order_date: '2027-01-01', title: 'X', amount: 100 });
    const csv = [
      'Order Code,Order Date,Client Name,Title,Amount',
      'SYN0001,2027-01-01,A,X,200',
      'SYN0002,2027-01-02,B,Y,300',
    ].join('\n');
    const prev = previewSpreadsheetCsv(ctx.db, csv);
    assert.equal(prev.insertCount, 1);
    assert.equal(prev.updateCount, 1);
  } finally {
    cleanup(ctx);
  }
});

test('TC089: Upsert CSV updates amount from TBD to priced and allocates payment when newly Completed', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    importSpreadsheetCsv(ctx.db, 'Order Code,Order Date,Client Name,Title,Amount,Client Payment Status\nSYN0001,2027-01-01,UpCo,T,,Rate Pending');
    importSpreadsheetCsv(ctx.db, 'Order Code,Order Date,Client Name,Title,Amount,Client Payment Status\nSYN0001,2027-01-01,UpCo,T,700,Completed');
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.orders[0].payment_status, 'Paid');
    assert.equal(snap.kpis.total_collected, 700);
  } finally {
    cleanup(ctx);
  }
});

test('TC090: Multi-year CSV handles December 2026 & January 2027 orders separately in monthlySummary', () => {
  const ctx = makeFreshDb({ keepClientsAndEditors: false });
  try {
    createOrder(ctx.db, { client_name: 'C', order_date: '2026-12-28', title: 'Dec', amount: 400 });
    createOrder(ctx.db, { client_name: 'C', order_date: '2027-01-02', title: 'Jan', amount: 600 });
    const snap = getWorkspaceSnapshot(ctx.db, '2027-01-05');
    assert.equal(snap.monthlySummary.length, 2);
    assert.equal(snap.yearlySummary.length, 2);
  } finally {
    cleanup(ctx);
  }
});

// ============================================================================
// 91..100: HTTP Server, Auth Security, Start-Fresh API & Auto-Execute
// ============================================================================

async function withTestServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editdesk-http100-'));
  const dbPath = path.join(dir, 'http.db');
  const { app, db } = createApp({ dbPath });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseUrl, db });
  } finally {
    server.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('TC091: Remote GET /api/health succeeds without PIN while /api/workspace requires auth', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const h = await fetch(`${baseUrl}/api/health`, { headers: { 'x-editdesk-remote-test': '1' } });
    assert.equal(h.status, 200);
    const w = await fetch(`${baseUrl}/api/workspace`, { headers: { 'x-editdesk-remote-test': '1' } });
    assert.equal(w.status, 401);
  });
});

test('TC092: Wrong PIN returns 401 on /api/auth/pin', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '0000' }),
    });
    assert.equal(r.status, 401);
  });
});

test('TC093: Tampered bearer token is rejected cleanly with 401', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/workspace`, {
      headers: { 'x-editdesk-remote-test': '1', Authorization: 'Bearer 2026:99999.badsignature' },
    });
    assert.equal(r.status, 401);
  });
});

test('TC094: Remote /api/mobile-info masks owner PIN instead of leaking plaintext', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const pinResp = await fetch(`${baseUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2026' }),
    });
    const { token } = await pinResp.json();
    const m = await (
      await fetch(`${baseUrl}/api/mobile-info`, {
        headers: { 'x-editdesk-remote-test': '1', Authorization: `Bearer ${token}` },
      })
    ).json();
    assert.equal(m.mobilePin, '••••');
  });
});

test('TC095: POST /api/system/start-fresh clears orders & keeps client/editor list cleanly', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/system/start-fresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepClientsAndEditors: true }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.snapshot.orders.length, 0);
    assert.ok(json.snapshot.clients.length > 0);
  });
});

test('TC096: POST /api/system/start-fresh with keepClientsAndEditors=false clears entire roster', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/system/start-fresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepClientsAndEditors: false }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.snapshot.orders.length, 0);
    assert.equal(json.snapshot.clients.length, 0);
    assert.equal(json.snapshot.editors.length, 0);
  });
});

test('TC097: PATCH /api/settings persists cloud sync & AI flags without leaking secret values', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ai_provider: 'auto',
        openrouter_api_key: 'sk-or-secret-xyz',
        cloud_url: 'https://example.netlify.app',
        cloud_pin: '9876',
        cloud_sync_enabled: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.snapshot.settings.has_openrouter_key, true);
    assert.equal(body.snapshot.settings.has_cloud_pin, true);
    assert.equal(JSON.stringify(body).includes('sk-or-secret-xyz'), false);
    assert.equal(JSON.stringify(body).includes('9876'), false);
  });
});

test('TC098: POST /api/ai/command autoExecute=true creates client payment directly when clear', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/ai/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Bloom Care sent 5000 UPI', autoExecute: true }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.autoExecuted, true);
    assert.equal(json.snapshot.clients.find((c) => c.name === 'Bloom Care').outstanding_due, 0);
  });
});

test('TC099: POST /api/ai/command autoExecute=true refuses to auto-save when client is missing', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const before = await (await fetch(`${baseUrl}/api/workspace`)).json();
    const res = await fetch(`${baseUrl}/api/ai/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'got 30 static ads order for 10k', autoExecute: true }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.notEqual(json.autoExecuted, true);
    const after = await (await fetch(`${baseUrl}/api/workspace`)).json();
    assert.equal(after.orders.length, before.orders.length);
  });
});

test('TC100: GET /api/export/backup.json returns valid full workspace backup snapshot', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/export/backup.json`);
    assert.equal(res.status, 200);
    const backup = await res.json();
    assert.ok(backup.kpis);
    assert.ok(Array.isArray(backup.orders));
    assert.ok(Array.isArray(backup.clients));
    assert.ok(Array.isArray(backup.editors));
  });
});
