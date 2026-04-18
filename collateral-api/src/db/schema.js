const Database = require('better-sqlite3');
const path = require('path');
const { seedDemoData } = require('./demoData');

let db;
function getDb() {
  if (!db) {
    const isServerlessRuntime = process.env.VERCEL === '1' || Boolean(process.env.AWS_EXECUTION_ENV);
    const dbPath =
      process.env.COLLATERAL_DB_PATH ||
      (isServerlessRuntime
        ? '/tmp/collateral-demo.db'
        : path.join(__dirname, '../../data.db'));
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    ensureSeedData(db);
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      isin TEXT NOT NULL,
      name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      market_value REAL NOT NULL,
      haircut REAL NOT NULL,
      eligibility TEXT NOT NULL,
      custody TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available',
      integration_json TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      counterparty TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      rate REAL NOT NULL,
      start_date TEXT NOT NULL,
      maturity_date TEXT NOT NULL,
      state TEXT NOT NULL,
      required_collateral REAL NOT NULL,
      posted_collateral REAL NOT NULL,
      buffer REAL NOT NULL,
      settlement TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      integration_json TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS repo_assets (
      repo_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      PRIMARY KEY (repo_id, asset_id),
      FOREIGN KEY (repo_id) REFERENCES repos(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL,
      text TEXT NOT NULL,
      target TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      object TEXT NOT NULL,
      prev_state TEXT NOT NULL,
      next_state TEXT NOT NULL,
      comment TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collateral_agreements (
      id TEXT PRIMARY KEY,
      counterparty TEXT NOT NULL,
      agreement_type TEXT NOT NULL CHECK (agreement_type IN ('GMRA','CSA')),
      governing_law TEXT,
      base_currency TEXT NOT NULL,
      threshold REAL NOT NULL DEFAULT 0,
      minimum_transfer_amount REAL NOT NULL DEFAULT 0,
      rounding REAL NOT NULL DEFAULT 1,
      call_notice_deadline_time TEXT NOT NULL DEFAULT '11:00',
      four_eyes_threshold REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','terminated')),
      effective_date TEXT NOT NULL,
      termination_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eligibility_schedules (
      id TEXT PRIMARY KEY,
      agreement_id TEXT NOT NULL,
      name TEXT NOT NULL,
      criteria_json TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (agreement_id) REFERENCES collateral_agreements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS haircut_schedules (
      id TEXT PRIMARY KEY,
      agreement_id TEXT NOT NULL,
      eligibility_schedule_id TEXT,
      criteria_json TEXT NOT NULL,
      haircut REAL NOT NULL,
      FOREIGN KEY (agreement_id) REFERENCES collateral_agreements(id) ON DELETE CASCADE,
      FOREIGN KEY (eligibility_schedule_id) REFERENCES eligibility_schedules(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS margin_calls (
      id TEXT PRIMARY KEY,
      agreement_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('issued','received')),
      call_date TEXT NOT NULL,
      exposure_amount REAL NOT NULL,
      collateral_value REAL NOT NULL,
      call_amount REAL NOT NULL,
      currency TEXT NOT NULL,
      current_state TEXT NOT NULL DEFAULT 'draft',
      issued_by_user_id INTEGER,
      issued_at TEXT NOT NULL,
      resolved_at TEXT,
      settlement_ref TEXT,
      four_eyes_required INTEGER NOT NULL DEFAULT 0,
      deadline_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agreement_id) REFERENCES collateral_agreements(id),
      FOREIGN KEY (issued_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS margin_call_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      margin_call_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user','agent','system')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      FOREIGN KEY (margin_call_id) REFERENCES margin_calls(id),
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_mce_call_id_id ON margin_call_events(margin_call_id, id);

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      margin_call_id TEXT NOT NULL,
      opened_by_user_id INTEGER NOT NULL,
      opened_at TEXT NOT NULL,
      reason_code TEXT NOT NULL CHECK (reason_code IN ('valuation','portfolio','eligibility','settlement','other')),
      their_proposed_value REAL,
      our_proposed_value REAL,
      delta REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','agreed','withdrawn','escalated')),
      resolution_note TEXT,
      resolved_at TEXT,
      FOREIGN KEY (margin_call_id) REFERENCES margin_calls(id),
      FOREIGN KEY (opened_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('margin_call_accept','margin_call_dispute_agree','margin_call_issue','margin_call_cancel')),
      entity_id TEXT NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      requested_at TEXT NOT NULL,
      approved_by_user_id INTEGER,
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','granted','rejected')),
      rejection_reason TEXT,
      FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_approvals_entity ON approvals(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_pending ON approvals(status) WHERE status='pending';

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idempotency_key TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      response_json TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (idempotency_key, actor_user_id, endpoint)
    );
  `);

  // Additive migrations — safe to run on existing databases
  try { db.exec(`ALTER TABLE assets ADD COLUMN integration_json TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE repos  ADD COLUMN integration_json TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE audit_events ADD COLUMN hash TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE notifications ADD COLUMN read INTEGER NOT NULL DEFAULT 0`); } catch {}
}

function ensureSeedData(db) {
  const hasUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0;
  const hasAssets = db.prepare('SELECT COUNT(*) AS count FROM assets').get().count > 0;
  if (!hasUsers || !hasAssets) {
    seedDemoData(db, { includeUsers: true });
    return;
  }
  // Upsert any demo users missing from this instance (e.g. new roles added after warm start)
  const bcrypt = require('bcryptjs');
  const { USERS } = require('./demoData');
  const upsert = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role, must_change_password)
    VALUES (?, ?, ?, ?, 0)
  `);
  for (const u of USERS) {
    upsert.run(u.name, u.email, bcrypt.hashSync(u.password, 10), u.role);
  }
  // Clear forced password-change for all demo accounts so users can log straight in
  db.prepare(`UPDATE users SET must_change_password = 0 WHERE email IN (${USERS.map(() => '?').join(',')})`).run(USERS.map(u => u.email));
}

module.exports = { getDb, closeDb, initSchema };
