import { withTransaction } from './db.mjs';

export const PRODUCTION_STAGES = [
  'New',
  'Unassigned',
  'Assigned',
  'Editing',
  'Internal review',
  'Client review',
  'Revisions',
  'Approved',
  'Delivered',
];

export const ORDER_CATEGORIES = [
  'Shorts',
  'Video Edit',
  'Script Writing',
  'Website Blogs',
  'Instagram Posts',
  'Menu Design',
  'Other',
];

export const EXPENSE_CATEGORIES = ['Software', 'Tools', 'Marketing', 'Equipment', 'Other'];

export function round2(val) {
  const n = Number(val || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function localTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getSettingMap(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

export function logActivity(db, eventType, summary, entityType = null, entityId = null) {
  db.prepare(
    `INSERT INTO activity_log (event_type, summary, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(eventType, summary, entityType ?? null, entityId ?? null, new Date().toISOString());
}

export function getNextOrderCode(db, prefix = 'SYN') {
  const rows = db.prepare('SELECT order_code FROM orders').all();
  let maxNum = 0;
  const rx = new RegExp(`^${prefix}(\\d+)$`, 'i');
  for (const r of rows) {
    const m = String(r.order_code || '').match(rx);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

function computeOrderDerived(row, clientAllocMap, editorAllocMap) {
  const allocatedPaid = round2(clientAllocMap.get(row.id) || 0);
  const amount = row.amount != null ? round2(row.amount) : null;
  let paymentStatus = 'Unpaid';
  let balanceDue = 0;

  if (amount === null) {
    paymentStatus = 'Rate Pending';
    balanceDue = 0;
  } else if (amount <= 0) {
    paymentStatus = 'Zero / Bundled';
    balanceDue = 0;
  } else if (allocatedPaid <= 0) {
    paymentStatus = 'Unpaid';
    balanceDue = amount;
  } else if (allocatedPaid + 0.009 < amount) {
    paymentStatus = 'Partially paid';
    balanceDue = round2(amount - allocatedPaid);
  } else {
    paymentStatus = 'Paid';
    balanceDue = 0;
  }

  const editorCost = round2(row.editor_cost || 0);
  const editorSubmitted = Boolean(row.editor_work_submitted);
  const editorPayable = editorSubmitted ? editorCost : 0;
  const editorAllocated = round2(editorAllocMap.get(row.id) || 0);
  const editorBalanceDue = Math.max(0, round2(editorPayable - editorAllocated));

  let editorPayoutStatus = 'Unpaid';
  if (!row.editor_id) {
    editorPayoutStatus = 'No Editor';
  } else if (editorCost <= 0) {
    editorPayoutStatus = 'Zero Cost';
  } else if (!editorSubmitted) {
    editorPayoutStatus = 'Awaiting Submission';
  } else if (editorAllocated <= 0) {
    editorPayoutStatus = 'Unpaid';
  } else if (editorAllocated + 0.009 < editorPayable) {
    editorPayoutStatus = 'Partially paid';
  } else {
    editorPayoutStatus = 'Paid';
  }

  const revenueForMargin = amount ?? 0;
  const profit = round2(revenueForMargin - editorCost);
  const profitPct = revenueForMargin > 0 ? round2((profit / revenueForMargin) * 100) : 0;

  return {
    ...row,
    amount,
    editor_cost: editorCost,
    editor_work_submitted: editorSubmitted,
    needs_review: Boolean(row.needs_review),
    allocated_paid: allocatedPaid,
    balance_due: balanceDue,
    payment_status: paymentStatus,
    editor_payable: editorPayable,
    editor_allocated: editorAllocated,
    editor_balance_due: editorBalanceDue,
    editor_payout_status: editorPayoutStatus,
    profit,
    profit_pct: profitPct,
  };
}

export function getWorkspaceSnapshot(db, todayStr = localTodayIso()) {
  const settingsRaw = getSettingMap(db);
  const clientRows = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE ASC').all();
  const editorRows = db.prepare('SELECT * FROM editors ORDER BY is_self DESC, name COLLATE NOCASE ASC').all();
  const orderRows = db
    .prepare(
      `SELECT o.*, c.name AS client_name, e.name AS editor_name, COALESCE(e.is_self, 0) AS editor_is_self
       FROM orders o
       JOIN clients c ON c.id = o.client_id
       LEFT JOIN editors e ON e.id = o.editor_id
       ORDER BY o.order_date DESC, o.id DESC`
    )
    .all();

  const paymentRows = db
    .prepare(
      `SELECT p.*, c.name AS client_name
       FROM client_payments p
       JOIN clients c ON c.id = p.client_id
       ORDER BY p.payment_date DESC, p.id DESC`
    )
    .all();

  const paymentAllocRows = db
    .prepare(
      `SELECT pa.*, o.order_code, o.title AS order_title
       FROM payment_allocations pa
       JOIN orders o ON o.id = pa.order_id
       ORDER BY pa.id ASC`
    )
    .all();

  const payoutRows = db
    .prepare(
      `SELECT ep.*, e.name AS editor_name
       FROM editor_payouts ep
       JOIN editors e ON e.id = ep.editor_id
       ORDER BY ep.payout_date DESC, ep.id DESC`
    )
    .all();

  const payoutAllocRows = db
    .prepare(
      `SELECT epa.*, o.order_code, o.title AS order_title
       FROM editor_payout_allocations epa
       JOIN orders o ON o.id = epa.order_id
       ORDER BY epa.id ASC`
    )
    .all();

  const expenseRows = db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC').all();
  const baselineRows = db.prepare('SELECT * FROM yearly_baselines ORDER BY year ASC').all();
  const activityRows = db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 40').all();

  const clientAllocByOrder = new Map();
  const allocsByPayment = new Map();
  for (const a of paymentAllocRows) {
    clientAllocByOrder.set(a.order_id, round2((clientAllocByOrder.get(a.order_id) || 0) + a.amount));
    if (!allocsByPayment.has(a.payment_id)) allocsByPayment.set(a.payment_id, []);
    allocsByPayment.get(a.payment_id).push(a);
  }

  const editorAllocByOrder = new Map();
  const allocsByPayout = new Map();
  for (const a of payoutAllocRows) {
    editorAllocByOrder.set(a.order_id, round2((editorAllocByOrder.get(a.order_id) || 0) + a.amount));
    if (!allocsByPayout.has(a.payout_id)) allocsByPayout.set(a.payout_id, []);
    allocsByPayout.get(a.payout_id).push(a);
  }

  const orders = orderRows.map((r) => computeOrderDerived(r, clientAllocByOrder, editorAllocByOrder));

  const payments = paymentRows.map((p) => {
    const allocs = allocsByPayment.get(p.id) || [];
    const allocatedAmount = round2(allocs.reduce((s, a) => s + a.amount, 0));
    const unallocatedAmount = Math.max(0, round2(p.amount - allocatedAmount));
    return {
      ...p,
      amount: round2(p.amount),
      allocated_amount: allocatedAmount,
      unallocated_amount: unallocatedAmount,
      allocations: allocs,
    };
  });

  const editorPayouts = payoutRows.map((p) => {
    const allocs = allocsByPayout.get(p.id) || [];
    const allocatedAmount = round2(allocs.reduce((s, a) => s + a.amount, 0));
    const unallocatedAmount = Math.max(0, round2(p.amount - allocatedAmount));
    return {
      ...p,
      amount: round2(p.amount),
      allocated_amount: allocatedAmount,
      unallocated_amount: unallocatedAmount,
      allocations: allocs,
    };
  });

  // Client summaries
  const clients = clientRows.map((c) => {
    const cOrders = orders.filter((o) => o.client_id === c.id);
    const cPayments = payments.filter((p) => p.client_id === c.id);
    const totalBilled = round2(cOrders.reduce((s, o) => s + (o.amount || 0), 0));
    const totalReceived = round2(cPayments.reduce((s, p) => s + p.amount, 0));
    const totalAllocated = round2(cPayments.reduce((s, p) => s + p.allocated_amount, 0));
    const outstandingDue = round2(cOrders.reduce((s, o) => s + o.balance_due, 0));
    const unallocatedAdvance = round2(cPayments.reduce((s, p) => s + p.unallocated_amount, 0));
    const editorCostTotal = round2(cOrders.reduce((s, o) => s + o.editor_cost, 0));
    const profit = round2(totalBilled - editorCostTotal);
    const activeOrders = cOrders.filter((o) => o.production_status !== 'Delivered').length;
    const ratePendingCount = cOrders.filter((o) => o.amount === null).length;

    return {
      ...c,
      order_count: cOrders.length,
      active_orders: activeOrders,
      rate_pending_count: ratePendingCount,
      total_billed: totalBilled,
      total_received: totalReceived,
      total_allocated: totalAllocated,
      outstanding_due: outstandingDue,
      unallocated_advance: unallocatedAdvance,
      profit,
    };
  });

  // Editor summaries
  const editors = editorRows.map((e) => {
    const eOrders = orders.filter((o) => o.editor_id === e.id);
    const ePayouts = editorPayouts.filter((p) => p.editor_id === e.id);
    const totalAssignedCost = round2(eOrders.reduce((s, o) => s + o.editor_cost, 0));
    const submittedPayable = round2(eOrders.reduce((s, o) => s + o.editor_payable, 0));
    const totalPaid = round2(ePayouts.reduce((s, p) => s + p.amount, 0));
    const totalAllocated = round2(ePayouts.reduce((s, p) => s + p.allocated_amount, 0));
    const payoutDue = round2(eOrders.reduce((s, o) => s + o.editor_balance_due, 0));
    const unallocatedAdvance = round2(ePayouts.reduce((s, p) => s + p.unallocated_amount, 0));
    const activeAssignments = eOrders.filter((o) => o.production_status !== 'Delivered').length;
    const submittedCount = eOrders.filter((o) => o.editor_work_submitted).length;

    return {
      ...e,
      is_self: Boolean(e.is_self),
      order_count: eOrders.length,
      active_assignments: activeAssignments,
      submitted_count: submittedCount,
      total_assigned_cost: totalAssignedCost,
      submitted_payable: submittedPayable,
      total_paid: totalPaid,
      total_allocated: totalAllocated,
      payout_due: payoutDue,
      unallocated_advance: unallocatedAdvance,
    };
  });

  // Monthly & Yearly P&L (Project Accrual + Cash Flow)
  const monthlyMap = new Map();
  const ensureMonth = (ym) => {
    if (!monthlyMap.has(ym)) {
      monthlyMap.set(ym, {
        month: ym,
        order_count: 0,
        project_billed: 0,
        editor_cost_committed: 0,
        project_profit: 0,
        profit_pct: 0,
        cash_received: 0,
        cash_paid_editors: 0,
        operating_expenses: 0,
        net_cash_profit: 0,
      });
    }
    return monthlyMap.get(ym);
  };

  for (const o of orders) {
    const ym = String(o.order_date).slice(0, 7);
    const m = ensureMonth(ym);
    m.order_count += 1;
    m.project_billed = round2(m.project_billed + (o.amount || 0));
    m.editor_cost_committed = round2(m.editor_cost_committed + o.editor_cost);
  }
  for (const p of payments) {
    const ym = String(p.payment_date).slice(0, 7);
    const m = ensureMonth(ym);
    m.cash_received = round2(m.cash_received + p.amount);
  }
  for (const p of editorPayouts) {
    const ym = String(p.payout_date).slice(0, 7);
    const m = ensureMonth(ym);
    m.cash_paid_editors = round2(m.cash_paid_editors + p.amount);
  }
  for (const ex of expenseRows) {
    const ym = String(ex.expense_date).slice(0, 7);
    const m = ensureMonth(ym);
    m.operating_expenses = round2(m.operating_expenses + ex.amount);
  }

  const monthlySummary = Array.from(monthlyMap.values())
    .map((m) => {
      const projectProfit = round2(m.project_billed - m.editor_cost_committed);
      const profitPct = m.project_billed > 0 ? round2((projectProfit / m.project_billed) * 100) : 0;
      const netCashProfit = round2(m.cash_received - m.cash_paid_editors - m.operating_expenses);
      return {
        ...m,
        project_profit: projectProfit,
        profit_pct: profitPct,
        net_cash_profit: netCashProfit,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));

  // Yearly summary combining baselines + live ledger years
  const yearlyMap = new Map();
  for (const b of baselineRows) {
    yearlyMap.set(String(b.year), {
      year: String(b.year),
      is_baseline: true,
      order_count: 0,
      project_billed: round2(b.total_received),
      editor_cost_committed: round2(b.total_paid),
      project_profit: round2(b.total_profit),
      profit_pct: b.total_received > 0 ? round2((b.total_profit / b.total_received) * 100) : 0,
      cash_received: round2(b.total_received),
      cash_paid_editors: round2(b.total_paid),
      operating_expenses: 0,
      net_cash_profit: round2(b.total_profit),
      notes: b.notes,
    });
  }
  for (const m of monthlySummary) {
    const yr = m.month.slice(0, 4);
    if (!yearlyMap.has(yr)) {
      yearlyMap.set(yr, {
        year: yr,
        is_baseline: false,
        order_count: 0,
        project_billed: 0,
        editor_cost_committed: 0,
        project_profit: 0,
        profit_pct: 0,
        cash_received: 0,
        cash_paid_editors: 0,
        operating_expenses: 0,
        net_cash_profit: 0,
        notes: '',
      });
    }
    const y = yearlyMap.get(yr);
    if (y.is_baseline) continue;
    y.order_count += m.order_count;
    y.project_billed = round2(y.project_billed + m.project_billed);
    y.editor_cost_committed = round2(y.editor_cost_committed + m.editor_cost_committed);
    y.cash_received = round2(y.cash_received + m.cash_received);
    y.cash_paid_editors = round2(y.cash_paid_editors + m.cash_paid_editors);
    y.operating_expenses = round2(y.operating_expenses + m.operating_expenses);
  }
  const yearlySummary = Array.from(yearlyMap.values())
    .map((y) => {
      if (y.is_baseline) return y;
      const projectProfit = round2(y.project_billed - y.editor_cost_committed);
      const profitPct = y.project_billed > 0 ? round2((projectProfit / y.project_billed) * 100) : 0;
      const netCashProfit = round2(y.cash_received - y.cash_paid_editors - y.operating_expenses);
      return {
        ...y,
        project_profit: projectProfit,
        profit_pct: profitPct,
        net_cash_profit: netCashProfit,
      };
    })
    .sort((a, b) => b.year.localeCompare(a.year));

  // Service category breakdown
  const categoryMap = new Map();
  for (const o of orders) {
    const key = o.category || 'Other';
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { category: key, orders: 0, billed: 0, editor_cost: 0, profit: 0, profit_pct: 0 });
    }
    const c = categoryMap.get(key);
    c.orders += 1;
    c.billed = round2(c.billed + (o.amount || 0));
    c.editor_cost = round2(c.editor_cost + o.editor_cost);
    c.profit = round2(c.billed - c.editor_cost);
    c.profit_pct = c.billed > 0 ? round2((c.profit / c.billed) * 100) : 0;
  }
  const categoryBreakdown = Array.from(categoryMap.values()).sort((a, b) => b.billed - a.billed);

  // Attention Radar (strictly keeping production deadlines separate from invoice due dates)
  const plus3 = addDaysIso(todayStr, 3);
  const plus7 = addDaysIso(todayStr, 7);

  const attention = {
    unassigned: orders.filter((o) => !o.editor_id),
    needsReview: orders.filter((o) => o.needs_review || o.amount === null || (o.amount === 0 && o.editor_cost > 0)),
    overdueProduction: orders.filter(
      (o) => o.production_deadline && o.production_deadline < todayStr && o.production_status !== 'Delivered'
    ),
    upcomingProduction: orders.filter(
      (o) =>
        o.production_deadline &&
        o.production_deadline >= todayStr &&
        o.production_deadline <= plus3 &&
        o.production_status !== 'Delivered'
    ),
    overdueInvoices: orders.filter(
      (o) => o.payment_due_date && o.payment_due_date < todayStr && o.balance_due > 0
    ),
    upcomingInvoices: orders.filter(
      (o) =>
        o.payment_due_date &&
        o.payment_due_date >= todayStr &&
        o.payment_due_date <= plus7 &&
        o.balance_due > 0
    ),
    submittedUnpaidEditors: orders.filter((o) => o.editor_work_submitted && o.editor_balance_due > 0),
    unallocatedClientAdvances: clients.filter((c) => c.unallocated_advance > 0.01),
    unallocatedEditorAdvances: editors.filter((e) => e.unallocated_advance > 0.01),
  };

  // Global KPIs
  const totalBilled = round2(orders.reduce((s, o) => s + (o.amount || 0), 0));
  const totalCollected = round2(payments.reduce((s, p) => s + p.amount, 0));
  const totalReceivable = round2(orders.reduce((s, o) => s + o.balance_due, 0));
  const unallocatedClientAdvances = round2(clients.reduce((s, c) => s + c.unallocated_advance, 0));
  const totalEditorCommitted = round2(orders.reduce((s, o) => s + o.editor_cost, 0));
  const totalEditorPaid = round2(editorPayouts.reduce((s, p) => s + p.amount, 0));
  const totalEditorDue = round2(editors.reduce((s, e) => s + e.payout_due, 0));
  const totalExpenses = round2(expenseRows.reduce((s, ex) => s + ex.amount, 0));
  const grossProjectProfit = round2(totalBilled - totalEditorCommitted);
  const grossMarginPct = totalBilled > 0 ? round2((grossProjectProfit / totalBilled) * 100) : 0;
  const netProfitAfterExpenses = round2(grossProjectProfit - totalExpenses);
  const activeOrdersCount = orders.filter((o) => o.production_status !== 'Delivered').length;
  const deliveredCount = orders.filter((o) => o.production_status === 'Delivered').length;

  const currentYm = todayStr.slice(0, 7);
  const currentMonth = monthlySummary.find((m) => m.month === currentYm) || {
    month: currentYm,
    order_count: 0,
    project_billed: 0,
    editor_cost_committed: 0,
    project_profit: 0,
    profit_pct: 0,
    cash_received: 0,
    cash_paid_editors: 0,
    operating_expenses: 0,
    net_cash_profit: 0,
  };

  const kpis = {
    today: todayStr,
    total_orders: orders.length,
    active_orders: activeOrdersCount,
    delivered_orders: deliveredCount,
    total_billed: totalBilled,
    total_collected: totalCollected,
    total_receivable: totalReceivable,
    unallocated_client_advances: unallocatedClientAdvances,
    total_editor_committed: totalEditorCommitted,
    total_editor_paid: totalEditorPaid,
    total_editor_due: totalEditorDue,
    total_expenses: totalExpenses,
    gross_project_profit: grossProjectProfit,
    gross_margin_pct: grossMarginPct,
    net_profit_after_expenses: netProfitAfterExpenses,
    current_month: currentMonth,
  };

  const safeSettings = {
    agency_name: settingsRaw.agency_name || 'EditDesk Studio',
    owner_name: settingsRaw.owner_name || 'Owner',
    currency: settingsRaw.currency || 'INR',
    order_prefix: settingsRaw.order_prefix || 'SYN',
    pin_enabled: settingsRaw.pin_enabled === '1',
    mobile_pin: settingsRaw.mobile_pin || '2026',
    ai_provider: settingsRaw.ai_provider || 'offline',
    ai_model: settingsRaw.ai_model || 'gemini-2.5-flash',
    has_ai_key: Boolean(settingsRaw.ai_api_key && settingsRaw.ai_api_key.trim().length > 0),
    minimize_to_tray: settingsRaw.minimize_to_tray !== '0',
    port: Number(settingsRaw.port || 4747),
  };

  return {
    kpis,
    orders,
    clients,
    editors,
    payments,
    editorPayouts,
    expenses: expenseRows.map((x) => ({ ...x, amount: round2(x.amount) })),
    monthlySummary,
    yearlySummary,
    categoryBreakdown,
    attention,
    recentActivity: activityRows,
    settings: safeSettings,
  };
}

export function resolveOrCreateClient(db, { client_id, client_name }) {
  if (client_id) {
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(client_id));
    if (!existing) throw new Error('Client not found');
    return existing;
  }
  const cleanName = String(client_name || '').trim();
  if (!cleanName) throw new Error('Client name is required');

  const all = db.prepare('SELECT * FROM clients').all();
  const lower = cleanName.toLowerCase();
  for (const c of all) {
    if (c.name.toLowerCase() === lower) return c;
    const aliases = (c.aliases || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (aliases.includes(lower)) return c;
  }

  const now = new Date().toISOString();
  const res = db
    .prepare(`INSERT INTO clients (name, aliases, created_at) VALUES (?, '', ?)`)
    .run(cleanName, now);
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(res.lastInsertRowid));
}

export function resolveEditor(db, { editor_id, editor_name }) {
  if (editor_id) {
    const existing = db.prepare('SELECT * FROM editors WHERE id = ?').get(Number(editor_id));
    if (!existing) throw new Error('Editor not found');
    return existing;
  }
  const cleanName = String(editor_name || '').trim();
  if (!cleanName) return null;

  const existing = db.prepare('SELECT * FROM editors WHERE lower(name) = lower(?)').get(cleanName);
  if (existing) return existing;

  const now = new Date().toISOString();
  const isSelf = cleanName.toLowerCase() === 'owner' || cleanName.toLowerCase() === 'self' ? 1 : 0;
  const res = db
    .prepare(`INSERT INTO editors (name, is_self, specialty, created_at) VALUES (?, ?, 'Editing & Production', ?)`)
    .run(cleanName, isSelf, now);
  return db.prepare('SELECT * FROM editors WHERE id = ?').get(Number(res.lastInsertRowid));
}

export function createOrder(db, input) {
  return withTransaction(db, () => {
    const settings = getSettingMap(db);
    const prefix = settings.order_prefix || 'SYN';
    const client = resolveOrCreateClient(db, input);
    const editor = resolveEditor(db, input);

    const now = new Date().toISOString();
    const orderCode = (input.order_code && String(input.order_code).trim()) || getNextOrderCode(db, prefix);
    const orderDate = input.order_date || localTodayIso();
    const category = ORDER_CATEGORIES.includes(input.category) ? input.category : input.category || 'Shorts';
    const title = String(input.title || '').trim() || category;
    const brief = String(input.brief || '').trim();
    const billingType = input.billing_type === 'monthly_package' ? 'monthly_package' : 'one_off';
    const servicePeriod = String(input.service_period || '').trim();
    const amount =
      input.amount === '' || input.amount === null || input.amount === undefined ? null : round2(Number(input.amount));

    if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
      throw new Error('Order amount must be a valid non-negative number or left blank (Rate Pending)');
    }

    let productionStatus = input.production_status;
    if (!PRODUCTION_STAGES.includes(productionStatus)) {
      productionStatus = editor ? 'Assigned' : 'Unassigned';
    }

    const editorCost = editor?.is_self
      ? round2(Number(input.editor_cost || 0))
      : round2(Number(input.editor_cost || 0));
    if (Number.isNaN(editorCost) || editorCost < 0) {
      throw new Error('Editor cost must be zero or positive');
    }

    const editorSubmitted = Boolean(input.editor_work_submitted) && Boolean(editor);
    const editorSubmittedAt = editorSubmitted ? now : null;

    const res = db
      .prepare(
        `INSERT INTO orders (
          order_code, order_date, client_id, title, category, brief,
          billing_type, service_period, amount, production_status,
          production_deadline, payment_due_date, editor_id, editor_cost,
          editor_work_submitted, editor_submitted_at, needs_review, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        orderCode,
        orderDate,
        client.id,
        title,
        category,
        brief,
        billingType,
        servicePeriod,
        amount,
        productionStatus,
        input.production_deadline || null,
        input.payment_due_date || null,
        editor ? editor.id : null,
        editorCost,
        editorSubmitted ? 1 : 0,
        editorSubmittedAt,
        input.needs_review ? 1 : 0,
        String(input.notes || '').trim(),
        now,
        now
      );

    const orderId = Number(res.lastInsertRowid);
    logActivity(
      db,
      'order_created',
      `Created ${orderCode} for ${client.name}: ${title}${amount != null ? ` (₹${amount})` : ' (Rate Pending)'}`,
      'order',
      orderId
    );
    return orderId;
  });
}

export function createBatchOrders(db, ordersList) {
  return withTransaction(db, () => {
    const ids = [];
    for (const item of ordersList) {
      // Reuse same transaction by calling inner logic or direct helper; since we're in transaction?
      // Node sqlite doesn't allow nested BEGIN IMMEDIATE, so perform inline without nested withTransaction
      const settings = getSettingMap(db);
      const prefix = settings.order_prefix || 'SYN';
      const client = resolveOrCreateClient(db, item);
      const editor = resolveEditor(db, item);
      const now = new Date().toISOString();
      const orderCode = getNextOrderCode(db, prefix);
      const orderDate = item.order_date || localTodayIso();
      const category = item.category || 'Shorts';
      const title = String(item.title || '').trim() || category;
      const amount =
        item.amount === '' || item.amount === null || item.amount === undefined ? null : round2(Number(item.amount));
      const prodStatus = PRODUCTION_STAGES.includes(item.production_status)
        ? item.production_status
        : editor
        ? 'Assigned'
        : 'Unassigned';
      const editorCost = round2(Number(item.editor_cost || 0));

      const res = db
        .prepare(
          `INSERT INTO orders (
            order_code, order_date, client_id, title, category, brief,
            billing_type, service_period, amount, production_status,
            production_deadline, payment_due_date, editor_id, editor_cost,
            editor_work_submitted, editor_submitted_at, needs_review, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?)`
        )
        .run(
          orderCode,
          orderDate,
          client.id,
          title,
          category,
          String(item.brief || '').trim(),
          item.billing_type === 'monthly_package' ? 'monthly_package' : 'one_off',
          String(item.service_period || '').trim(),
          amount,
          prodStatus,
          item.production_deadline || null,
          item.payment_due_date || null,
          editor ? editor.id : null,
          editorCost,
          String(item.notes || '').trim(),
          now,
          now
        );
      const id = Number(res.lastInsertRowid);
      ids.push(id);
      logActivity(db, 'order_created', `Batch added ${orderCode} for ${client.name}: ${title}`, 'order', id);
    }
    return ids;
  });
}

export function updateOrder(db, orderId, patch) {
  return withTransaction(db, () => {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
    if (!existing) throw new Error('Order not found');

    const allocSumRow = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payment_allocations WHERE order_id = ?')
      .get(existing.id);
    const allocatedPaid = round2(allocSumRow?.s || 0);

    const eAllocSumRow = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM editor_payout_allocations WHERE order_id = ?')
      .get(existing.id);
    const editorAllocated = round2(eAllocSumRow?.s || 0);

    let nextClientId = existing.client_id;
    if (patch.client_id !== undefined || patch.client_name !== undefined) {
      if (allocatedPaid > 0 && Number(patch.client_id) !== existing.client_id) {
        throw new Error('Cannot change client on an order that already has client payments allocated');
      }
      const c = resolveOrCreateClient(db, patch);
      nextClientId = c.id;
    }

    let nextEditorId = existing.editor_id;
    if (patch.editor_id !== undefined || patch.editor_name !== undefined) {
      if (patch.editor_id === null || patch.editor_id === '' || patch.editor_name === '') {
        if (editorAllocated > 0) {
          throw new Error('Cannot unassign editor on an order that already has editor payouts allocated');
        }
        nextEditorId = null;
      } else {
        const e = resolveEditor(db, patch);
        if (editorAllocated > 0 && e && e.id !== existing.editor_id) {
          throw new Error('Cannot change editor on an order that already has editor payouts allocated');
        }
        nextEditorId = e ? e.id : null;
      }
    }

    let nextAmount = existing.amount;
    if (patch.amount !== undefined) {
      nextAmount =
        patch.amount === null || patch.amount === '' ? null : round2(Number(patch.amount));
      if (nextAmount !== null && (Number.isNaN(nextAmount) || nextAmount < 0)) {
        throw new Error('Amount must be zero or positive');
      }
      if (allocatedPaid > 0 && (nextAmount === null || nextAmount + 0.009 < allocatedPaid)) {
        throw new Error(
          `Order already has ₹${allocatedPaid} allocated from client payments; amount cannot be lower than ₹${allocatedPaid}`
        );
      }
    }

    let nextEditorCost = round2(existing.editor_cost || 0);
    if (patch.editor_cost !== undefined) {
      nextEditorCost = round2(Number(patch.editor_cost || 0));
      if (Number.isNaN(nextEditorCost) || nextEditorCost < 0) {
        throw new Error('Editor cost must be zero or positive');
      }
      if (editorAllocated > 0 && nextEditorCost + 0.009 < editorAllocated) {
        throw new Error(
          `Order already has ₹${editorAllocated} allocated from editor payouts; editor cost cannot be lower`
        );
      }
    }

    let nextSubmitted = existing.editor_work_submitted;
    let nextSubmittedAt = existing.editor_submitted_at;
    if (patch.editor_work_submitted !== undefined) {
      const wantSubmitted = Boolean(patch.editor_work_submitted);
      if (!wantSubmitted && editorAllocated > 0) {
        throw new Error('Cannot unmark editor work submitted after payouts have been allocated');
      }
      nextSubmitted = wantSubmitted ? 1 : 0;
      if (wantSubmitted && !existing.editor_work_submitted) {
        nextSubmittedAt = new Date().toISOString();
      } else if (!wantSubmitted) {
        nextSubmittedAt = null;
      }
    }

    let nextProdStatus = existing.production_status;
    if (patch.production_status !== undefined) {
      if (!PRODUCTION_STAGES.includes(patch.production_status)) {
        throw new Error(`Invalid production status: ${patch.production_status}`);
      }
      nextProdStatus = patch.production_status;
    } else if (nextEditorId && !existing.editor_id && existing.production_status === 'Unassigned') {
      nextProdStatus = 'Assigned';
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE orders SET
        order_date = ?,
        client_id = ?,
        title = ?,
        category = ?,
        brief = ?,
        billing_type = ?,
        service_period = ?,
        amount = ?,
        production_status = ?,
        production_deadline = ?,
        payment_due_date = ?,
        editor_id = ?,
        editor_cost = ?,
        editor_work_submitted = ?,
        editor_submitted_at = ?,
        needs_review = ?,
        notes = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      patch.order_date ?? existing.order_date,
      nextClientId,
      patch.title !== undefined ? String(patch.title).trim() || existing.title : existing.title,
      patch.category !== undefined ? String(patch.category).trim() || existing.category : existing.category,
      patch.brief !== undefined ? String(patch.brief) : existing.brief,
      patch.billing_type !== undefined
        ? patch.billing_type === 'monthly_package'
          ? 'monthly_package'
          : 'one_off'
        : existing.billing_type,
      patch.service_period !== undefined ? String(patch.service_period) : existing.service_period,
      nextAmount,
      nextProdStatus,
      patch.production_deadline !== undefined ? patch.production_deadline || null : existing.production_deadline,
      patch.payment_due_date !== undefined ? patch.payment_due_date || null : existing.payment_due_date,
      nextEditorId,
      nextEditorCost,
      nextSubmitted,
      nextSubmittedAt,
      patch.needs_review !== undefined ? (patch.needs_review ? 1 : 0) : existing.needs_review,
      patch.notes !== undefined ? String(patch.notes) : existing.notes,
      now,
      existing.id
    );

    logActivity(db, 'order_updated', `Updated order ${existing.order_code}`, 'order', existing.id);
    return existing.id;
  });
}

export function deleteOrder(db, orderId) {
  return withTransaction(db, () => {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
    if (!existing) throw new Error('Order not found');

    const cAlloc = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payment_allocations WHERE order_id = ?')
      .get(existing.id);
    const eAlloc = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM editor_payout_allocations WHERE order_id = ?')
      .get(existing.id);
    if ((cAlloc?.s || 0) > 0 || (eAlloc?.s || 0) > 0) {
      throw new Error('Cannot delete an order that has client payments or editor payouts allocated');
    }

    db.prepare('DELETE FROM orders WHERE id = ?').run(existing.id);
    logActivity(db, 'order_deleted', `Deleted order ${existing.order_code}`, 'order', existing.id);
    return true;
  });
}

export function recordClientPayment(db, input) {
  return withTransaction(db, () => {
    const client = resolveOrCreateClient(db, input);
    const amount = round2(Number(input.amount));
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const paymentDate = input.payment_date || localTodayIso();
    const method = String(input.method || 'UPI').trim() || 'UPI';
    const reference = String(input.reference || '').trim();
    const notes = String(input.notes || '').trim();
    const mode = input.mode || 'fifo'; // 'fifo' | 'selected' | 'manual' | 'unallocated'
    const now = new Date().toISOString();

    const payRes = db
      .prepare(
        `INSERT INTO client_payments (client_id, payment_date, amount, method, reference, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(client.id, paymentDate, amount, method, reference, notes, now);
    const paymentId = Number(payRes.lastInsertRowid);

    // Fetch client's orders with remaining balance
    const candidateRows = db
      .prepare(
        `SELECT o.id, o.order_code, o.order_date, o.amount,
                COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa WHERE pa.order_id = o.id), 0) AS already_paid
         FROM orders o
         WHERE o.client_id = ? AND o.amount IS NOT NULL AND o.amount > 0
         ORDER BY o.order_date ASC, o.id ASC`
      )
      .all(client.id);

    const openOrdersMap = new Map();
    const openOrdersList = [];
    for (const r of candidateRows) {
      const rem = round2(r.amount - r.already_paid);
      if (rem > 0.009) {
        const entry = { ...r, remaining: rem };
        openOrdersMap.set(r.id, entry);
        openOrdersList.push(entry);
      }
    }

    const allocations = [];
    let remainingToAllocate = amount;

    if (mode === 'fifo') {
      for (const ord of openOrdersList) {
        if (remainingToAllocate <= 0.009) break;
        const applyAmt = round2(Math.min(remainingToAllocate, ord.remaining));
        if (applyAmt > 0) {
          allocations.push({ order_id: ord.id, order_code: ord.order_code, amount: applyAmt });
          remainingToAllocate = round2(remainingToAllocate - applyAmt);
        }
      }
    } else if (mode === 'selected') {
      const selectedIds = Array.isArray(input.selected_order_ids) ? input.selected_order_ids.map(Number) : [];
      for (const ord of openOrdersList) {
        if (!selectedIds.includes(ord.id)) continue;
        if (remainingToAllocate <= 0.009) break;
        const applyAmt = round2(Math.min(remainingToAllocate, ord.remaining));
        if (applyAmt > 0) {
          allocations.push({ order_id: ord.id, order_code: ord.order_code, amount: applyAmt });
          remainingToAllocate = round2(remainingToAllocate - applyAmt);
        }
      }
    } else if (mode === 'manual') {
      const items = Array.isArray(input.custom_allocations) ? input.custom_allocations : [];
      let sum = 0;
      for (const item of items) {
        const oid = Number(item.order_id);
        const amt = round2(Number(item.amount));
        if (amt <= 0) continue;
        const ord = openOrdersMap.get(oid);
        if (!ord) {
          throw new Error(`Order #${oid} does not belong to ${client.name} or has no remaining balance`);
        }
        if (amt > ord.remaining + 0.009) {
          throw new Error(`Allocation ₹${amt} exceeds remaining balance ₹${ord.remaining} on ${ord.order_code}`);
        }
        sum = round2(sum + amt);
        allocations.push({ order_id: oid, order_code: ord.order_code, amount: amt });
      }
      if (sum > amount + 0.009) {
        throw new Error(`Total manual allocations (₹${sum}) exceed receipt amount (₹${amount})`);
      }
      remainingToAllocate = round2(amount - sum);
    } else if (mode === 'unallocated') {
      remainingToAllocate = amount;
    } else {
      throw new Error(`Unknown allocation mode: ${mode}`);
    }

    const insertAlloc = db.prepare(
      `INSERT INTO payment_allocations (payment_id, order_id, amount, created_at) VALUES (?, ?, ?, ?)`
    );
    for (const a of allocations) {
      insertAlloc.run(paymentId, a.order_id, a.amount, now);
    }

    const allocatedTotal = round2(amount - remainingToAllocate);
    const allocDesc =
      allocations.length > 0
        ? `allocated to ${allocations.map((a) => `${a.order_code} (₹${a.amount})`).join(', ')}`
        : 'kept as unallocated advance';
    logActivity(
      db,
      'client_payment',
      `Received ₹${amount} from ${client.name} (${method}) — ${allocDesc}`,
      'payment',
      paymentId
    );

    return {
      payment_id: paymentId,
      amount,
      allocated_amount: allocatedTotal,
      unallocated_amount: Math.max(0, round2(remainingToAllocate)),
      allocations,
    };
  });
}

export function allocateClientAdvance(db, { payment_id, order_id, amount }) {
  return withTransaction(db, () => {
    const payment = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(Number(payment_id));
    if (!payment) throw new Error('Client receipt not found');

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(order_id));
    if (!order) throw new Error('Order not found');
    if (order.client_id !== payment.client_id) {
      throw new Error('Cannot allocate a client receipt to a different client order');
    }
    if (order.amount === null || order.amount <= 0) {
      throw new Error('Order must have a positive amount before allocating payment');
    }

    const payAllocSum = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payment_allocations WHERE payment_id = ?')
      .get(payment.id);
    const unallocated = round2(payment.amount - (payAllocSum?.s || 0));

    const ordAllocSum = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payment_allocations WHERE order_id = ?')
      .get(order.id);
    const orderBalance = round2(order.amount - (ordAllocSum?.s || 0));

    const applyAmt = round2(
      amount !== undefined ? Number(amount) : Math.min(unallocated, orderBalance)
    );
    if (Number.isNaN(applyAmt) || applyAmt <= 0) throw new Error('Allocation amount must be positive');
    if (applyAmt > unallocated + 0.009) {
      throw new Error(`Only ₹${unallocated} unallocated advance remains on this receipt`);
    }
    if (applyAmt > orderBalance + 0.009) {
      throw new Error(`Order ${order.order_code} only has ₹${orderBalance} remaining balance`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO payment_allocations (payment_id, order_id, amount, created_at) VALUES (?, ?, ?, ?)`
    ).run(payment.id, order.id, applyAmt, now);

    logActivity(
      db,
      'advance_allocated',
      `Applied ₹${applyAmt} client advance to ${order.order_code}`,
      'order',
      order.id
    );
    return { payment_id: payment.id, order_id: order.id, amount: applyAmt };
  });
}

export function recordEditorPayout(db, input) {
  return withTransaction(db, () => {
    const editor = resolveEditor(db, input);
    if (!editor) throw new Error('Editor is required');

    const amount = round2(Number(input.amount));
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('Payout amount must be greater than zero');
    }

    const payoutDate = input.payout_date || localTodayIso();
    const method = String(input.method || 'UPI').trim() || 'UPI';
    const reference = String(input.reference || '').trim();
    const notes = String(input.notes || '').trim();
    const mode = input.mode || 'fifo';
    const now = new Date().toISOString();

    const payRes = db
      .prepare(
        `INSERT INTO editor_payouts (editor_id, payout_date, amount, method, reference, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(editor.id, payoutDate, amount, method, reference, notes, now);
    const payoutId = Number(payRes.lastInsertRowid);

    // Strictly only orders for THIS editor with editor_work_submitted = 1
    const candidateRows = db
      .prepare(
        `SELECT o.id, o.order_code, o.order_date, o.editor_cost,
                COALESCE((SELECT SUM(epa.amount) FROM editor_payout_allocations epa WHERE epa.order_id = o.id), 0) AS already_paid
         FROM orders o
         WHERE o.editor_id = ? AND o.editor_work_submitted = 1 AND o.editor_cost > 0
         ORDER BY o.order_date ASC, o.id ASC`
      )
      .all(editor.id);

    const openMap = new Map();
    const openList = [];
    for (const r of candidateRows) {
      const rem = round2(r.editor_cost - r.already_paid);
      if (rem > 0.009) {
        const entry = { ...r, remaining: rem };
        openMap.set(r.id, entry);
        openList.push(entry);
      }
    }

    const allocations = [];
    let remainingToAllocate = amount;

    if (mode === 'fifo') {
      for (const ord of openList) {
        if (remainingToAllocate <= 0.009) break;
        const applyAmt = round2(Math.min(remainingToAllocate, ord.remaining));
        if (applyAmt > 0) {
          allocations.push({ order_id: ord.id, order_code: ord.order_code, amount: applyAmt });
          remainingToAllocate = round2(remainingToAllocate - applyAmt);
        }
      }
    } else if (mode === 'selected') {
      const selectedIds = Array.isArray(input.selected_order_ids) ? input.selected_order_ids.map(Number) : [];
      for (const ord of openList) {
        if (!selectedIds.includes(ord.id)) continue;
        if (remainingToAllocate <= 0.009) break;
        const applyAmt = round2(Math.min(remainingToAllocate, ord.remaining));
        if (applyAmt > 0) {
          allocations.push({ order_id: ord.id, order_code: ord.order_code, amount: applyAmt });
          remainingToAllocate = round2(remainingToAllocate - applyAmt);
        }
      }
    } else if (mode === 'manual') {
      const items = Array.isArray(input.custom_allocations) ? input.custom_allocations : [];
      let sum = 0;
      for (const item of items) {
        const oid = Number(item.order_id);
        const amt = round2(Number(item.amount));
        if (amt <= 0) continue;
        const ord = openMap.get(oid);
        if (!ord) {
          throw new Error(
            `Order #${oid} is not a submitted unpaid order assigned to ${editor.name}`
          );
        }
        if (amt > ord.remaining + 0.009) {
          throw new Error(`Allocation ₹${amt} exceeds remaining editor cost ₹${ord.remaining} on ${ord.order_code}`);
        }
        sum = round2(sum + amt);
        allocations.push({ order_id: oid, order_code: ord.order_code, amount: amt });
      }
      if (sum > amount + 0.009) {
        throw new Error(`Total manual allocations (₹${sum}) exceed payout amount (₹${amount})`);
      }
      remainingToAllocate = round2(amount - sum);
    } else if (mode === 'unallocated') {
      remainingToAllocate = amount;
    } else {
      throw new Error(`Unknown payout mode: ${mode}`);
    }

    const insertAlloc = db.prepare(
      `INSERT INTO editor_payout_allocations (payout_id, order_id, amount, created_at) VALUES (?, ?, ?, ?)`
    );
    for (const a of allocations) {
      insertAlloc.run(payoutId, a.order_id, a.amount, now);
    }

    const allocDesc =
      allocations.length > 0
        ? `settled ${allocations.map((a) => `${a.order_code} (₹${a.amount})`).join(', ')}`
        : 'kept as unallocated editor advance';
    logActivity(
      db,
      'editor_payout',
      `Paid ₹${amount} to ${editor.name} (${method}) — ${allocDesc}`,
      'payout',
      payoutId
    );

    return {
      payout_id: payoutId,
      amount,
      allocated_amount: round2(amount - remainingToAllocate),
      unallocated_amount: Math.max(0, round2(remainingToAllocate)),
      allocations,
    };
  });
}

export function allocateEditorAdvance(db, { payout_id, order_id, amount }) {
  return withTransaction(db, () => {
    const payout = db.prepare('SELECT * FROM editor_payouts WHERE id = ?').get(Number(payout_id));
    if (!payout) throw new Error('Editor payout not found');

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(order_id));
    if (!order) throw new Error('Order not found');
    if (order.editor_id !== payout.editor_id) {
      throw new Error('Cannot allocate a payout to a different editor order');
    }
    if (!order.editor_work_submitted) {
      throw new Error('Editor work must be marked submitted before payout can be allocated');
    }

    const payoutAllocSum = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM editor_payout_allocations WHERE payout_id = ?')
      .get(payout.id);
    const unallocated = round2(payout.amount - (payoutAllocSum?.s || 0));

    const ordAllocSum = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM editor_payout_allocations WHERE order_id = ?')
      .get(order.id);
    const orderBalance = round2((order.editor_cost || 0) - (ordAllocSum?.s || 0));

    const applyAmt = round2(
      amount !== undefined ? Number(amount) : Math.min(unallocated, orderBalance)
    );
    if (Number.isNaN(applyAmt) || applyAmt <= 0) throw new Error('Allocation amount must be positive');
    if (applyAmt > unallocated + 0.009) {
      throw new Error(`Only ₹${unallocated} unallocated advance remains on this payout`);
    }
    if (applyAmt > orderBalance + 0.009) {
      throw new Error(`Order ${order.order_code} only has ₹${orderBalance} remaining editor balance`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO editor_payout_allocations (payout_id, order_id, amount, created_at) VALUES (?, ?, ?, ?)`
    ).run(payout.id, order.id, applyAmt, now);

    logActivity(
      db,
      'editor_advance_allocated',
      `Applied ₹${applyAmt} editor advance to ${order.order_code}`,
      'order',
      order.id
    );
    return { payout_id: payout.id, order_id: order.id, amount: applyAmt };
  });
}

export function recordExpense(db, input) {
  return withTransaction(db, () => {
    const amount = round2(Number(input.amount));
    if (Number.isNaN(amount) || amount <= 0) throw new Error('Expense amount must be positive');
    const description = String(input.description || '').trim();
    if (!description) throw new Error('Expense description is required');
    const category = EXPENSE_CATEGORIES.includes(input.category) ? input.category : input.category || 'Other';
    const expenseDate = input.expense_date || localTodayIso();
    const notes = String(input.notes || '').trim();
    const now = new Date().toISOString();

    const res = db
      .prepare(
        `INSERT INTO expenses (expense_date, category, description, amount, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(expenseDate, category, description, amount, notes, now);
    const id = Number(res.lastInsertRowid);
    logActivity(db, 'expense_recorded', `Recorded expense ₹${amount} (${category}): ${description}`, 'expense', id);
    return id;
  });
}

export function deleteExpense(db, id) {
  return withTransaction(db, () => {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(id));
    return true;
  });
}

export function upsertClient(db, input) {
  return withTransaction(db, () => {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Client name is required');
    const now = new Date().toISOString();
    if (input.id) {
      db.prepare(
        `UPDATE clients SET name = ?, aliases = ?, phone = ?, email = ?, default_rate_shorts = ?, default_rate_video = ?, default_billing_type = ?, notes = ? WHERE id = ?`
      ).run(
        name,
        String(input.aliases || '').trim(),
        String(input.phone || '').trim(),
        String(input.email || '').trim(),
        input.default_rate_shorts === '' || input.default_rate_shorts == null ? null : Number(input.default_rate_shorts),
        input.default_rate_video === '' || input.default_rate_video == null ? null : Number(input.default_rate_video),
        input.default_billing_type === 'monthly_package' ? 'monthly_package' : 'one_off',
        String(input.notes || '').trim(),
        Number(input.id)
      );
      logActivity(db, 'client_updated', `Updated client ${name}`, 'client', Number(input.id));
      return Number(input.id);
    }
    const res = db
      .prepare(
        `INSERT INTO clients (name, aliases, phone, email, default_rate_shorts, default_rate_video, default_billing_type, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        String(input.aliases || '').trim(),
        String(input.phone || '').trim(),
        String(input.email || '').trim(),
        input.default_rate_shorts === '' || input.default_rate_shorts == null ? null : Number(input.default_rate_shorts),
        input.default_rate_video === '' || input.default_rate_video == null ? null : Number(input.default_rate_video),
        input.default_billing_type === 'monthly_package' ? 'monthly_package' : 'one_off',
        String(input.notes || '').trim(),
        now
      );
    const id = Number(res.lastInsertRowid);
    logActivity(db, 'client_created', `Added client ${name}`, 'client', id);
    return id;
  });
}

export function upsertEditor(db, input) {
  return withTransaction(db, () => {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Editor name is required');
    const now = new Date().toISOString();
    if (input.id) {
      db.prepare(
        `UPDATE editors SET name = ?, phone = ?, specialty = ?, is_self = ?, default_rate_shorts = ?, default_rate_video = ?, notes = ? WHERE id = ?`
      ).run(
        name,
        String(input.phone || '').trim(),
        String(input.specialty || '').trim(),
        input.is_self ? 1 : 0,
        input.default_rate_shorts === '' || input.default_rate_shorts == null ? null : Number(input.default_rate_shorts),
        input.default_rate_video === '' || input.default_rate_video == null ? null : Number(input.default_rate_video),
        String(input.notes || '').trim(),
        Number(input.id)
      );
      logActivity(db, 'editor_updated', `Updated editor ${name}`, 'editor', Number(input.id));
      return Number(input.id);
    }
    const res = db
      .prepare(
        `INSERT INTO editors (name, phone, specialty, is_self, default_rate_shorts, default_rate_video, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        String(input.phone || '').trim(),
        String(input.specialty || '').trim(),
        input.is_self ? 1 : 0,
        input.default_rate_shorts === '' || input.default_rate_shorts == null ? null : Number(input.default_rate_shorts),
        input.default_rate_video === '' || input.default_rate_video == null ? null : Number(input.default_rate_video),
        String(input.notes || '').trim(),
        now
      );
    const id = Number(res.lastInsertRowid);
    logActivity(db, 'editor_created', `Added editor ${name}`, 'editor', id);
    return id;
  });
}

export function exportOrdersCsv(db) {
  const snap = getWorkspaceSnapshot(db);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = [
    'Project ID',
    'Order Date',
    'Client Name',
    'Title / Topic',
    'Category',
    'Billing Type',
    'Service Period',
    'Order Amount (INR)',
    'Client Allocated Paid (INR)',
    'Client Balance Due (INR)',
    'Client Payment Status',
    'Production Status',
    'Production Deadline',
    'Payment Due Date',
    'Editor Name',
    'Editor Cost (INR)',
    'Editor Work Submitted',
    'Editor Paid (INR)',
    'Editor Balance Due (INR)',
    'Editor Payout Status',
    'Profit (INR)',
    'Profit %',
    'Notes',
  ];
  const lines = [header.map(esc).join(',')];
  for (const o of [...snap.orders].reverse()) {
    lines.push(
      [
        o.order_code,
        o.order_date,
        o.client_name,
        o.title,
        o.category,
        o.billing_type,
        o.service_period,
        o.amount ?? '',
        o.allocated_paid,
        o.balance_due,
        o.payment_status,
        o.production_status,
        o.production_deadline || '',
        o.payment_due_date || '',
        o.editor_name || '',
        o.editor_cost,
        o.editor_work_submitted ? 'Yes' : 'No',
        o.editor_allocated,
        o.editor_balance_due,
        o.editor_payout_status,
        o.profit,
        `${o.profit_pct}%`,
        o.notes || '',
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\n');
}
