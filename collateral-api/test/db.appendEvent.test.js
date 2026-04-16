const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db/schema');
const { appendEvent } = require('../src/db/appendEvent');
const { ConflictError, NotFoundError } = require('../src/db/errors');
const { GENESIS_HASH, sha256, stableStringify } = require('../src/db/hash');

function setupDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'Alice', 'a@x', 'h', 'Collateral Manager')`).run();
  db.prepare(`INSERT INTO collateral_agreements (id, counterparty, agreement_type, base_currency, threshold, minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold, status, effective_date, created_at, updated_at) VALUES ('AGR-1','CP','GMRA','EUR',0,10000,1000,'11:00',1000000,'active','2026-04-17',datetime('now'),datetime('now'))`).run();
  db.prepare(`INSERT INTO margin_calls (id, agreement_id, direction, call_date, exposure_amount, collateral_value, call_amount, currency, current_state, issued_at, four_eyes_required, deadline_at, created_at, updated_at) VALUES ('MC-1','AGR-1','issued','2026-04-17',1500000,1000000,500000,'EUR','draft',datetime('now'),0,'2026-04-17T11:00:00Z',datetime('now'),datetime('now'))`).run();
  return db;
}

test('appendEvent writes event with prev_hash = GENESIS_HASH for first event', () => {
  const db = setupDb();
  const result = appendEvent(db, {
    marginCallId: 'MC-1',
    eventType: 'issued',
    actor: { id: 1, type: 'user' },
    payload: { foo: 'bar' },
    expectedState: 'draft',
  });
  assert.equal(result.eventType, 'issued');
  assert.equal(result.prevHash, GENESIS_HASH);
  assert.match(result.hash, /^[0-9a-f]{64}$/);
  const call = db.prepare(`SELECT current_state FROM margin_calls WHERE id=?`).get('MC-1');
  assert.equal(call.current_state, 'issued');
});

test('appendEvent chains hashes correctly across multiple events', () => {
  const db = setupDb();
  const e1 = appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'draft' });
  const e2 = appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'issued' });
  assert.equal(e2.prevHash, e1.hash);
  assert.notEqual(e2.hash, e1.hash);
});

test('appendEvent computes hash deterministically from inputs', () => {
  const db = setupDb();
  const occurredAtFixed = '2026-04-17T10:00:00.000Z';
  const result = appendEvent(db, {
    marginCallId: 'MC-1',
    eventType: 'issued',
    actor: { id: 1, type: 'user' },
    payload: { foo: 'bar' },
    expectedState: 'draft',
    occurredAt: occurredAtFixed,
  });
  const expected = sha256(GENESIS_HASH + 'issued' + occurredAtFixed + '1' + stableStringify({ foo: 'bar' }));
  assert.equal(result.hash, expected);
});

test('appendEvent throws ConflictError when expectedState mismatches', () => {
  const db = setupDb();
  assert.throws(
    () => appendEvent(db, {
      marginCallId: 'MC-1',
      eventType: 'accepted',
      actor: { id: 1, type: 'user' },
      payload: {},
      expectedState: 'agreed',
    }),
    (err) => err instanceof ConflictError && err.details.currentState === 'draft',
  );
});

test('appendEvent throws ConflictError on invalid transition', () => {
  const db = setupDb();
  assert.throws(
    () => appendEvent(db, {
      marginCallId: 'MC-1',
      eventType: 'settled',
      actor: { id: 1, type: 'user' },
      payload: {},
      expectedState: 'draft',
    }),
    (err) => err instanceof ConflictError,
  );
});

test('appendEvent throws NotFoundError when margin call missing', () => {
  const db = setupDb();
  assert.throws(
    () => appendEvent(db, {
      marginCallId: 'MC-DOES-NOT-EXIST',
      eventType: 'issued',
      actor: { id: 1, type: 'user' },
      payload: {},
      expectedState: 'draft',
    }),
    (err) => err instanceof NotFoundError,
  );
});

test('appendEvent rolls back on transaction failure (no event written, no state change)', () => {
  const db = setupDb();
  assert.throws(
    () => appendEvent(db, {
      marginCallId: 'MC-1',
      eventType: 'issued',
      actor: { id: 99999, type: 'user' },
      payload: {},
      expectedState: 'draft',
    }),
    /FOREIGN KEY/,
  );
  const call = db.prepare(`SELECT current_state FROM margin_calls WHERE id=?`).get('MC-1');
  assert.equal(call.current_state, 'draft');
  const events = db.prepare(`SELECT COUNT(*) AS n FROM margin_call_events WHERE margin_call_id=?`).get('MC-1');
  assert.equal(events.n, 0);
});

test('appendEvent supports actor_type=agent with null actor.id', () => {
  const db = setupDb();
  const result = appendEvent(db, {
    marginCallId: 'MC-1',
    eventType: 'commented',
    actor: { id: null, type: 'agent' },
    payload: { note: 'AI suggests reviewing exposure' },
    expectedState: 'draft',
  });
  assert.equal(result.eventType, 'commented');
  const call = db.prepare(`SELECT current_state FROM margin_calls WHERE id=?`).get('MC-1');
  assert.equal(call.current_state, 'draft');
});

test('appendEvent rejects terminal-state transitions', () => {
  const db = setupDb();
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'draft' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'issued' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'delivery_marked', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'agreed' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'settled', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'delivered' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'resolved', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'settled' });
  assert.throws(
    () => appendEvent(db, { marginCallId: 'MC-1', eventType: 'commented', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'resolved' }),
    /terminal state/,
  );
});
