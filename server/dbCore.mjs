import crypto from 'node:crypto';
import {
  CLIENT_NORMALIZATION,
  EDITOR_NORMALIZATION,
  HISTORICAL_ORDERS_2026,
  HISTORICAL_YEARLY_BASELINES,
} from './seedData.mjs';

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

/**
 * Wraps a sql.js Database instance with the subset of node:sqlite DatabaseSync
 * methods used by EditDesk services (.exec, .prepare().run/get/all).
 */
export function wrapSqlJsDatabase(rawDb) {
  return {
    exec(sql) {
      rawDb.exec(sql);
    },
    prepare(sql) {
      return {
        run(...params) {
          const cleanParams = params.map((p) => (p === undefined ? null : p));
          const stmt = rawDb.prepare(sql);
          try {
            stmt.bind(cleanParams);
            while (stmt.step()) {
              // drain
            }
          } finally {
            stmt.free();
          }
          const changes = rawDb.getRowsModified();
          const idRes = rawDb.exec('SELECT last_insert_rowid() AS id');
          const lastId = idRes?.[0]?.values?.[0]?.[0] ?? 0;
          return { lastInsertRowid: Number(lastId), changes };
        },
        get(...params) {
          const cleanParams = params.map((p) => (p === undefined ? null : p));
          const stmt = rawDb.prepare(sql);
          try {
            stmt.bind(cleanParams);
            if (!stmt.step()) return undefined;
            return stmt.getAsObject();
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const cleanParams = params.map((p) => (p === undefined ? null : p));
          const stmt = rawDb.prepare(sql);
          const rows = [];
          try {
            stmt.bind(cleanParams);
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
          } finally {
            stmt.free();
          }
          return rows;
        },
      };
    },
    export() {
      return rawDb.export();
    },
    close() {
      rawDb.close();
    },
  };
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS yearly_baselines (
      year INTEGER PRIMARY KEY,
      total_received REAL NOT NULL,
      total_paid REAL NOT NULL,
      total_profit REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      aliases TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      default_rate_shorts REAL,
      default_rate_video REAL,
      default_billing_type TEXT NOT NULL DEFAULT 'one_off',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS editors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      specialty TEXT NOT NULL DEFAULT '',
      is_self INTEGER NOT NULL DEFAULT 0,
      default_rate_shorts REAL,
      default_rate_video REAL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      order_date TEXT NOT NULL,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Shorts',
      brief TEXT NOT NULL DEFAULT '',
      billing_type TEXT NOT NULL DEFAULT 'one_off' CHECK (billing_type IN ('one_off', 'monthly_package')),
      service_period TEXT NOT NULL DEFAULT '',
      amount REAL,
      production_status TEXT NOT NULL DEFAULT 'New' CHECK (
        production_status IN ('New','Unassigned','Assigned','Editing','Internal review','Client review','Revisions','Approved','Delivered')
      ),
      production_deadline TEXT,
      payment_due_date TEXT,
      editor_id INTEGER REFERENCES editors(id),
      editor_cost REAL NOT NULL DEFAULT 0,
      editor_work_submitted INTEGER NOT NULL DEFAULT 0,
      editor_submitted_at TEXT,
      needs_review INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS client_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      method TEXT NOT NULL DEFAULT 'UPI',
      reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount > 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS editor_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      editor_id INTEGER NOT NULL REFERENCES editors(id),
      payout_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      method TEXT NOT NULL DEFAULT 'UPI',
      reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS editor_payout_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payout_id INTEGER NOT NULL REFERENCES editor_payouts(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount > 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Software',
      description TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_orders_editor ON orders(editor_id);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_alloc_order ON payment_allocations(order_id);
    CREATE INDEX IF NOT EXISTS idx_alloc_payment ON payment_allocations(payment_id);
    CREATE INDEX IF NOT EXISTS idx_ealloc_order ON editor_payout_allocations(order_id);
    CREATE INDEX IF NOT EXISTS idx_ealloc_payout ON editor_payout_allocations(payout_id);
  `);
}

function setSettingIfMissing(db, key, value) {
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function ensureDefaultSettings(db) {
  const defaults = {
    agency_name: 'EditDesk Studio',
    owner_name: 'Owner',
    currency: 'INR',
    order_prefix: 'SYN',
    pin_enabled: '1',
    mobile_pin: '2026',
    ai_provider: 'offline',
    ai_api_key: '',
    ai_model: 'gemini-3.5-flash',
    minimize_to_tray: '1',
    port: '4747',
    cloud_url: '',
    cloud_pin: '',
    cloud_sync_enabled: '0',
    last_cloud_sync: '',
    session_secret: crypto.randomBytes(32).toString('hex'),
  };
  for (const [k, v] of Object.entries(defaults)) {
    setSettingIfMissing(db, k, v);
  }
}

export function seedIfEmpty(db) {
  const seededRow = db.prepare("SELECT value FROM app_settings WHERE key = 'seeded'").get();
  if (seededRow?.value === '1') {
    ensureDefaultSettings(db);
    return;
  }

  const orderCount = db.prepare('SELECT COUNT(*) AS cnt FROM orders').get();
  if (Number(orderCount?.cnt ?? 0) > 0) {
    setSettingIfMissing(db, 'seeded', '1');
    ensureDefaultSettings(db);
    return;
  }

  seedHistoricalData(db);
}

export function seedHistoricalData(db) {
  const now = new Date().toISOString();

  withTransaction(db, () => {
    ensureDefaultSettings(db);

    const insertBaseline = db.prepare(`
      INSERT OR REPLACE INTO yearly_baselines (year, total_received, total_paid, total_profit, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of HISTORICAL_YEARLY_BASELINES) {
      insertBaseline.run(row.year, row.total_received, row.total_paid, row.total_profit, row.notes);
    }

    const clientMap = new Map();
    const editorMap = new Map();

    const getOrCreateClient = (rawName) => {
      const trimmed = String(rawName || '').trim();
      const norm = CLIENT_NORMALIZATION[rawName] || CLIENT_NORMALIZATION[trimmed];
      const canonical = norm ? norm.canonical : trimmed;
      const alias = norm ? norm.alias : '';

      if (clientMap.has(canonical)) {
        const existingId = clientMap.get(canonical);
        if (alias) {
          const row = db.prepare('SELECT aliases FROM clients WHERE id = ?').get(existingId);
          const parts = (row?.aliases || '').split(',').map((s) => s.trim()).filter(Boolean);
          if (!parts.includes(alias)) {
            parts.push(alias);
            db.prepare('UPDATE clients SET aliases = ? WHERE id = ?').run(parts.join(', '), existingId);
          }
        }
        return existingId;
      }

      const res = db
        .prepare(
          `INSERT INTO clients (name, aliases, default_billing_type, notes, created_at)
           VALUES (?, ?, 'one_off', '', ?)`
        )
        .run(canonical, alias, now);
      const id = Number(res.lastInsertRowid);
      clientMap.set(canonical, id);
      return id;
    };

    const getOrCreateEditor = (rawName) => {
      if (!rawName || !String(rawName).trim()) return null;
      const trimmed = String(rawName).trim();
      const canonical = EDITOR_NORMALIZATION[rawName] || EDITOR_NORMALIZATION[trimmed] || trimmed;

      if (editorMap.has(canonical)) return editorMap.get(canonical);

      const isSelf = canonical.toLowerCase() === 'owner' || canonical.toLowerCase() === 'self' ? 1 : 0;
      const res = db
        .prepare(
          `INSERT INTO editors (name, is_self, specialty, notes, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          canonical,
          isSelf,
          isSelf ? 'Owner / Writing / Design' : 'Editing & Production',
          '',
          now
        );
      const id = Number(res.lastInsertRowid);
      editorMap.set(canonical, id);
      return id;
    };

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_code, order_date, client_id, title, category, brief,
        billing_type, service_period, amount, production_status,
        production_deadline, payment_due_date, editor_id, editor_cost,
        editor_work_submitted, editor_submitted_at, needs_review, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'one_off', '', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPayment = db.prepare(`
      INSERT INTO client_payments (client_id, payment_date, amount, method, reference, notes, created_at)
      VALUES (?, ?, ?, 'UPI', ?, ?, ?)
    `);

    const insertPaymentAlloc = db.prepare(`
      INSERT INTO payment_allocations (payment_id, order_id, amount, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const insertPayout = db.prepare(`
      INSERT INTO editor_payouts (editor_id, payout_date, amount, method, reference, notes, created_at)
      VALUES (?, ?, ?, 'UPI', ?, ?, ?)
    `);

    const insertPayoutAlloc = db.prepare(`
      INSERT INTO editor_payout_allocations (payout_id, order_id, amount, created_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const row of HISTORICAL_ORDERS_2026) {
      const [
        orderCode,
        orderDate,
        rawClient,
        category,
        amountReceived,
        clientStatusCsv,
        rawEditor,
        editorPaid,
        editorStatusCsv,
        notes,
      ] = row;

      const clientId = getOrCreateClient(rawClient);
      const editorId = getOrCreateEditor(rawEditor);
      const orderNum = Number(orderCode.replace(/\D/g, '')) || 0;

      let productionStatus = 'Delivered';
      if (orderCode === 'SYN0009') productionStatus = 'Unassigned';
      else if (orderCode === 'SYN0010') productionStatus = 'Internal review';
      else if (orderCode === 'SYN0012') productionStatus = 'Editing';

      const editorCost = editorPaid != null ? Number(editorPaid) : 0;
      const editorWorkSubmitted = editorId != null && orderCode !== 'SYN0012' ? 1 : 0;
      const editorSubmittedAt = editorWorkSubmitted ? `${orderDate}T18:00:00.000Z` : null;
      const needsReview = orderNum >= 8 ? 1 : 0;

      const orderRes = insertOrder.run(
        orderCode,
        orderDate,
        clientId,
        category,
        category,
        '',
        amountReceived != null ? Number(amountReceived) : null,
        productionStatus,
        editorId,
        editorCost,
        editorWorkSubmitted,
        editorSubmittedAt,
        needsReview,
        notes || '',
        now,
        now
      );
      const orderId = Number(orderRes.lastInsertRowid);

      const hasClientReceipt =
        amountReceived != null &&
        Number(amountReceived) > 0 &&
        (clientStatusCsv === 'Completed' || orderCode === 'SYN0009');

      if (hasClientReceipt) {
        const amt = Number(amountReceived);
        const payRes = insertPayment.run(
          clientId,
          orderDate,
          amt,
          orderCode,
          `Sample receipt (${orderCode})`,
          now
        );
        const paymentId = Number(payRes.lastInsertRowid);
        insertPaymentAlloc.run(paymentId, orderId, amt, now);
      }

      if (editorId != null && editorCost > 0 && editorStatusCsv === 'Completed') {
        const payoutRes = insertPayout.run(
          editorId,
          orderDate,
          editorCost,
          orderCode,
          `Sample settled payout (${orderCode})`,
          now
        );
        const payoutId = Number(payoutRes.lastInsertRowid);
        insertPayoutAlloc.run(payoutId, orderId, editorCost, now);
      }
    }

    db.prepare(`UPDATE clients SET default_rate_shorts = 1500 WHERE name = 'Bloom Care'`).run();
    db.prepare(`UPDATE clients SET default_rate_shorts = 1200 WHERE name = 'Nova Fitness'`).run();
    db.prepare(`UPDATE editors SET default_rate_shorts = 650 WHERE name = 'Rohan'`).run();
    db.prepare(`UPDATE editors SET default_rate_shorts = 450 WHERE name = 'Kabir'`).run();

    db.prepare(
      `INSERT INTO activity_log (event_type, summary, entity_type, entity_id, created_at)
       VALUES ('migration', 'Initialized sample studio workspace (2025 baseline + SYN0001–SYN0012)', 'system', NULL, ?)`
    ).run(now);

    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('seeded', '1')`).run();
  });
}

export function resetToSeed(db) {
  withTransaction(db, () => {
    db.exec(`
      DELETE FROM activity_log;
      DELETE FROM expenses;
      DELETE FROM editor_payout_allocations;
      DELETE FROM editor_payouts;
      DELETE FROM payment_allocations;
      DELETE FROM client_payments;
      DELETE FROM orders;
      DELETE FROM editors;
      DELETE FROM clients;
      DELETE FROM yearly_baselines;
      DELETE FROM app_settings WHERE key = 'seeded';
    `);
  });
  seedHistoricalData(db);
}

/**
 * Clears transactional ledger data for a fresh accounting period (e.g. Jan 2027),
 * keeping or clearing the client & editor directory as requested without re-seeding sample data.
 */
export function resetForFreshStart(db, { keepClientsAndEditors = true } = {}) {
  withTransaction(db, () => {
    db.exec(`
      DELETE FROM activity_log;
      DELETE FROM expenses;
      DELETE FROM editor_payout_allocations;
      DELETE FROM editor_payouts;
      DELETE FROM payment_allocations;
      DELETE FROM client_payments;
      DELETE FROM orders;
      DELETE FROM yearly_baselines;
    `);
    if (!keepClientsAndEditors) {
      db.exec(`
        DELETE FROM editors;
        DELETE FROM clients;
      `);
    }
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('seeded', '1')`).run();
    db.prepare(
      `INSERT INTO activity_log (event_type, summary, entity_type, entity_id, created_at)
       VALUES ('fresh_start', ?, 'system', NULL, ?)`
    ).run(
      keepClientsAndEditors
        ? 'Cleared orders & financials for fresh ledger start (kept client & editor directory)'
        : 'Cleared all workspace records for blank start',
      new Date().toISOString()
    );
  });
}
