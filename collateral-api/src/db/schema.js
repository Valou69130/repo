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
  `);

  // Additive migrations — safe to run on existing databases
  try { db.exec(`ALTER TABLE assets ADD COLUMN integration_json TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE repos  ADD COLUMN integration_json TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE audit_events ADD COLUMN hash TEXT NOT NULL DEFAULT ''`); } catch {}
}

function ensureSeedData(db) {
  const hasUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0;
  const hasAssets = db.prepare('SELECT COUNT(*) AS count FROM assets').get().count > 0;
  if (!hasUsers || !hasAssets) {
    seedDemoData(db, { includeUsers: true });
  }
}

module.exports = { getDb, closeDb };
