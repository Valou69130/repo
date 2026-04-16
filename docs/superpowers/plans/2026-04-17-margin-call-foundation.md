# Margin Call Lifecycle — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the unshakable foundation for the Phase 1 margin call lifecycle: 8 new tables (7 domain + 1 supporting `idempotency_keys`), the central `appendEvent` helper with hash-chained audit, the state-transition map, and the new permission + role widening — all backed by tests.

**Architecture:** Server-authoritative event-sourced design. Every state change funnels through one `appendEvent` helper that (a) verifies optimistic-concurrency `expected_state`, (b) computes a SHA-256 hash linked to the previous event, and (c) updates the denormalised `current_state` cache — all in a single SQLite transaction. Subsequent plans (agreements CRUD, margin call routes, disputes, four-eyes, AI advisor, UI) all build on this foundation.

**Tech Stack:** Node.js + Express + better-sqlite3 + node:test (Node's built-in runner) + CommonJS. No new runtime dependencies — `crypto` is a Node built-in.

**Spec:** [docs/superpowers/specs/2026-04-17-margin-call-lifecycle-design.md](../specs/2026-04-17-margin-call-lifecycle-design.md)

**Plan chain (this is plan 1 of 8):**
1. **Foundation** ← this plan
2. Agreements & Schedules CRUD
3. Margin Call core (happy path: create → issue → accept → deliver → settle)
4. Disputes sub-workflow
5. Four-eyes / Approvals
6. AI advisor + deadline cron + nightly integrity scan
7. UI rewrite (TanStack Query, server-bound pages)
8. Backfill + demo seed + cutover (drop client-side state ownership; remove `assets.eligibility TEXT`)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `collateral-api/src/db/schema.js` | **Modify** | Add 8 new `CREATE TABLE` blocks inside `initSchema(db)` |
| `collateral-api/src/db/hash.js` | **Create** | `sha256()`, `stableStringify()`, `GENESIS_HASH` constant |
| `collateral-api/src/db/transitions.js` | **Create** | `stateForEvent(event, current)` and `allowedTransitions(current)` — pure functions |
| `collateral-api/src/db/errors.js` | **Create** | `ConflictError`, `NotFoundError`, `ForbiddenError` typed errors |
| `collateral-api/src/db/appendEvent.js` | **Create** | The single mutation funnel; transactional, hash-chained, concurrency-checked |
| `collateral-api/src/db/verifyChain.js` | **Create** | `verifyChain(db, marginCallId)` — replays hashes, returns `{valid, brokenAt}` |
| `collateral-api/src/middleware/auth.js` | **Modify** | Add 8 new permission flags to `ROLE_PERMS`; introduce `Credit Approver` role |
| `collateral-api/test/db.hash.test.js` | **Create** | sha256 + stableStringify + genesis |
| `collateral-api/test/db.transitions.test.js` | **Create** | Every (state × event) combination, valid + invalid |
| `collateral-api/test/db.schema.test.js` | **Create** | All 8 tables + columns exist; idempotent re-init |
| `collateral-api/test/db.appendEvent.test.js` | **Create** | Hash chain integrity, optimistic concurrency, transaction atomicity |
| `collateral-api/test/db.verifyChain.test.js` | **Create** | Detects mutated event; passes on clean chain |
| `collateral-api/test/middleware.auth.test.js` | **Create** | New perms + Credit Approver role recognised |

---

## Task 1: Hash utility module

Pure module — no DB. Foundation for everything that follows.

**Files:**
- Create: `collateral-api/src/db/hash.js`
- Test: `collateral-api/test/db.hash.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/db.hash.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, stableStringify, GENESIS_HASH } = require('../src/db/hash');

test('sha256 returns 64-char hex', () => {
  const h = sha256('hello');
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('sha256 is deterministic', () => {
  assert.equal(sha256('abc'), sha256('abc'));
});

test('GENESIS_HASH is a 64-char hex zero-prefix sentinel', () => {
  assert.equal(GENESIS_HASH.length, 64);
  assert.match(GENESIS_HASH, /^[0-9a-f]{64}$/);
});

test('stableStringify produces same output regardless of key order', () => {
  const a = stableStringify({ b: 1, a: 2, c: { y: 1, x: 2 } });
  const b = stableStringify({ a: 2, c: { x: 2, y: 1 }, b: 1 });
  assert.equal(a, b);
});

test('stableStringify handles arrays, numbers, strings, null, booleans', () => {
  const out = stableStringify({ s: 'x', n: 1, b: true, z: null, arr: [3, 1, 2] });
  assert.equal(out, '{"arr":[3,1,2],"b":true,"n":1,"s":"x","z":null}');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/db.hash.test.js`
Expected: FAIL — `Cannot find module '../src/db/hash'`

- [ ] **Step 3: Write the implementation**

```js
// collateral-api/src/db/hash.js
const crypto = require('node:crypto');

const GENESIS_HASH = '0'.repeat(64);

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]));
  return '{' + parts.join(',') + '}';
}

module.exports = { sha256, stableStringify, GENESIS_HASH };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collateral-api && node --test test/db.hash.test.js`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/db/hash.js collateral-api/test/db.hash.test.js
git commit -m "feat(margin-foundation): hash + stable-stringify utilities

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: State transition map

Pure module — encodes the state machine from the spec. No DB, no side effects.

**Files:**
- Create: `collateral-api/src/db/transitions.js`
- Test: `collateral-api/test/db.transitions.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/db.transitions.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { stateForEvent, allowedTransitions, STATES, EVENTS } = require('../src/db/transitions');

test('STATES enumerates the nine spec states', () => {
  assert.deepEqual(STATES.sort(), [
    'agreed', 'cancelled', 'delivered', 'disputed', 'draft',
    'issued', 'pending_four_eyes', 'resolved', 'settled',
  ]);
});

test('stateForEvent: draft + issue (under threshold) → issued', () => {
  assert.equal(stateForEvent('issued', 'draft'), 'issued');
});

test('stateForEvent: draft + four_eyes_requested → pending_four_eyes', () => {
  assert.equal(stateForEvent('four_eyes_requested', 'draft'), 'pending_four_eyes');
});

test('stateForEvent: issued + accepted → agreed', () => {
  assert.equal(stateForEvent('accepted', 'issued'), 'agreed');
});

test('stateForEvent: pending_four_eyes + four_eyes_granted → agreed', () => {
  assert.equal(stateForEvent('four_eyes_granted', 'pending_four_eyes'), 'agreed');
});

test('stateForEvent: pending_four_eyes + four_eyes_rejected → disputed', () => {
  assert.equal(stateForEvent('four_eyes_rejected', 'pending_four_eyes'), 'disputed');
});

test('stateForEvent: issued + dispute_opened → disputed', () => {
  assert.equal(stateForEvent('dispute_opened', 'issued'), 'disputed');
});

test('stateForEvent: disputed + dispute_agreed → agreed', () => {
  assert.equal(stateForEvent('dispute_agreed', 'disputed'), 'agreed');
});

test('stateForEvent: disputed + dispute_withdrawn → cancelled', () => {
  assert.equal(stateForEvent('dispute_withdrawn', 'disputed'), 'cancelled');
});

test('stateForEvent: agreed + delivery_marked → delivered', () => {
  assert.equal(stateForEvent('delivery_marked', 'agreed'), 'delivered');
});

test('stateForEvent: delivered + settled → settled', () => {
  assert.equal(stateForEvent('settled', 'delivered'), 'settled');
});

test('stateForEvent: settled + resolved → resolved', () => {
  assert.equal(stateForEvent('resolved', 'settled'), 'resolved');
});

test('stateForEvent: any non-terminal + cancelled → cancelled', () => {
  for (const s of ['draft', 'issued', 'pending_four_eyes', 'agreed', 'delivered', 'disputed']) {
    assert.equal(stateForEvent('cancelled', s), 'cancelled', `from ${s}`);
  }
});

test('stateForEvent: comment / deadline_breached / dispute_proposed / dispute_escalated do not change state', () => {
  for (const e of ['commented', 'deadline_breached', 'dispute_proposed', 'dispute_escalated']) {
    assert.equal(stateForEvent(e, 'issued'), 'issued');
    assert.equal(stateForEvent(e, 'disputed'), 'disputed');
  }
});

test('stateForEvent: terminal states reject any progressing event', () => {
  for (const terminal of ['resolved', 'cancelled']) {
    assert.throws(
      () => stateForEvent('accepted', terminal),
      /terminal state/,
    );
  }
});

test('stateForEvent: invalid transitions throw', () => {
  assert.throws(() => stateForEvent('settled', 'draft'), /invalid transition/);
  assert.throws(() => stateForEvent('accepted', 'agreed'), /invalid transition/);
  assert.throws(() => stateForEvent('delivery_marked', 'issued'), /invalid transition/);
});

test('allowedTransitions returns valid next events for a given state', () => {
  const fromIssued = allowedTransitions('issued');
  assert.ok(fromIssued.includes('accepted'));
  assert.ok(fromIssued.includes('dispute_opened'));
  assert.ok(fromIssued.includes('four_eyes_requested'));
  assert.ok(fromIssued.includes('cancelled'));
  assert.ok(!fromIssued.includes('settled'));
});

test('allowedTransitions returns empty array for terminal states', () => {
  assert.deepEqual(allowedTransitions('resolved'), []);
  assert.deepEqual(allowedTransitions('cancelled'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/db.transitions.test.js`
Expected: FAIL — `Cannot find module '../src/db/transitions'`

- [ ] **Step 3: Write the implementation**

```js
// collateral-api/src/db/transitions.js

const STATES = [
  'draft', 'issued', 'pending_four_eyes', 'disputed',
  'agreed', 'delivered', 'settled', 'resolved', 'cancelled',
];

const TERMINAL = new Set(['resolved', 'cancelled']);

const EVENTS = [
  'issued', 'accepted', 'four_eyes_requested', 'four_eyes_granted', 'four_eyes_rejected',
  'dispute_opened', 'dispute_proposed', 'dispute_agreed', 'dispute_withdrawn', 'dispute_escalated',
  'delivery_marked', 'settled', 'resolved', 'cancelled',
  'commented', 'deadline_breached',
];

// state-changing transitions: { [currentState]: { [event]: nextState } }
const TRANSITIONS = {
  draft: {
    issued: 'issued',
    four_eyes_requested: 'pending_four_eyes',
    cancelled: 'cancelled',
  },
  issued: {
    accepted: 'agreed',
    four_eyes_requested: 'pending_four_eyes',
    dispute_opened: 'disputed',
    cancelled: 'cancelled',
  },
  pending_four_eyes: {
    four_eyes_granted: 'agreed',
    four_eyes_rejected: 'disputed',
    cancelled: 'cancelled',
  },
  disputed: {
    dispute_agreed: 'agreed',
    dispute_withdrawn: 'cancelled',
    four_eyes_requested: 'pending_four_eyes',
    cancelled: 'cancelled',
  },
  agreed: {
    delivery_marked: 'delivered',
    cancelled: 'cancelled',
  },
  delivered: {
    settled: 'settled',
    cancelled: 'cancelled',
  },
  settled: {
    resolved: 'resolved',
  },
  resolved: {},
  cancelled: {},
};

// non-state-changing events allowed from any non-terminal state
const NON_PROGRESSING = new Set(['commented', 'deadline_breached', 'dispute_proposed', 'dispute_escalated']);

function stateForEvent(event, currentState) {
  if (TERMINAL.has(currentState)) {
    throw new Error(`Cannot apply event '${event}' to terminal state '${currentState}'`);
  }
  if (NON_PROGRESSING.has(event)) {
    return currentState;
  }
  const next = TRANSITIONS[currentState]?.[event];
  if (!next) {
    throw new Error(`invalid transition: event '${event}' not allowed from state '${currentState}'`);
  }
  return next;
}

function allowedTransitions(currentState) {
  if (TERMINAL.has(currentState)) return [];
  return Object.keys(TRANSITIONS[currentState] ?? {});
}

module.exports = { STATES, EVENTS, TRANSITIONS, stateForEvent, allowedTransitions };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collateral-api && node --test test/db.transitions.test.js`
Expected: PASS — all transition tests green.

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/db/transitions.js collateral-api/test/db.transitions.test.js
git commit -m "feat(margin-foundation): state transition map

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Typed errors

Tiny module — used by `appendEvent` and (in subsequent plans) by route handlers to map cleanly to HTTP status codes.

**Files:**
- Create: `collateral-api/src/db/errors.js`

- [ ] **Step 1: Write the implementation**

```js
// collateral-api/src/db/errors.js

class DomainError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details ?? null;
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Not found', details) {
    super(message, details);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ConflictError extends DomainError {
  constructor(message = 'Conflict', details) {
    super(message, details);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden', details) {
    super(message, details);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

module.exports = { DomainError, NotFoundError, ConflictError, ForbiddenError };
```

- [ ] **Step 2: Commit**

```bash
git add collateral-api/src/db/errors.js
git commit -m "feat(margin-foundation): typed domain errors

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

(No test file for this trivial module — it's covered indirectly by `appendEvent` tests in Task 5.)

---

## Task 4: Schema additions — 8 new tables

Add the 7 domain tables + `idempotency_keys` to `initSchema(db)` in `db/schema.js`. Tables are additive; no existing data is touched.

**Files:**
- Modify: `collateral-api/src/db/schema.js` (within the `initSchema` function, after the existing `CREATE TABLE` blocks)
- Test: `collateral-api/test/db.schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/db.schema.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

// initSchema is not exported today; we'll add it in Step 3.
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
  // Insert a margin call first so the FK target exists
  db.prepare(`INSERT INTO collateral_agreements (id, counterparty, agreement_type, base_currency, threshold, minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold, status, effective_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('AGR-1', 'CP', 'GMRA', 'EUR', 0, 10000, 1000, '11:00', 1000000, 'active', '2026-04-17', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z');
  db.prepare(`INSERT INTO margin_calls (id, agreement_id, direction, call_date, exposure_amount, collateral_value, call_amount, currency, current_state, issued_at, four_eyes_required, deadline_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('MC-1', 'AGR-1', 'issued', '2026-04-17', 1000, 0, 1000, 'EUR', 'draft', '2026-04-17T00:00:00Z', 0, '2026-04-17T11:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z');
  // Insert with a bad FK should fail
  assert.throws(() => {
    db.prepare(`INSERT INTO margin_call_events (margin_call_id, event_type, occurred_at, actor_type, payload_json, prev_hash, hash) VALUES (?,?,?,?,?,?,?)`)
      .run('MC-DOESNT-EXIST', 'issued', '2026-04-17T00:00:00Z', 'user', '{}', '0', 'abc');
  }, /FOREIGN KEY/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/db.schema.test.js`
Expected: FAIL — either `initSchema` not exported, or new tables missing.

- [ ] **Step 3: Modify schema.js**

Edit [collateral-api/src/db/schema.js](../../../collateral-api/src/db/schema.js). Two changes:

(a) Export `initSchema` (currently not exported):

Replace the bottom-of-file `module.exports = { getDb, closeDb }` line with:

```js
module.exports = { getDb, closeDb, initSchema };
```

(b) Add the 9 new `CREATE TABLE` blocks inside the `initSchema(db)` function, appended at the end of the existing `db.exec(\`...\`)` block (just before its closing `\`);`):

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collateral-api && node --test test/db.schema.test.js`
Expected: PASS — all 6 schema tests green. Also re-run the existing route tests to confirm no regression: `node --test test/routes.test.js`. Expected: PASS unchanged.

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/db/schema.js collateral-api/test/db.schema.test.js
git commit -m "feat(margin-foundation): add 8 tables for margin call lifecycle

Adds collateral_agreements, eligibility_schedules, haircut_schedules,
margin_calls, margin_call_events, disputes, approvals, idempotency_keys.
Foreign keys enforced; indexes added for hot queries.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: appendEvent helper — the single mutation funnel

This is the load-bearing function. Every state change in every route (in plans 2–6) calls it. Wraps optimistic concurrency, hash chain write, and `current_state` cache update in one SQLite transaction.

**Files:**
- Create: `collateral-api/src/db/appendEvent.js`
- Test: `collateral-api/test/db.appendEvent.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/db.appendEvent.test.js
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
  // Minimal user
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'Alice', 'a@x', 'h', 'Collateral Manager')`).run();
  // Minimal agreement
  db.prepare(`INSERT INTO collateral_agreements (id, counterparty, agreement_type, base_currency, threshold, minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold, status, effective_date, created_at, updated_at) VALUES ('AGR-1','CP','GMRA','EUR',0,10000,1000,'11:00',1000000,'active','2026-04-17',datetime('now'),datetime('now'))`).run();
  // A draft margin call to operate on
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
  // current_state is updated
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
      expectedState: 'agreed', // wrong
    }),
    (err) => err instanceof ConflictError && err.details.currentState === 'draft',
  );
});

test('appendEvent throws ConflictError on invalid transition', () => {
  const db = setupDb();
  // draft → settled is not a valid transition
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
  // Force a failure by passing an event_type that the DB CHECK constraints would reject — but we don't have one on event_type.
  // Instead, simulate by passing a non-string actor.id that triggers a downstream insert failure.
  // We rely on FK on actor_user_id = NULL being allowed; force failure by making it reference a non-existent user.
  assert.throws(
    () => appendEvent(db, {
      marginCallId: 'MC-1',
      eventType: 'issued',
      actor: { id: 99999, type: 'user' }, // user does not exist; FK fails
      payload: {},
      expectedState: 'draft',
    }),
    /FOREIGN KEY/,
  );
  // state must still be draft, no events
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
  // commented does not change state
  const call = db.prepare(`SELECT current_state FROM margin_calls WHERE id=?`).get('MC-1');
  assert.equal(call.current_state, 'draft');
});

test('appendEvent rejects terminal-state transitions', () => {
  const db = setupDb();
  // Walk to settled → resolved
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'draft' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'issued' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'delivery_marked', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'agreed' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'settled', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'delivered' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'resolved', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'settled' });
  // now resolved is terminal — any further event must throw
  assert.throws(
    () => appendEvent(db, { marginCallId: 'MC-1', eventType: 'commented', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'resolved' }),
    /terminal state/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/db.appendEvent.test.js`
Expected: FAIL — `Cannot find module '../src/db/appendEvent'`.

- [ ] **Step 3: Write the implementation**

```js
// collateral-api/src/db/appendEvent.js
const { sha256, stableStringify, GENESIS_HASH } = require('./hash');
const { stateForEvent, allowedTransitions } = require('./transitions');
const { ConflictError, NotFoundError } = require('./errors');

/**
 * The single funnel for any state change on a margin call.
 *
 * Inside one SQLite transaction:
 *   1. Look up the call, fail with NotFoundError if missing
 *   2. Verify expectedState matches, fail with ConflictError otherwise
 *   3. Compute the new state via stateForEvent (throws ConflictError on invalid transition)
 *   4. Read the previous event's hash (or GENESIS_HASH for first event)
 *   5. Compute the new event's hash
 *   6. Insert the event row
 *   7. Update margin_calls.current_state
 *
 * Returns: { id, eventType, hash, prevHash, occurredAt, newState }
 */
function appendEvent(db, {
  marginCallId,
  eventType,
  actor,                  // { id: number|null, type: 'user'|'agent'|'system' }
  payload,                // any JSON-serializable
  expectedState,          // string — for optimistic concurrency
  occurredAt,             // optional ISO timestamp; defaults to now
}) {
  if (!actor || !actor.type) {
    throw new Error('appendEvent: actor.type is required');
  }
  if (typeof eventType !== 'string') {
    throw new Error('appendEvent: eventType must be a string');
  }

  return db.transaction(() => {
    const call = db.prepare(`SELECT current_state FROM margin_calls WHERE id = ?`).get(marginCallId);
    if (!call) {
      throw new NotFoundError(`margin call ${marginCallId} not found`);
    }
    if (expectedState !== undefined && call.current_state !== expectedState) {
      throw new ConflictError('state mismatch', {
        currentState: call.current_state,
        expectedState,
        allowed: allowedTransitions(call.current_state),
      });
    }

    let newState;
    try {
      newState = stateForEvent(eventType, call.current_state);
    } catch (err) {
      throw new ConflictError(err.message, {
        currentState: call.current_state,
        attemptedEvent: eventType,
        allowed: allowedTransitions(call.current_state),
      });
    }

    const prevRow = db.prepare(
      `SELECT hash FROM margin_call_events WHERE margin_call_id = ? ORDER BY id DESC LIMIT 1`
    ).get(marginCallId);
    const prevHash = prevRow?.hash ?? GENESIS_HASH;

    const ts = occurredAt ?? new Date().toISOString();
    const actorIdStr = actor.id === null || actor.id === undefined ? '' : String(actor.id);
    const payloadStr = stableStringify(payload ?? {});
    const hash = sha256(prevHash + eventType + ts + actorIdStr + payloadStr);

    const insert = db.prepare(`
      INSERT INTO margin_call_events
        (margin_call_id, event_type, occurred_at, actor_user_id, actor_type, payload_json, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(marginCallId, eventType, ts, actor.id ?? null, actor.type, payloadStr, prevHash, hash);

    db.prepare(`UPDATE margin_calls SET current_state = ?, updated_at = ? WHERE id = ?`)
      .run(newState, ts, marginCallId);

    return {
      id: info.lastInsertRowid,
      eventType,
      hash,
      prevHash,
      occurredAt: ts,
      newState,
    };
  })();
}

module.exports = { appendEvent };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collateral-api && node --test test/db.appendEvent.test.js`
Expected: PASS — all 9 appendEvent tests green.

Run the full test suite to confirm no regression:
`cd collateral-api && node --test`
Expected: PASS across all test files.

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/db/appendEvent.js collateral-api/test/db.appendEvent.test.js
git commit -m "feat(margin-foundation): appendEvent — the single mutation funnel

Transactional, hash-chained, optimistic-concurrency-checked. Every state
change in every future route handler funnels through this. Throws typed
ConflictError / NotFoundError for clean HTTP mapping in route layer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Chain verification utility

For the nightly integrity scan (Plan 6) and the client-side audit badge (Plan 7). Pure read; no DB writes.

**Files:**
- Create: `collateral-api/src/db/verifyChain.js`
- Test: `collateral-api/test/db.verifyChain.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/db.verifyChain.test.js
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
  // Mutate the first event's payload directly
  db.prepare(`UPDATE margin_call_events SET payload_json = '{"a":999}' WHERE event_type = 'issued'`).run();
  const result = verifyChain(db, 'MC-1');
  assert.equal(result.valid, false);
  assert.ok(result.brokenAt !== null);
});

test('verifyChain detects a tampered prev_hash linkage', () => {
  const db = setupDb();
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'issued', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'draft' });
  appendEvent(db, { marginCallId: 'MC-1', eventType: 'accepted', actor: { id: 1, type: 'user' }, payload: {}, expectedState: 'issued' });
  // Break the linkage on the second event
  db.prepare(`UPDATE margin_call_events SET prev_hash = '${'f'.repeat(64)}' WHERE event_type = 'accepted'`).run();
  const result = verifyChain(db, 'MC-1');
  assert.equal(result.valid, false);
});

test('verifyChain returns null for missing margin call', () => {
  const db = setupDb();
  const result = verifyChain(db, 'MC-DOES-NOT-EXIST');
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/db.verifyChain.test.js`
Expected: FAIL — `Cannot find module '../src/db/verifyChain'`.

- [ ] **Step 3: Write the implementation**

```js
// collateral-api/src/db/verifyChain.js
const { sha256, stableStringify, GENESIS_HASH } = require('./hash');

/**
 * Replays the hash chain for a margin call's events.
 * Returns { valid: boolean, brokenAt: id|null, eventCount: number } on success,
 * or null if the margin call does not exist.
 */
function verifyChain(db, marginCallId) {
  const call = db.prepare(`SELECT id FROM margin_calls WHERE id = ?`).get(marginCallId);
  if (!call) return null;

  const events = db.prepare(`
    SELECT id, event_type, occurred_at, actor_user_id, payload_json, prev_hash, hash
      FROM margin_call_events
     WHERE margin_call_id = ?
     ORDER BY id ASC
  `).all(marginCallId);

  let prevHash = GENESIS_HASH;
  for (const ev of events) {
    if (ev.prev_hash !== prevHash) {
      return { valid: false, brokenAt: ev.id, eventCount: events.length };
    }
    const actorIdStr = ev.actor_user_id === null ? '' : String(ev.actor_user_id);
    // payload_json is already canonical (stableStringify output) — re-stringify defensively
    let canonicalPayload;
    try {
      canonicalPayload = stableStringify(JSON.parse(ev.payload_json));
    } catch {
      return { valid: false, brokenAt: ev.id, eventCount: events.length };
    }
    const expected = sha256(prevHash + ev.event_type + ev.occurred_at + actorIdStr + canonicalPayload);
    if (expected !== ev.hash) {
      return { valid: false, brokenAt: ev.id, eventCount: events.length };
    }
    prevHash = ev.hash;
  }
  return { valid: true, brokenAt: null, eventCount: events.length };
}

module.exports = { verifyChain };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collateral-api && node --test test/db.verifyChain.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/db/verifyChain.js collateral-api/test/db.verifyChain.test.js
git commit -m "feat(margin-foundation): verifyChain — tamper detection over event log

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Permission additions + Credit Approver role

Widen `ROLE_PERMS` in `auth.js` with the 8 new permissions. Add a new `Credit Approver` role that is the four-eyes approver (must be distinct from issuers).

**Files:**
- Modify: `collateral-api/src/middleware/auth.js`
- Test: `collateral-api/test/middleware.auth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/middleware.auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// Require AFTER setting JWT_SECRET so module-load assertion passes
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const { requirePerm, ROLE_PERMS } = require('../src/middleware/auth');

const NEW_PERMS = [
  'canManageAgreements',
  'canIssueCall',
  'canRespondCall',
  'canOpenDispute',
  'canResolveDispute',
  'canApproveFourEyes',
  'canCancelCall',
  'canExportAudit',
];

test('all 8 new permissions exist on every role (default false)', () => {
  for (const role of Object.keys(ROLE_PERMS)) {
    for (const perm of NEW_PERMS) {
      assert.ok(perm in ROLE_PERMS[role], `role ${role} missing perm ${perm}`);
    }
  }
});

test('Collateral Manager gets canIssueCall, canRespondCall, canOpenDispute', () => {
  assert.equal(ROLE_PERMS['Collateral Manager'].canIssueCall, true);
  assert.equal(ROLE_PERMS['Collateral Manager'].canRespondCall, true);
  assert.equal(ROLE_PERMS['Collateral Manager'].canOpenDispute, true);
});

test('Credit Approver role exists and has canApproveFourEyes + canResolveDispute', () => {
  assert.ok(ROLE_PERMS['Credit Approver'], 'Credit Approver role must exist');
  assert.equal(ROLE_PERMS['Credit Approver'].canApproveFourEyes, true);
  assert.equal(ROLE_PERMS['Credit Approver'].canResolveDispute, true);
});

test('Credit Approver does NOT have canIssueCall (separation of duties)', () => {
  assert.equal(ROLE_PERMS['Credit Approver'].canIssueCall, false);
});

test('Treasury Manager gets canCancelCall + canManageAgreements', () => {
  assert.equal(ROLE_PERMS['Treasury Manager'].canCancelCall, true);
  assert.equal(ROLE_PERMS['Treasury Manager'].canManageAgreements, true);
});

test('Risk Reviewer gets canExportAudit (read-only role)', () => {
  assert.equal(ROLE_PERMS['Risk Reviewer'].canExportAudit, true);
  assert.equal(ROLE_PERMS['Risk Reviewer'].readOnly, true);
});

test('requirePerm returns 403 when perm absent', () => {
  const middleware = requirePerm('canApproveFourEyes');
  let statusCode, body;
  const res = {
    status(c) { statusCode = c; return this; },
    json(b) { body = b; return this; },
  };
  let nextCalled = false;
  middleware(
    { user: { role: 'Collateral Manager' } },
    res,
    () => { nextCalled = true; },
  );
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test('requirePerm calls next when perm present', () => {
  const middleware = requirePerm('canIssueCall');
  let nextCalled = false;
  middleware(
    { user: { role: 'Collateral Manager' } },
    { status() { return this; }, json() { return this; } },
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});
```

Note: `ROLE_PERMS` is not currently exported from `auth.js` — we need to export it for testing in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/middleware.auth.test.js`
Expected: FAIL — `ROLE_PERMS` is undefined or new perms missing.

- [ ] **Step 3: Modify `auth.js`**

Edit [collateral-api/src/middleware/auth.js](../../../collateral-api/src/middleware/auth.js):

(a) Replace the `ROLE_PERMS` block (lines 9–14 in the current file) with:

```js
// Server-side permission map — mirrors client-side ROLE_PERMS but is authoritative.
// All role rows must contain the SAME keys (default false) so callers can rely on key presence.
const ROLE_PERMS = {
  'Treasury Manager': {
    canCreateRepo: true, canCloseRepo: true, canRolloverRepo: true, canUpdateRepo: true,
    canApproveTopUp: false, canSubstitute: true, canAdvanceSettlement: false,
    canImportAssets: false, canUpdateAsset: false, canReset: true, readOnly: false,
    canManageAgreements: true, canIssueCall: false, canRespondCall: false,
    canOpenDispute: false, canResolveDispute: false, canApproveFourEyes: false,
    canCancelCall: true, canExportAudit: false,
  },
  'Collateral Manager': {
    canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canUpdateRepo: true,
    canApproveTopUp: true, canSubstitute: true, canAdvanceSettlement: false,
    canImportAssets: true, canUpdateAsset: true, canReset: false, readOnly: false,
    canManageAgreements: false, canIssueCall: true, canRespondCall: true,
    canOpenDispute: true, canResolveDispute: false, canApproveFourEyes: false,
    canCancelCall: false, canExportAudit: false,
  },
  'Operations Analyst': {
    canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canUpdateRepo: false,
    canApproveTopUp: false, canSubstitute: false, canAdvanceSettlement: true,
    canImportAssets: false, canUpdateAsset: false, canReset: false, readOnly: false,
    canManageAgreements: false, canIssueCall: false, canRespondCall: true,
    canOpenDispute: false, canResolveDispute: false, canApproveFourEyes: false,
    canCancelCall: false, canExportAudit: false,
  },
  'Risk Reviewer': {
    canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canUpdateRepo: false,
    canApproveTopUp: false, canSubstitute: false, canAdvanceSettlement: false,
    canImportAssets: false, canUpdateAsset: false, canReset: false, readOnly: true,
    canManageAgreements: false, canIssueCall: false, canRespondCall: false,
    canOpenDispute: false, canResolveDispute: false, canApproveFourEyes: false,
    canCancelCall: false, canExportAudit: true,
  },
  'Credit Approver': {
    canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canUpdateRepo: false,
    canApproveTopUp: false, canSubstitute: false, canAdvanceSettlement: false,
    canImportAssets: false, canUpdateAsset: false, canReset: false, readOnly: false,
    canManageAgreements: false, canIssueCall: false, canRespondCall: false,
    canOpenDispute: false, canResolveDispute: true, canApproveFourEyes: true,
    canCancelCall: false, canExportAudit: false,
  },
};
```

(b) Add `ROLE_PERMS` to the existing `module.exports`:

```js
module.exports = { requireAuth, requirePerm, requireWriteAccess, JWT_SECRET, ROLE_PERMS };
```

- [ ] **Step 4: Run tests**

```
cd collateral-api && node --test test/middleware.auth.test.js
```

Expected: PASS — all 8 perm tests green. Then run the full suite to confirm no regression on existing route tests:

```
cd collateral-api && node --test
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/middleware/auth.js collateral-api/test/middleware.auth.test.js
git commit -m "feat(margin-foundation): 8 new perms + Credit Approver role

Adds canManageAgreements, canIssueCall, canRespondCall, canOpenDispute,
canResolveDispute, canApproveFourEyes, canCancelCall, canExportAudit.
Credit Approver is a new role with four-eyes approval authority,
explicitly without canIssueCall (separation of duties).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Push to main

Per the project convention (Vercel auto-deploys from main), push the foundation work.

- [ ] **Step 1: Verify all tests pass**

```
cd collateral-api && node --test
```

Expected: PASS across all test files (`db.hash.test.js`, `db.transitions.test.js`, `db.schema.test.js`, `db.appendEvent.test.js`, `db.verifyChain.test.js`, `middleware.auth.test.js`, `routes.test.js`).

- [ ] **Step 2: Push**

```
git push origin main
```

Expected: push succeeds; Vercel triggers a deploy.

---

## Self-review (post-write)

**Spec coverage:**
- ✅ Spec §"Data model" — 7 domain tables + idempotency_keys (Task 4) = 8 total ✓
- ✅ Spec §"State machine" — 9 states + transition table (Task 2) ✓
- ✅ Spec §"Hash-chain helper" — appendEvent helper (Task 5) ✓
- ✅ Spec §"Permissions model" — 8 perms + Credit Approver role (Task 7) ✓
- ✅ Spec §"Invariants" — current_state only written by appendEvent (Task 5); terminal-state rejection (Task 2 + Task 5); transactional atomicity (Task 5)
- ✅ Spec §"Error handling" — ConflictError on state mismatch + invalid transition (Task 5); NotFoundError on missing call (Task 5); typed errors (Task 3)
- ✅ Spec §"Testing strategy" — DB per test via `:memory:` (Tasks 4–6); state machine 100% coverage (Task 2); hash chain integrity (Tasks 5–6)

**Out of scope for this plan (intentional, deferred to subsequent plans):**
- Idempotency key middleware → Plan 3 (margin call core)
- Optimistic concurrency `expected_state` *over the wire* → Plan 3 (route layer)
- HTTP error mapping (403/404/409) → Plan 3 (route layer)
- All actual route handlers → Plans 2–6
- UI changes → Plan 7
- Backfill, demo seed, cutover → Plan 8

**Placeholder scan:** none. Every step has actual code; every test has actual assertions.

**Type consistency:**
- `appendEvent` parameter shape: `{ marginCallId, eventType, actor: { id, type }, payload, expectedState, occurredAt? }` — used identically in Tasks 5 and 6 tests ✓
- `verifyChain` return shape: `{ valid, brokenAt, eventCount }` or `null` — consistent across tests ✓
- Permission names spelled identically in Task 7 tests, ROLE_PERMS, and the spec ✓
- `actor.type` enum: `'user' | 'agent' | 'system'` — matches the schema CHECK constraint in Task 4 ✓

---

## What ships at end of Plan 1

A backend foundation with no externally-visible behaviour change. The new tables exist but no route writes to them yet. Engineers (and Plan 2) can now:
- Insert a `collateral_agreements` row directly
- Insert a `margin_calls` row directly
- Call `appendEvent(db, …)` to drive lifecycle
- Run `verifyChain(db, id)` for tamper detection

All gated by tests. **No production user impact yet.**

---

## What's next (Plans 2–8)

Each subsequent plan is its own document under `docs/superpowers/plans/`, written when its predecessor is complete (so it can incorporate any learnings).

| # | Plan | Ships |
|---|---|---|
| 2 | **Agreements & Schedules CRUD** — `/api/agreements/*` routes, eligibility + haircut nested CRUD | A working `/api/agreements` endpoint set with full tests |
| 3 | **Margin Call core (happy path)** — create, issue, accept, mark-delivered, confirm-settlement; idempotency middleware; expected_state wire format | API can drive a call from draft → resolved end-to-end |
| 4 | **Disputes sub-workflow** — `/api/disputes/*`, reason-code validation, iterative proposals | Disputes can be opened, proposed, agreed/withdrawn/escalated via API |
| 5 | **Four-eyes / Approvals** — `/api/approvals/*`, self-approval rejection, integration with margin call accept | Above-threshold accepts and cancellations route through approval queue |
| 6 | **AI advisor + crons** — `/margin-calls/suggested`, `/ai-assess`, deadline scanner, nightly integrity scan | AI suggestions visible; deadlines surface breach events; integrity scan runs nightly |
| 7 | **UI rewrite** — TanStack Query, server-bound `Margin.jsx`, new Agreements/Approvals/Detail pages, hash-chain integrity badge | Internal users can complete all 3 flows (happy / dispute / four-eyes) end-to-end via UI behind `ENABLE_MARGIN_V2` flag |
| 8 | **Backfill + cutover** — backfill script, demo seed update, flag flip, delete client-side state ownership, drop `assets.eligibility TEXT` | All users on v2; old `MarginWorkflow.ts` removed; spec's full Definition of Done met |
