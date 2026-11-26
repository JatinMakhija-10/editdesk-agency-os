import { withTransaction } from './dbCore.mjs';
import {
  getNextOrderCode,
  getSettingMap,
  logActivity,
  resolveEditor,
  resolveOrCreateClient,
  round2,
} from './ledgerService.mjs';

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseOptionalNumber(val) {
  if (val === null || val === undefined) return null;
  const cleaned = String(val).replace(/[₹,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : null;
}

function parseBoolish(val) {
  const s = String(val || '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'submitted';
}

const KNOWN_CLIENT_ALIASES = {
  'nova fit': 'Nova Fitness',
  bloom: 'Bloom Care',
};

function normalizeClientRaw(raw, seenCanonicalNames) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const alias = KNOWN_CLIENT_ALIASES[lower];
  if (alias) return alias;
  // Match case-insensitive existing name or single-word prefix of a multi-word client already seen (e.g. "Acme" -> "Acme Studio")
  for (const full of seenCanonicalNames) {
    const fl = full.toLowerCase();
    if (fl === lower) return full;
    if (!lower.includes(' ') && fl.startsWith(`${lower} `)) return full;
  }
  seenCanonicalNames.add(trimmed);
  return trimmed;
}

function normalizeEditorRaw(raw) {
  return String(raw || '').trim();
}

export function parseSpreadsheetCsv(csvText) {
  const rawRows = parseCsvRows(csvText);
  const ordersByCode = new Map();
  const seenClients = new Set();
  const yearlyBaselines = [];
  const sectionsDetected = [];

  let currentSection = null;
  let headers = [];
  let autoOrderCounter = 1;

  const ensureOrder = (code) => {
    const key = code.toUpperCase();
    if (!ordersByCode.has(key)) {
      ordersByCode.set(key, {
        order_code: key,
        order_date: null,
        client_name: '',
        title: '',
        category: '',
        brief: '',
        billing_type: 'one_off',
        service_period: '',
        amount: null,
        client_paid_flag: false,
        client_unpaid_flag: false,
        legacy_income_received: false,
        client_allocated_override: null,
        production_status: null,
        production_deadline: null,
        payment_due_date: null,
        editor_name: '',
        editor_cost: null,
        editor_paid_flag: false,
        editor_work_submitted: null,
        notes: '',
      });
    }
    return ordersByCode.get(key);
  };

  for (const r of rawRows) {
    const norm = r.map(normHeader);
    const nonEmpty = norm.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    // Detect section headers
    const hasProjectId = norm[0] === 'project id' || norm[0] === 'order code' || norm[0] === 'order id';
    if (hasProjectId && (norm.includes('client name') || norm.includes('client'))) {
      currentSection = norm.includes('editor name') || norm.includes('editor cost (inr)') ? 'combined' : 'income';
      headers = norm;
      if (!sectionsDetected.includes(currentSection)) sectionsDetected.push(currentSection);
      continue;
    }
    if (hasProjectId && (norm.includes('editor name') || norm.includes('amount paid'))) {
      currentSection = 'editor';
      headers = norm;
      if (!sectionsDetected.includes('editor')) sectionsDetected.push('editor');
      continue;
    }
    if (hasProjectId && norm.some((c) => c.startsWith('profit'))) {
      currentSection = 'profit_skip';
      headers = norm;
      if (!sectionsDetected.includes('profit')) sectionsDetected.push('profit');
      continue;
    }
    if (norm[0] === 'month' && norm.some((c) => c.includes('amount received') || c.includes('received'))) {
      currentSection = 'monthly_skip';
      headers = norm;
      if (!sectionsDetected.includes('monthly')) sectionsDetected.push('monthly');
      continue;
    }
    if (norm[0] === 'yearly' || (norm[0] === 'year' && norm.some((c) => c.includes('received')))) {
      currentSection = 'yearly';
      headers = norm;
      if (!sectionsDetected.includes('yearly')) sectionsDetected.push('yearly');
      continue;
    }

    // If no explicit section header yet, allow standard single-table CSV with Client Name column
    if (!currentSection) {
      if (norm.includes('client name') || norm.includes('client')) {
        currentSection = 'combined';
        headers = norm;
        sectionsDetected.push('combined');
        continue;
      }
      continue;
    }

    if (currentSection === 'profit_skip' || currentSection === 'monthly_skip') continue;

    const getCol = (...names) => {
      for (const n of names) {
        const idx = headers.indexOf(n);
        if (idx !== -1 && idx < r.length) return r[idx];
      }
      return '';
    };

    if (currentSection === 'yearly') {
      const yearStr = String(r[0] || '').trim();
      if (!/^\d{4}$/.test(yearStr)) continue;
      const received = parseOptionalNumber(getCol('total amount received', 'billed', 'received'));
      const paid = parseOptionalNumber(getCol('total amount paid', 'editor cost', 'paid'));
      const profit = parseOptionalNumber(getCol('total profit', 'profit'));
      if (received !== null || paid !== null) {
        yearlyBaselines.push({
          year: Number(yearStr),
          total_received: received ?? 0,
          total_paid: paid ?? 0,
          total_profit: profit ?? round2((received ?? 0) - (paid ?? 0)),
        });
      }
      continue;
    }

    const rawCode = String(getCol('project id', 'order code', 'order id') || '').trim();
    if (/^total\b/i.test(rawCode)) continue;

    // Skip pre-numbered blank spreadsheet template rows (e.g. SYN0051,,,,,,,,)
    const orderDate = String(getCol('order date', 'date') || '').trim();
    const rawClient = getCol('client name', 'client');
    const rawEditor = getCol('editor name', 'editor');
    const rawDesc = String(getCol('title / topic', 'title', 'project description', 'description') || '').trim();
    const rawCategory = String(getCol('category') || '').trim();
    const rawAmount = parseOptionalNumber(
      getCol('order amount (inr)', 'amount received', 'amount', 'client amount')
    );
    const rawEditorCost = parseOptionalNumber(getCol('editor cost (inr)', 'amount paid', 'editor cost'));

    const hasMeaningfulContent =
      Boolean(orderDate) ||
      Boolean(String(rawClient || '').trim()) ||
      Boolean(String(rawEditor || '').trim()) ||
      Boolean(rawDesc) ||
      rawAmount !== null ||
      rawEditorCost !== null;

    if (!hasMeaningfulContent) continue;

    const orderCode = rawCode || `IMP${String(autoOrderCounter++).padStart(4, '0')}`;
    const entry = ensureOrder(orderCode);

    if (orderDate) entry.order_date = orderDate;

    if (currentSection === 'income' || currentSection === 'combined') {
      const cleanClient = normalizeClientRaw(rawClient, seenClients);
      if (cleanClient) entry.client_name = cleanClient;
      if (rawCategory) entry.category = rawCategory;
      if (rawDesc) {
        if (!entry.title) entry.title = rawDesc;
        if (!entry.category) entry.category = rawCategory || rawDesc;
      }
      if (rawAmount !== null) {
        entry.amount = rawAmount;
        if (currentSection === 'income' && rawAmount > 0) {
          entry.legacy_income_received = true;
        }
      }

      const payStatus = String(getCol('client payment status', 'payment status') || '')
        .trim()
        .toLowerCase();
      if (payStatus === 'completed' || payStatus === 'paid') {
        entry.client_paid_flag = true;
      } else if (payStatus === 'unpaid' || payStatus === 'rate pending') {
        entry.client_unpaid_flag = true;
      }
      const allocOverride = parseOptionalNumber(getCol('client allocated paid (inr)'));
      if (allocOverride !== null) entry.client_allocated_override = allocOverride;

      const prodStatus = String(getCol('production status', 'stage') || '').trim();
      if (prodStatus) entry.production_status = prodStatus;

      const bType = String(getCol('billing type') || '').trim();
      if (bType === 'monthly_package') entry.billing_type = 'monthly_package';

      const sPeriod = String(getCol('service period') || '').trim();
      if (sPeriod) entry.service_period = sPeriod;

      const pDeadline = String(getCol('production deadline') || '').trim();
      if (pDeadline) entry.production_deadline = pDeadline;

      const invDue = String(getCol('payment due date') || '').trim();
      if (invDue) entry.payment_due_date = invDue;

      const notes = String(getCol('notes') || '').trim();
      if (notes) entry.notes = notes;
    }

    if (currentSection === 'editor' || currentSection === 'combined') {
      const cleanEd = normalizeEditorRaw(rawEditor);
      if (cleanEd) entry.editor_name = cleanEd;
      if (!entry.category && rawDesc) entry.category = rawDesc;
      if (!entry.title && rawDesc) entry.title = rawDesc;
      if (rawEditorCost !== null) entry.editor_cost = rawEditorCost;

      const edPayStatus = String(getCol('editor payout status', 'payment status') || '')
        .trim()
        .toLowerCase();
      if (edPayStatus === 'completed' || edPayStatus === 'paid') {
        entry.editor_paid_flag = true;
      }
      const subCol = getCol('editor work submitted');
      if (subCol !== '') {
        entry.editor_work_submitted = parseBoolish(subCol);
      }
    }
  }

  const parsedOrders = Array.from(ordersByCode.values()).filter((o) => o.client_name);
  const yearsWithOrders = new Set(parsedOrders.map((o) => Number(String(o.order_date || '').slice(0, 4))).filter(Boolean));
  const filteredBaselines = yearlyBaselines.filter((b) => !yearsWithOrders.has(b.year));

  const totalReceived = round2(parsedOrders.reduce((s, o) => s + (o.amount || 0), 0));
  const totalEditorCost = round2(parsedOrders.reduce((s, o) => s + (o.editor_cost || 0), 0));
  const totalProfit = round2(totalReceived - totalEditorCost);
  const marginPct = totalReceived > 0 ? round2((totalProfit / totalReceived) * 100) : 0;

  return {
    sectionsDetected,
    orders: parsedOrders,
    yearlyBaselines: filteredBaselines,
    summary: {
      orderCount: parsedOrders.length,
      clientCount: new Set(parsedOrders.map((o) => o.client_name)).size,
      editorCount: new Set(parsedOrders.map((o) => o.editor_name).filter(Boolean)).size,
      totalReceived,
      totalEditorCost,
      totalProfit,
      marginPct,
      baselineYears: filteredBaselines.map((b) => b.year),
    },
  };
}

export function previewSpreadsheetCsv(db, csvText) {
  const parsed = parseSpreadsheetCsv(csvText);
  const existingCodes = new Set(
    db
      .prepare('SELECT order_code FROM orders')
      .all()
      .map((r) => String(r.order_code).toUpperCase())
  );
  let insertCount = 0;
  let updateCount = 0;
  for (const o of parsed.orders) {
    if (existingCodes.has(o.order_code)) updateCount++;
    else insertCount++;
  }
  return {
    ...parsed.summary,
    sectionsDetected: parsed.sectionsDetected,
    insertCount,
    updateCount,
    yearlyBaselines: parsed.yearlyBaselines,
    sampleOrders: parsed.orders.slice(0, 6),
  };
}

export function importSpreadsheetCsv(db, csvText, { mode = 'upsert' } = {}) {
  const parsed = parseSpreadsheetCsv(csvText);
  if (parsed.orders.length === 0 && parsed.yearlyBaselines.length === 0) {
    throw new Error('No recognizable order or yearly summary rows found in CSV');
  }

  return withTransaction(db, () => {
    const now = new Date().toISOString();
    const settings = getSettingMap(db);
    const prefix = settings.order_prefix || 'SYN';

    if (mode === 'replace') {
      db.exec(`
        DELETE FROM payment_allocations;
        DELETE FROM client_payments;
        DELETE FROM editor_payout_allocations;
        DELETE FROM editor_payouts;
        DELETE FROM orders;
        DELETE FROM yearly_baselines;
      `);
    }

    for (const b of parsed.yearlyBaselines) {
      db.prepare(
        `INSERT OR REPLACE INTO yearly_baselines (year, total_received, total_paid, total_profit, notes)
         VALUES (?, ?, ?, ?, ?)`
      ).run(b.year, b.total_received, b.total_paid, b.total_profit, 'Imported yearly baseline from CSV');
    }

    let inserted = 0;
    let updated = 0;

    for (const item of parsed.orders) {
      const client = resolveOrCreateClient(db, { client_name: item.client_name });
      const editor = item.editor_name ? resolveEditor(db, { editor_name: item.editor_name }) : null;
      const orderCode = item.order_code || getNextOrderCode(db, prefix);
      const orderDate = item.order_date || now.slice(0, 10);
      const category = item.category || 'Shorts';
      const title = item.title || category;
      const editorCost = round2(item.editor_cost || 0);

      let prodStatus = item.production_status;
      if (!prodStatus) {
        if (!editor) prodStatus = 'Unassigned';
        else if (item.client_paid_flag || item.editor_paid_flag) prodStatus = 'Delivered';
        else if (item.amount === null) prodStatus = 'Internal review';
        else prodStatus = 'Assigned';
      }

      const editorSubmitted =
        item.editor_work_submitted !== null
          ? item.editor_work_submitted
          : editor != null && (item.editor_paid_flag || editorCost > 0 || prodStatus === 'Delivered');

      const existing = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
      let orderId;

      if (!existing) {
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
            item.brief || '',
            item.billing_type || 'one_off',
            item.service_period || '',
            item.amount,
            prodStatus,
            item.production_deadline || null,
            item.payment_due_date || null,
            editor ? editor.id : null,
            editorCost,
            editorSubmitted ? 1 : 0,
            editorSubmitted ? `${orderDate}T18:00:00.000Z` : null,
            item.amount === null || !editor || (!item.editor_paid_flag && editorCost > 0) ? 1 : 0,
            item.notes || '',
            now,
            now
          );
        orderId = Number(res.lastInsertRowid);
        inserted++;
      } else {
        orderId = existing.id;
        db.prepare(
          `UPDATE orders SET
            order_date = ?,
            client_id = ?,
            title = ?,
            category = ?,
            billing_type = ?,
            service_period = ?,
            amount = ?,
            production_status = ?,
            production_deadline = COALESCE(?, production_deadline),
            payment_due_date = COALESCE(?, payment_due_date),
            editor_id = ?,
            editor_cost = ?,
            editor_work_submitted = ?,
            editor_submitted_at = COALESCE(editor_submitted_at, ?),
            notes = CASE WHEN ? != '' THEN ? ELSE notes END,
            updated_at = ?
           WHERE id = ?`
        ).run(
          orderDate,
          client.id,
          title,
          category,
          item.billing_type || existing.billing_type,
          item.service_period || existing.service_period,
          item.amount,
          item.production_status || existing.production_status,
          item.production_deadline,
          item.payment_due_date,
          editor ? editor.id : existing.editor_id,
          editorCost,
          editorSubmitted ? 1 : 0,
          editorSubmitted ? `${orderDate}T18:00:00.000Z` : null,
          item.notes || '',
          item.notes || '',
          now,
          existing.id
        );
        updated++;
      }

      // Idempotent client payment allocation when CSV indicates received/completed
      const desiredClientPaid =
        item.client_allocated_override !== null
          ? item.client_allocated_override
          : !item.client_unpaid_flag &&
            item.amount !== null &&
            item.amount > 0 &&
            (item.client_paid_flag || (item.legacy_income_received && !item.editor_name))
          ? item.amount
          : 0;

      if (desiredClientPaid > 0) {
        const currentAlloc = round2(
          db
            .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payment_allocations WHERE order_id = ?')
            .get(orderId)?.s || 0
        );
        const delta = round2(desiredClientPaid - currentAlloc);
        if (delta > 0.009) {
          const payRes = db
            .prepare(
              `INSERT INTO client_payments (client_id, payment_date, amount, method, reference, notes, created_at)
               VALUES (?, ?, ?, 'UPI', ?, ?, ?)`
            )
            .run(client.id, orderDate, delta, orderCode, `CSV import (${orderCode})`, now);
          db.prepare(
            `INSERT INTO payment_allocations (payment_id, order_id, amount, created_at) VALUES (?, ?, ?, ?)`
          ).run(Number(payRes.lastInsertRowid), orderId, delta, now);
        }
      }

      // Idempotent editor payout allocation when CSV indicates editor payout Completed
      if (editor && editorCost > 0 && item.editor_paid_flag) {
        const currentEdAlloc = round2(
          db
            .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM editor_payout_allocations WHERE order_id = ?')
            .get(orderId)?.s || 0
        );
        const delta = round2(editorCost - currentEdAlloc);
        if (delta > 0.009) {
          const payoutRes = db
            .prepare(
              `INSERT INTO editor_payouts (editor_id, payout_date, amount, method, reference, notes, created_at)
               VALUES (?, ?, ?, 'UPI', ?, ?, ?)`
            )
            .run(editor.id, orderDate, delta, orderCode, `CSV import payout (${orderCode})`, now);
          db.prepare(
            `INSERT INTO editor_payout_allocations (payout_id, order_id, amount, created_at) VALUES (?, ?, ?, ?)`
          ).run(Number(payoutRes.lastInsertRowid), orderId, delta, now);
        }
      }
    }

    logActivity(
      db,
      'csv_import',
      `Imported spreadsheet CSV (${inserted} added, ${updated} updated, ${parsed.yearlyBaselines.length} baseline years)`,
      'system',
      null
    );

    return {
      inserted,
      updated,
      baselineCount: parsed.yearlyBaselines.length,
      summary: parsed.summary,
    };
  });
}
