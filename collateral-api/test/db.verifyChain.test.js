const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db/schema');
const { appendEvent } = require('../src/db/appendEvent');
const { verifyChain } = require('../src/db/verifyChain');

function setupDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'A', 'a@x', 'h', 'Collateral Manager')`).run();
  db.prepare(`INSERT INTO collateral_agreements (id, counterparty, agreement_type, base_currency, threshold, minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold, status, effective_date, created_at, updated_at) VALUES ('AGR-1','CP','GMRA','EUR',0,10000,1000,'11:00',1000000,'active','2026-04-17',datetime('now'),datetime('now'))`).run();
  db.prepare(`INSERT INTO margin_calls (id, agreement_id, direction, call_date, exposure_amount, collateral_value, call_amount, currency, current_state, issued_at, four_eyes_required, deadline_at, created_at, updated_at) VALUES ('MC-1','AGR-1','issued','2026-04-17',1500000,1000000,500000,'EUR','draft',datetime('now'),0,'2026-04-17T11:00:00Z',datetime('now'),datetime('now'))`).run();
  return db;
}

test('verifyChain returns valid for a clean chain', () => {
  const db = setupDb();
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: { a: 1 }, expectedState: 'draft' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: { b: 2 }, expectedState: 'issued' });
  const result = verifyChain(db, 'MC-1');
  assert.equal(result.valid, true);
  assert.equal(result.brokenAt, null);
  assert.equal(result.eventCount, 2);
});

test('verifyChain returns valid for a margin call with no events', () => {
  const db = setupDb();
  const result = verifyChain(db, 'MC-1');
  assert.equal(result.valid, true);
  assert.equal(result.eventCount, 0);
});

test('verifyChain detects a tampered payload', () => {
  const db = setupDb();
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: { a: 1 }, expectedState: 'draft' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: { b: 2 }, expectedState: 'issued' });
  db.prepare(`UPDATE margin_call_events SET payload_json = '{"a":999}' WHERE event_type = 'issued'`).run();
  const result = verifyChain(db, 'MC-1');
  assert.equal(result.valid, false);
  assert.ok(result.brokenAt !== null);
});

test('verifyChain detects a tampered prev_hash linkage', () => {
  const db = setupDb();
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'draft' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'issued' });
  db.prepare(`UPDATE margin_call_events SET prev_hash = '${'f'.repeat(64)}' WHERE event_type = 'accepted'`).run();
  const result = verifyChain(db, 'MC-1');
  assert.equal(result.valid, false);
});

test('verifyChain returns null for missing margin call', () => {
  const db = setupDb();
  const result = verifyChain(db, 'MC-DOES-NOT-EXIST');
  assert.equal(result, null);
});
