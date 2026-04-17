# Margin Call Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the happy-path margin-call lifecycle over HTTP: create → issue → accept → mark-delivered → confirm-settlement, plus cancel. Every transition routes through `appendEvent` (hash-chained). Dispute + four-eyes gating ship in later plans.

**Architecture:** One new route file `collateral-api/src/routes/marginCalls.js`. List, detail with event log, and six action endpoints. Validation delegates to `validation.js`; transitions delegate to existing `transitions.js`; state mutation delegates to existing `appendEvent`. This plan deliberately skips the four-eyes branch and disputes — they're in Plans 4 and 5.

**Tech Stack:** Express, better-sqlite3, `node:test`, `supertest`, existing domain modules (`appendEvent`, `transitions`, `errors`).

---

## File Structure

- Create: `collateral-api/src/routes/marginCalls.js`
- Modify: `collateral-api/src/index.js` (mount `/margin-calls`)
- Create: `collateral-api/test/routes.marginCalls.test.js`

---

### Task 1: POST /margin-calls (create draft / received)

**Files:**
- Create: `collateral-api/src/routes/marginCalls.js`
- Create: `collateral-api/test/routes.marginCalls.test.js`

- [ ] **Step 1: Write failing test**

```js
// collateral-api/test/routes.marginCalls.test.js
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildApp, tokenFor } = require('./helpers/testApp');

function setup() {
  const built = buildApp({
    mount(app) {
      app.use('/agreements', require('../src/routes/agreements'));
      app.use('/margin-calls', require('../src/routes/marginCalls'));
    },
  });
  const cm = tokenFor('Collateral Manager', 2);
  const tm = tokenFor('Treasury Manager', 1);
  return { ...built, cm, tm };
}

const agreementBody = {
  id: 'AGR-DBK-001', counterparty: 'Deutsche Bank', agreementType: 'GMRA',
  governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
  minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 10000000, status: 'active', effectiveDate: '2026-04-17',
};

async function seedAgreement(app, tm) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(agreementBody);
}

const callBody = {
  id: 'MC-2026-0001',
  agreementId: 'AGR-DBK-001',
  direction: 'issued',
  callDate: '2026-04-17',
  exposureAmount: 1500000,
  collateralValue: 1000000,
  callAmount: 500000,
  currency: 'EUR',
};

test('POST /margin-calls — 201 as draft when direction=issued', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${cm}`)
    .send(callBody);
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 'MC-2026-0001');
  assert.equal(res.body.currentState, 'draft');
  assert.equal(res.body.direction, 'issued');
});

test('POST /margin-calls — 201 as issued when direction=received', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${cm}`)
    .send({ ...callBody, direction: 'received' });
  assert.equal(res.status, 201);
  assert.equal(res.body.currentState, 'issued');
});

test('POST /margin-calls — 403 without canIssueCall or canRespondCall', async () => {
  const { app, tm } = setup();
  await seedAgreement(app, tm);
  const rr = tokenFor('Risk Reviewer', 3);
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${rr}`)
    .send(callBody);
  assert.equal(res.status, 403);
});

test('POST /margin-calls — 404 if agreement missing', async () => {
  const { app, cm } = setup();
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${cm}`)
    .send(callBody);
  assert.equal(res.status, 404);
});

test('POST /margin-calls — 400 on invalid direction', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${cm}`)
    .send({ ...callBody, direction: 'sideways' });
  assert.equal(res.status, 400);
});

test('POST /margin-calls — 400 on invalid currency', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${cm}`)
    .send({ ...callBody, currency: 'eur' });
  assert.equal(res.status, 400);
});

test('POST /margin-calls — 409 on duplicate id', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  const res = await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  assert.equal(res.status, 409);
});

test('POST /margin-calls — sets four_eyes_required when callAmount > threshold', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  const big = { ...callBody, id: 'MC-BIG', callAmount: 20000000 };
  const res = await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(big);
  assert.equal(res.status, 201);
  assert.equal(res.body.fourEyesRequired, true);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `cd collateral-api && node --test test/routes.marginCalls.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement POST /margin-calls**

```js
// collateral-api/src/routes/marginCalls.js
const router = require('express').Router();
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { appendEvent } = require('../db/appendEvent');
const { ConflictError, NotFoundError } = require('../db/errors');
const {
  MAX, badRequest, isNonEmptyString, isFiniteNumber, isIsoCurrency, isIsoDate,
} = require('../validation');

const DIRECTIONS = new Set(['issued', 'received']);

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToCall(row) {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    direction: row.direction,
    callDate: row.call_date,
    exposureAmount: row.exposure_amount,
    collateralValue: row.collateral_value,
    callAmount: row.call_amount,
    currency: row.currency,
    currentState: row.current_state,
    issuedByUserId: row.issued_by_user_id,
    issuedAt: row.issued_at,
    resolvedAt: row.resolved_at,
    settlementRef: row.settlement_ref,
    fourEyesRequired: !!row.four_eyes_required,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeDeadline(callDate, deadlineTime) {
  return `${callDate}T${deadlineTime}:00Z`;
}

function writeError(res, err) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message, ...err.details });
  throw err;
}

router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const perms = require('../middleware/auth').ROLE_PERMS[req.user?.role];
  if (!perms) return res.status(403).json({ error: 'Forbidden' });
  const needed = b.direction === 'received' ? 'canRespondCall' : 'canIssueCall';
  if (!perms[needed]) return res.status(403).json({ error: 'Forbidden' });

  if (!isNonEmptyString(b.id, MAX.id))               return badRequest(res, 'id required');
  if (!isNonEmptyString(b.agreementId, MAX.id))      return badRequest(res, 'agreementId required');
  if (!DIRECTIONS.has(b.direction))                  return badRequest(res, 'direction must be issued or received');
  if (!isIsoDate(b.callDate))                        return badRequest(res, 'callDate must be YYYY-MM-DD');
  if (![b.exposureAmount, b.collateralValue, b.callAmount].every(isFiniteNumber)) {
    return badRequest(res, 'amount fields must be finite numbers');
  }
  if (!isIsoCurrency(b.currency))                    return badRequest(res, 'currency must be 3-letter ISO 4217');

  const db = getDb(req);
  const agr = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(b.agreementId);
  if (!agr) return res.status(404).json({ error: 'Agreement not found' });

  const existing = db.prepare('SELECT id FROM margin_calls WHERE id = ?').get(b.id);
  if (existing) return res.status(409).json({ error: 'Margin call id already exists' });

  const fourEyes = b.callAmount > agr.four_eyes_threshold ? 1 : 0;
  const initialState = b.direction === 'issued' ? 'draft' : 'issued';
  const now = new Date().toISOString();
  const deadline = computeDeadline(b.callDate, agr.call_notice_deadline_time);

  db.prepare(`
    INSERT INTO margin_calls
      (id, agreement_id, direction, call_date, exposure_amount, collateral_value,
       call_amount, currency, current_state, issued_by_user_id, issued_at,
       four_eyes_required, deadline_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.id, b.agreementId, b.direction, b.callDate,
    b.exposureAmount, b.collateralValue, b.callAmount, b.currency,
    initialState, req.user.id, now, fourEyes, deadline, now, now
  );

  // Write initial 'create' event. For direction=received we use event_type='issued' to land state at 'issued'.
  // For direction=issued (starts draft) we don't need an event — 'issue' action will write it.
  if (b.direction === 'received') {
    try {
      appendEvent(db, {
        marginCallId: b.id,
        eventType: 'issued',
        actor: { id: req.user.id, type: 'user' },
        payload: { agreementId: b.agreementId, callAmount: b.callAmount, currency: b.currency, direction: 'received' },
        expectedState: 'draft',
        occurredAt: now,
      });
    } catch (err) {
      return writeError(res, err);
    }
  }

  appendAuditEntry(db, req.user, 'margin call created', b.id, '', `${b.direction} · ${b.callAmount} ${b.currency}`);
  const row = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(b.id);
  res.status(201).json(rowToCall(row));
});

module.exports = router;
```

Note: For `direction='received'`, we insert the row as `issued` and `appendEvent` with `expectedState: 'draft'` will fail. Fix by inserting as `draft` first, then `appendEvent` promotes it to `issued`.

Revise the insert block:

Replace `const initialState = ...` and the INSERT with:

```js
const now = new Date().toISOString();
const deadline = computeDeadline(b.callDate, agr.call_notice_deadline_time);

// Always start at 'draft'; if received, we promote via appendEvent below.
db.prepare(`
  INSERT INTO margin_calls
    (id, agreement_id, direction, call_date, exposure_amount, collateral_value,
     call_amount, currency, current_state, issued_by_user_id, issued_at,
     four_eyes_required, deadline_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  b.id, b.agreementId, b.direction, b.callDate,
  b.exposureAmount, b.collateralValue, b.callAmount, b.currency,
  'draft', req.user.id, now, fourEyes, deadline, now, now
);
```

- [ ] **Step 4: Run — verify pass**

Run: `cd collateral-api && node --test test/routes.marginCalls.test.js`
Expected: PASS (8/8 for this task's tests).

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/routes/marginCalls.js collateral-api/test/routes.marginCalls.test.js
git commit -m "feat(margin-calls): POST /margin-calls (draft or received)"
```

---

### Task 2: GET /margin-calls + GET /:id (with events)

**Files:**
- Modify: `collateral-api/src/routes/marginCalls.js`
- Modify: `collateral-api/test/routes.marginCalls.test.js`

- [ ] **Step 1: Append tests**

```js
test('GET /margin-calls — 200 lists created calls', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-2026-0002' });
  const res = await request(app).get('/margin-calls').set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.data.length, 2);
});

test('GET /margin-calls?state= — filters', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-R', direction: 'received' });
  const res = await request(app).get('/margin-calls?state=draft').set('Authorization', `Bearer ${cm}`);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].currentState, 'draft');
});

test('GET /margin-calls/:id — 200 with events array', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-R', direction: 'received' });
  const res = await request(app).get('/margin-calls/MC-R').set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'MC-R');
  assert.ok(Array.isArray(res.body.events));
  assert.equal(res.body.events.length, 1);
  assert.equal(res.body.events[0].eventType, 'issued');
});

test('GET /margin-calls/:id — 404', async () => {
  const { app, cm } = setup();
  const res = await request(app).get('/margin-calls/MC-NONE').set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `cd collateral-api && node --test test/routes.marginCalls.test.js`

- [ ] **Step 3: Implement GET endpoints**

Insert before `module.exports` in `marginCalls.js`:

```js
router.get('/', requireAuth, (req, res) => {
  const db = getDb(req);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (req.query.state)        { where.push('current_state = ?'); params.push(req.query.state); }
  if (req.query.agreement)    { where.push('agreement_id = ?'); params.push(req.query.agreement); }
  if (req.query.direction)    { where.push('direction = ?'); params.push(req.query.direction); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM margin_calls ${whereSql}`).get(...params).c;
  const rows  = db.prepare(
    `SELECT * FROM margin_calls ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data: rows.map(rowToCall), total, page, limit });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb(req);
  const row = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Margin call not found' });
  const events = db.prepare(
    'SELECT id, event_type, occurred_at, actor_user_id, actor_type, payload_json, prev_hash, hash FROM margin_call_events WHERE margin_call_id = ? ORDER BY id ASC'
  ).all(req.params.id);
  res.json({
    ...rowToCall(row),
    events: events.map(e => ({
      id: e.id,
      eventType: e.event_type,
      occurredAt: e.occurred_at,
      actorUserId: e.actor_user_id,
      actorType: e.actor_type,
      payload: JSON.parse(e.payload_json),
      prevHash: e.prev_hash,
      hash: e.hash,
    })),
  });
});
```

- [ ] **Step 4: Run — verify pass**

Run: `cd collateral-api && node --test test/routes.marginCalls.test.js`

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/routes/marginCalls.js collateral-api/test/routes.marginCalls.test.js
git commit -m "feat(margin-calls): list + detail with event log"
```

---

### Task 3: Action endpoints (issue, accept, mark-delivered, confirm-settlement, cancel)

**Files:**
- Modify: `collateral-api/src/routes/marginCalls.js`
- Modify: `collateral-api/test/routes.marginCalls.test.js`

- [ ] **Step 1: Append tests**

```js
test('POST /:id/issue — draft → issued', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  const res = await request(app)
    .post('/margin-calls/MC-2026-0001/issue')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'draft' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'issued');
  assert.equal(res.body.event.eventType, 'issued');
});

test('POST /:id/issue — 409 on state mismatch', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  const res = await request(app)
    .post('/margin-calls/MC-2026-0001/issue')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'issued' });
  assert.equal(res.status, 409);
});

test('POST /:id/accept — issued → agreed (when under threshold)', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-R', direction: 'received' });
  const res = await request(app)
    .post('/margin-calls/MC-R/accept')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'issued' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'agreed');
});

test('POST /:id/mark-delivered — agreed → delivered', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-R', direction: 'received' });
  await request(app).post('/margin-calls/MC-R/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const res = await request(app)
    .post('/margin-calls/MC-R/mark-delivered')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'agreed', settlementRef: 'STL-001', deliveredAmount: 500000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'delivered');
});

test('POST /:id/mark-delivered — 400 on variance without reason', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-R', direction: 'received' });
  await request(app).post('/margin-calls/MC-R/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const res = await request(app)
    .post('/margin-calls/MC-R/mark-delivered')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'agreed', settlementRef: 'STL-001', deliveredAmount: 499999 });
  assert.equal(res.status, 400);
});

test('POST /:id/confirm-settlement — delivered → settled → resolved', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-R', direction: 'received' });
  await request(app).post('/margin-calls/MC-R/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  await request(app).post('/margin-calls/MC-R/mark-delivered').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'agreed', settlementRef: 'STL-001', deliveredAmount: 500000 });
  const res = await request(app)
    .post('/margin-calls/MC-R/confirm-settlement')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'delivered' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'resolved');
});

test('POST /:id/cancel — draft → cancelled', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  const res = await request(app)
    .post('/margin-calls/MC-2026-0001/cancel')
    .set('Authorization', `Bearer ${tm}`)
    .send({ expectedState: 'draft', reason: 'entered in error' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'cancelled');
});

test('POST /:id/cancel — 403 without canCancelCall', async () => {
  const { app, cm, tm } = setup();
  await seedAgreement(app, tm);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
  const res = await request(app)
    .post('/margin-calls/MC-2026-0001/cancel')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'draft', reason: 'x' });
  assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Run — verify fails**

- [ ] **Step 3: Implement actions**

Insert before `module.exports`:

```js
function runAction(req, res, { eventType, permCheck, payloadBuilder, validateBody }) {
  const db = getDb(req);
  const id = req.params.id;
  const body = req.body || {};
  const perms = require('../middleware/auth').ROLE_PERMS[req.user?.role];
  if (!perms) return res.status(403).json({ error: 'Forbidden' });
  if (!permCheck(perms)) return res.status(403).json({ error: 'Forbidden' });

  if (validateBody) {
    const bad = validateBody(body);
    if (bad) return badRequest(res, bad);
  }

  const call = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(id);
  if (!call) return res.status(404).json({ error: 'Margin call not found' });

  let event;
  try {
    event = appendEvent(db, {
      marginCallId: id,
      eventType,
      actor: { id: req.user.id, type: 'user' },
      payload: payloadBuilder ? payloadBuilder(body, call) : body,
      expectedState: body.expectedState,
    });
  } catch (err) {
    return writeError(res, err);
  }

  // Persist action-specific columns (settlement_ref etc.) after the event.
  if (eventType === 'delivery_marked' && body.settlementRef) {
    db.prepare('UPDATE margin_calls SET settlement_ref = ?, updated_at = ? WHERE id = ?')
      .run(body.settlementRef, event.occurredAt, id);
  }
  if (event.newState === 'resolved' || event.newState === 'settled') {
    db.prepare('UPDATE margin_calls SET resolved_at = ? WHERE id = ?').run(event.occurredAt, id);
  }

  // Auto-advance settled → resolved (system event) per spec.
  if (event.newState === 'settled') {
    try {
      const sys = appendEvent(db, {
        marginCallId: id,
        eventType: 'resolved',
        actor: { id: null, type: 'system' },
        payload: { auto: true },
        expectedState: 'settled',
      });
      db.prepare('UPDATE margin_calls SET resolved_at = ? WHERE id = ?').run(sys.occurredAt, id);
    } catch (_) { /* swallow */ }
  }

  appendAuditEntry(db, req.user, `margin call ${eventType}`, id, call.current_state, '');
  const row = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(id);
  res.json({ marginCall: rowToCall(row), event });
}

router.post('/:id/issue', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'issued',
    permCheck: (p) => p.canIssueCall,
    payloadBuilder: (b, c) => ({ callAmount: c.call_amount, currency: c.currency }),
  });
});

router.post('/:id/accept', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'accepted',
    permCheck: (p) => p.canRespondCall,
    payloadBuilder: (b, c) => ({ callAmount: c.call_amount }),
  });
});

router.post('/:id/mark-delivered', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'delivery_marked',
    permCheck: (p) => p.canRespondCall,
    validateBody: (b) => {
      if (!isNonEmptyString(b.settlementRef, MAX.shortText)) return 'settlementRef required';
      if (!isFiniteNumber(b.deliveredAmount)) return 'deliveredAmount must be a finite number';
      return null;
    },
    payloadBuilder: (b, c) => {
      const variance = Math.abs(b.deliveredAmount - c.call_amount) > 0.01;
      if (variance && !isNonEmptyString(b.varianceReason, MAX.mediumText)) {
        throw new Error('variance requires reason');
      }
      return {
        settlementRef: b.settlementRef,
        deliveredAmount: b.deliveredAmount,
        varianceReason: b.varianceReason ?? null,
      };
    },
  });
});

router.post('/:id/confirm-settlement', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'settled',
    permCheck: (p) => p.canRespondCall,
  });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  runAction(req, res, {
    eventType: 'cancelled',
    permCheck: (p) => p.canCancelCall,
    validateBody: (b) => {
      if (!isNonEmptyString(b.reason, MAX.mediumText)) return 'reason required';
      return null;
    },
    payloadBuilder: (b) => ({ reason: b.reason }),
  });
});
```

Need to also catch the variance `throw new Error('variance requires reason')` — wrap payloadBuilder call in try/catch inside runAction, OR switch to returning an error sentinel. Easier: change `validateBody` for mark-delivered to include variance check pre-payload:

Replace `mark-delivered` block's `validateBody` + `payloadBuilder` with:

```js
router.post('/:id/mark-delivered', requireAuth, (req, res) => {
  const db = getDb(req);
  const call = db.prepare('SELECT * FROM margin_calls WHERE id = ?').get(req.params.id);
  const b = req.body || {};
  if (call) {
    if (!isNonEmptyString(b.settlementRef, MAX.shortText)) return badRequest(res, 'settlementRef required');
    if (!isFiniteNumber(b.deliveredAmount)) return badRequest(res, 'deliveredAmount must be a finite number');
    const variance = Math.abs(b.deliveredAmount - call.call_amount) > 0.01;
    if (variance && !isNonEmptyString(b.varianceReason, MAX.mediumText)) {
      return badRequest(res, 'varianceReason required when delivered amount differs from call amount');
    }
  }
  runAction(req, res, {
    eventType: 'delivery_marked',
    permCheck: (p) => p.canRespondCall,
    payloadBuilder: (body) => ({
      settlementRef: body.settlementRef,
      deliveredAmount: body.deliveredAmount,
      varianceReason: body.varianceReason ?? null,
    }),
  });
});
```

- [ ] **Step 4: Run — verify pass**

Run: `cd collateral-api && node --test test/routes.marginCalls.test.js`

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/routes/marginCalls.js collateral-api/test/routes.marginCalls.test.js
git commit -m "feat(margin-calls): action endpoints — issue/accept/deliver/settle/cancel"
```

---

### Task 4: Mount router + final sweep + push

**Files:**
- Modify: `collateral-api/src/index.js`

- [ ] **Step 1: Mount**

Add to `collateral-api/src/index.js`:

```js
  app.use('/margin-calls',  require('./routes/marginCalls'));
```

- [ ] **Step 2: Smoke test boot**

Run:
```bash
cd collateral-api && JWT_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh-secret node -e "const { createApp } = require('./src/index'); createApp(); console.log('OK'); process.exit(0);"
```

- [ ] **Step 3: Full test sweep**

```bash
cd collateral-api && JWT_SECRET=test-secret node --test \
  test/db.hash.test.js test/db.transitions.test.js test/db.schema.test.js \
  test/db.appendEvent.test.js test/db.verifyChain.test.js \
  test/middleware.auth.test.js test/validation.iso.test.js \
  test/routes.agreements.test.js test/routes.eligibilitySchedules.test.js \
  test/routes.haircutSchedules.test.js test/routes.marginCalls.test.js
```

- [ ] **Step 4: Commit + push**

```bash
git add collateral-api/src/index.js
git commit -m "feat(margin-calls): mount /margin-calls router"
git push origin main
```
