const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { initSchema } = require('../src/db/schema');

const NEW_TABLES = [
  'collateral_agreements',
  'eligibility_schedules',
  'haircut_schedules',
  'margin_calls',
  'margin_call_events',
  'disputes',
  'approvals',
  'idempotency_keys',
];

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

test('all 8 new tables exist after initSchema', () => {
  const db = freshDb();
  for (const t of NEW_TABLES) {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
    assert.ok(row, `expected table ${t} to exist`);
  }
  assert.equal(NEW_TABLES.length, 8, 'expected 8 table assertions');
});

test('initSchema is idempotent (re-running does not throw)', () => {
  const db = freshDb();
  assert.doesNotThrow(() => initSchema(db));
  assert.doesNotThrow(() => initSchema(db));
});

test('margin_call_events has the audit-spine columns', () => {
  const db = freshDb();
  const cols = db.prepare(`PRAGMA table_info(margin_call_events)`).all().map((r) => r.name);
  for (const c of [
    'id', 'margin_call_id', 'event_type', 'occurred_at',
    'actor_user_id', 'actor_type', 'payload_json', 'prev_hash', 'hash',
  ]) {
    assert.ok(cols.includes(c), `expected column ${c} on margin_call_events`);
  }
});

test('margin_calls has current_state cache + four_eyes_required + deadline_at', () => {
  const db = freshDb();
  const cols = db.prepare(`PRAGMA table_info(margin_calls)`).all().map((r) => r.name);
  for (const c of [
    'id', 'agreement_id', 'direction', 'call_date', 'exposure_amount',
    'collateral_value', 'call_amount', 'currency', 'current_state',
    'issued_by_user_id', 'issued_at', 'resolved_at', 'settlement_ref',
    'four_eyes_required', 'deadline_at',
  ]) {
    assert.ok(cols.includes(c), `expected column ${c} on margin_calls`);
  }
});

test('idempotency_keys has composite PK', () => {
  const db = freshDb();
  const cols = db.prepare(`PRAGMA table_info(idempotency_keys)`).all();
  const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name).sort();
  assert.deepEqual(pkCols, ['actor_user_id', 'endpoint', 'idempotency_key']);
});

test('foreign keys are honoured (margin_call_events references margin_calls)', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO collateral_agreements (id, counterparty, agreement_type, base_currency, threshold, minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold, status, effective_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('AGR-1', 'CP', 'GMRA', 'EUR', 0, 10000, 1000, '11:00', 1000000, 'active', '2026-04-17', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z');
  db.prepare(`INSERT INTO margin_calls (id, agreement_id, direction, call_date, exposure_amount, collateral_value, call_amount, currency, current_state, issued_at, four_eyes_required, deadline_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('MC-1', 'AGR-1', 'issued', '2026-04-17', 1000, 0, 1000, 'EUR', 'draft', '2026-04-17T00:00:00Z', 0, '2026-04-17T11:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z');
  assert.throws(() => {
    db.prepare(`INSERT INTO margin_call_events (margin_call_id, event_type, occurred_at, actor_type, payload_json, prev_hash, hash) VALUES (?,?,?,?,?,?,?)`)
      .run('MC-DOESNT-EXIST', 'issued', '2026-04-17T00:00:00Z', 'user', '{}', '0', 'abc');
  }, /FOREIGN KEY/);
});
