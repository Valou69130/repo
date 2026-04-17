process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db/schema');
const { appendEvent } = require('../src/db/appendEvent');
const { scanDeadlines, scanIntegrity } = require('../src/ops/scanner');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'TM', 't@x', 'h', 'Treasury Manager')`).run();
  db.prepare(`
    INSERT INTO collateral_agreements
      (id, counterparty, agreement_type, governing_law, base_currency, threshold,
       minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold,
       status, effective_date)
    VALUES ('AGR-1','ACME','GMRA','English','EUR',0,10000,1000,'11:00',10000000,'active','2026-04-01')
  `).run();
  return db;
}

function insertCall(db, id, deadlineAt, state = 'issued') {
  db.prepare(`
    INSERT INTO margin_calls
      (id, agreement_id, direction, call_date, exposure_amount, collateral_value,
       call_amount, currency, current_state, issued_by_user_id, issued_at,
       four_eyes_required, deadline_at)
    VALUES (?, 'AGR-1', 'received', '2026-04-17', 1000000, 0, 500000, 'EUR', 'draft', 1, ?, 0, ?)
  `).run(id, '2026-04-17T00:00:00Z', deadlineAt);
  // seed genesis via appendEvent so the chain is real; then jump to target state.
  appendEvent(db, {
    marginCallId: id,
    eventType: 'issued',
    actor: { id: 1, type: 'user' },
    payload: { callAmount: 500000, currency: 'EUR', direction: 'received' },
  });
  if (state !== 'issued') {
    db.prepare(`UPDATE margin_calls SET current_state = ? WHERE id = ?`).run(state, id);
  }
}

// ── scanDeadlines ─────────────────────────────────────────────────────

test('scanDeadlines — emits deadline_breached for overdue issued calls', () => {
  const db = makeDb();
  insertCall(db, 'MC-OVERDUE', '2026-04-17T09:00:00Z', 'issued');
  insertCall(db, 'MC-FUTURE',  '2030-01-01T12:00:00Z', 'issued');

  const now = new Date('2026-04-17T12:00:00Z');
  const res = scanDeadlines(db, now);
  assert.equal(res.breachedCount, 1);

  const breachEvent = db.prepare(
    `SELECT * FROM margin_call_events WHERE margin_call_id = 'MC-OVERDUE' AND event_type = 'deadline_breached'`
  ).get();
  assert.ok(breachEvent, 'deadline_breached event written');

  const futureCheck = db.prepare(
    `SELECT * FROM margin_call_events WHERE margin_call_id = 'MC-FUTURE' AND event_type = 'deadline_breached'`
  ).get();
  assert.equal(futureCheck, undefined);
});

test('scanDeadlines — idempotent (second run does not double-emit)', () => {
  const db = makeDb();
  insertCall(db, 'MC-OD', '2026-04-17T09:00:00Z', 'issued');
  const now = new Date('2026-04-17T12:00:00Z');
  scanDeadlines(db, now);
  const res = scanDeadlines(db, now);
  assert.equal(res.breachedCount, 0);
  const count = db.prepare(
    `SELECT COUNT(*) AS c FROM margin_call_events WHERE margin_call_id='MC-OD' AND event_type='deadline_breached'`
  ).get().c;
  assert.equal(count, 1);
});

test('scanDeadlines — skips terminal states (resolved/cancelled)', () => {
  const db = makeDb();
  insertCall(db, 'MC-CANCELLED', '2026-04-17T09:00:00Z', 'cancelled');
  db.prepare(`UPDATE margin_calls SET current_state='cancelled' WHERE id='MC-CANCELLED'`).run();
  const res = scanDeadlines(db, new Date('2026-04-17T12:00:00Z'));
  assert.equal(res.breachedCount, 0);
});

test('scanDeadlines — writes a Warning notification listing breached IDs', () => {
  const db = makeDb();
  insertCall(db, 'MC-A', '2026-04-17T09:00:00Z', 'issued');
  insertCall(db, 'MC-B', '2026-04-17T09:30:00Z', 'issued');
  scanDeadlines(db, new Date('2026-04-17T12:00:00Z'));
  const row = db.prepare(`SELECT severity, text FROM notifications ORDER BY id DESC LIMIT 1`).get();
  assert.equal(row.severity, 'Warning');
  assert.ok(row.text.includes('MC-A'));
  assert.ok(row.text.includes('MC-B'));
});

// ── scanIntegrity ─────────────────────────────────────────────────────

test('scanIntegrity — all calls valid on clean DB', () => {
  const db = makeDb();
  insertCall(db, 'MC-1', '2026-04-17T09:00:00Z');
  insertCall(db, 'MC-2', '2026-04-17T09:00:00Z');
  const res = scanIntegrity(db);
  assert.equal(res.scanned, 2);
  assert.deepEqual(res.broken, []);
});

test('scanIntegrity — detects tampering and writes Critical notification', () => {
  const db = makeDb();
  insertCall(db, 'MC-T', '2026-04-17T09:00:00Z');
  // Tamper with the genesis event
  db.prepare(`UPDATE margin_call_events SET payload_json = '{"hacked":true}' WHERE margin_call_id = 'MC-T'`).run();
  const res = scanIntegrity(db);
  assert.equal(res.scanned, 1);
  assert.deepEqual(res.broken, ['MC-T']);
  const row = db.prepare(`SELECT severity, text FROM notifications ORDER BY id DESC LIMIT 1`).get();
  assert.equal(row.severity, 'Critical');
  assert.ok(row.text.includes('MC-T'));
});
