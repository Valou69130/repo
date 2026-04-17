# Collateral Agreements CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship read/write REST endpoints for `collateral_agreements`, `eligibility_schedules`, and `haircut_schedules` so the margin-call layer can bind to a real parent agreement.

**Architecture:** Three route files under `collateral-api/src/routes/` — `agreements.js`, `eligibilitySchedules.js`, `haircutSchedules.js`. All mutations write to the existing `audit_events` table via `appendAuditEntry`. Permission gate: `canManageAgreements` (Treasury Manager only). List + detail are read-only (any authed user).

**Tech Stack:** Express 4, better-sqlite3, `node:test`, `supertest` for HTTP-level tests, existing `validation.js` helpers.

---

## File Structure

- Create: `collateral-api/src/routes/agreements.js`
- Create: `collateral-api/src/routes/eligibilitySchedules.js`
- Create: `collateral-api/src/routes/haircutSchedules.js`
- Modify: `collateral-api/src/index.js` (mount 3 new routers)
- Modify: `collateral-api/src/validation.js` (add ISO currency + date validators)
- Create: `collateral-api/test/routes.agreements.test.js`
- Create: `collateral-api/test/routes.eligibilitySchedules.test.js`
- Create: `collateral-api/test/routes.haircutSchedules.test.js`
- Create: `collateral-api/test/helpers/testApp.js` (shared supertest harness)

---

### Task 1: Validation helpers (ISO currency, ISO date)

**Files:**
- Modify: `collateral-api/src/validation.js`
- Create: `collateral-api/test/validation.iso.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/validation.iso.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isIsoCurrency, isIsoDate } = require('../src/validation');

test('isIsoCurrency accepts 3 uppercase letters', () => {
  assert.equal(isIsoCurrency('EUR'), true);
  assert.equal(isIsoCurrency('USD'), true);
  assert.equal(isIsoCurrency('GBP'), true);
});

test('isIsoCurrency rejects lowercase, wrong length, non-strings', () => {
  assert.equal(isIsoCurrency('eur'), false);
  assert.equal(isIsoCurrency('EU'), false);
  assert.equal(isIsoCurrency('EURO'), false);
  assert.equal(isIsoCurrency(''), false);
  assert.equal(isIsoCurrency(null), false);
  assert.equal(isIsoCurrency(123), false);
});

test('isIsoDate accepts YYYY-MM-DD', () => {
  assert.equal(isIsoDate('2026-04-17'), true);
  assert.equal(isIsoDate('1999-12-31'), true);
});

test('isIsoDate rejects malformed strings', () => {
  assert.equal(isIsoDate('2026/04/17'), false);
  assert.equal(isIsoDate('17-04-2026'), false);
  assert.equal(isIsoDate('2026-4-17'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-04-32'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(null), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collateral-api && node --test test/validation.iso.test.js`
Expected: FAIL with "isIsoCurrency is not a function" (or similar).

- [ ] **Step 3: Implement validators**

Add to `collateral-api/src/validation.js` (append before `module.exports`):

```js
function isIsoCurrency(value) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip check to reject 2026-02-31 etc.
  return d.toISOString().slice(0, 10) === value;
}
```

And extend `module.exports`:

```js
module.exports = {
  MAX,
  sanitise,
  isNonEmptyString,
  isFiniteNumber,
  isOptionalString,
  isArrayOfStrings,
  isIsoCurrency,
  isIsoDate,
  badRequest,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collateral-api && node --test test/validation.iso.test.js`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/validation.js collateral-api/test/validation.iso.test.js
git commit -m "feat(validation): isIsoCurrency + isIsoDate helpers"
```

---

### Task 2: Test harness for route tests

**Files:**
- Create: `collateral-api/test/helpers/testApp.js`

- [ ] **Step 1: Write the helper**

```js
// collateral-api/test/helpers/testApp.js
// Builds an isolated Express app bound to an in-memory SQLite DB.
// Tests that need the auth middleware should set the JWT_SECRET env var
// BEFORE requiring this helper (done at top of each test file).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const { initSchema } = require('../../src/db/schema');

function buildApp({ mount }) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);

  // Seed one user per role we test against.
  const roles = ['Treasury Manager', 'Collateral Manager', 'Risk Reviewer', 'Credit Approver', 'Operations Analyst'];
  roles.forEach((role, i) => {
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'h', ?)`
    ).run(i + 1, role, `${role.toLowerCase().replace(/\s+/g, '.')}@x`, role);
  });

  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Inject the per-app DB into req so routes can read it without
  // the global getDb() singleton.
  app.use((req, _res, next) => { req.testDb = db; next(); });

  mount(app);

  return { app, db };
}

function tokenFor(role, userId = 1) {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET);
}

module.exports = { buildApp, tokenFor };
```

- [ ] **Step 2: No test yet — helper is verified by Task 3 consumers.**

- [ ] **Step 3: Commit**

```bash
git add collateral-api/test/helpers/testApp.js
git commit -m "test(infra): shared supertest harness with in-memory DB"
```

---

### Task 3: Agreements POST + GET list + GET detail

**Files:**
- Create: `collateral-api/src/routes/agreements.js`
- Create: `collateral-api/test/routes.agreements.test.js`

- [ ] **Step 1: Install supertest if not already present**

Run: `cd collateral-api && npm ls supertest || npm install --save-dev supertest`

- [ ] **Step 2: Write the failing test**

```js
// collateral-api/test/routes.agreements.test.js
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildApp, tokenFor } = require('./helpers/testApp');

function setup() {
  return buildApp({
    mount(app) {
      app.use('/agreements', require('../src/routes/agreements'));
    },
  });
}

const validBody = {
  id: 'AGR-DBK-001',
  counterparty: 'Deutsche Bank',
  agreementType: 'GMRA',
  governingLaw: 'English',
  baseCurrency: 'EUR',
  threshold: 0,
  minimumTransferAmount: 10000,
  rounding: 1000,
  callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 1000000,
  status: 'active',
  effectiveDate: '2026-04-17',
};

test('POST /agreements — 201 on valid payload with canManageAgreements', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  const res = await request(app)
    .post('/agreements')
    .set('Authorization', `Bearer ${tok}`)
    .send(validBody);
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 'AGR-DBK-001');
  assert.equal(res.body.counterparty, 'Deutsche Bank');
  assert.equal(res.body.agreementType, 'GMRA');
  assert.equal(res.body.baseCurrency, 'EUR');
});

test('POST /agreements — 403 without canManageAgreements', async () => {
  const { app } = setup();
  const tok = tokenFor('Collateral Manager', 2);
  const res = await request(app)
    .post('/agreements')
    .set('Authorization', `Bearer ${tok}`)
    .send(validBody);
  assert.equal(res.status, 403);
});

test('POST /agreements — 401 without token', async () => {
  const { app } = setup();
  const res = await request(app).post('/agreements').send(validBody);
  assert.equal(res.status, 401);
});

test('POST /agreements — 400 on invalid ISO currency', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  const res = await request(app)
    .post('/agreements')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validBody, baseCurrency: 'eur' });
  assert.equal(res.status, 400);
});

test('POST /agreements — 400 on invalid ISO date', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  const res = await request(app)
    .post('/agreements')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validBody, effectiveDate: '2026/04/17' });
  assert.equal(res.status, 400);
});

test('POST /agreements — 400 on invalid agreement type', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  const res = await request(app)
    .post('/agreements')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validBody, agreementType: 'FOO' });
  assert.equal(res.status, 400);
});

test('POST /agreements — 409 on duplicate id', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  const res = await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  assert.equal(res.status, 409);
});

test('GET /agreements — 200 returns list with correct count', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send({ ...validBody, id: 'AGR-DBK-002', counterparty: 'BNP' });
  const res = await request(app).get('/agreements').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.data.length, 2);
});

test('GET /agreements?counterparty= — filters', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send({ ...validBody, id: 'AGR-BNP-001', counterparty: 'BNP' });
  const res = await request(app).get('/agreements?counterparty=BNP').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].counterparty, 'BNP');
});

test('GET /agreements/:id — 200 includes nested schedules keys', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  const res = await request(app).get('/agreements/AGR-DBK-001').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'AGR-DBK-001');
  assert.ok(Array.isArray(res.body.eligibilitySchedules));
  assert.ok(Array.isArray(res.body.haircutSchedules));
  assert.equal(res.body.eligibilitySchedules.length, 0);
  assert.equal(res.body.haircutSchedules.length, 0);
});

test('GET /agreements/:id — 404 for unknown id', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  const res = await request(app).get('/agreements/AGR-NOPE').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.status, 404);
});

test('GET /agreements — Risk Reviewer (read-only) can read', async () => {
  const { app } = setup();
  const tm = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(validBody);
  const rr = tokenFor('Risk Reviewer', 3);
  const res = await request(app).get('/agreements').set('Authorization', `Bearer ${rr}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd collateral-api && node --test test/routes.agreements.test.js`
Expected: FAIL with "Cannot find module './routes/agreements'".

- [ ] **Step 4: Implement the route**

```js
// collateral-api/src/routes/agreements.js
const router = require('express').Router();
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const {
  MAX, sanitise, badRequest,
  isNonEmptyString, isFiniteNumber, isOptionalString,
  isIsoCurrency, isIsoDate,
} = require('../validation');

const AGREEMENT_TYPES = new Set(['GMRA', 'CSA']);
const STATUSES = new Set(['active', 'terminated']);

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToAgreement(row) {
  return {
    id: row.id,
    counterparty: row.counterparty,
    agreementType: row.agreement_type,
    governingLaw: row.governing_law,
    baseCurrency: row.base_currency,
    threshold: row.threshold,
    minimumTransferAmount: row.minimum_transfer_amount,
    rounding: row.rounding,
    callNoticeDeadlineTime: row.call_notice_deadline_time,
    fourEyesThreshold: row.four_eyes_threshold,
    status: row.status,
    effectiveDate: row.effective_date,
    terminationDate: row.termination_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb(req);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (req.query.counterparty) { where.push('counterparty = ?'); params.push(req.query.counterparty); }
  if (req.query.type)         { where.push('agreement_type = ?'); params.push(req.query.type); }
  if (req.query.status)       { where.push('status = ?'); params.push(req.query.status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM collateral_agreements ${whereSql}`).get(...params).c;
  const rows  = db.prepare(
    `SELECT * FROM collateral_agreements ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data: rows.map(rowToAgreement), total, page, limit });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb(req);
  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agreement not found' });
  const elig = db.prepare('SELECT * FROM eligibility_schedules WHERE agreement_id = ? ORDER BY priority ASC, id ASC').all(req.params.id);
  const hair = db.prepare('SELECT * FROM haircut_schedules WHERE agreement_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({
    ...rowToAgreement(row),
    eligibilitySchedules: elig.map(r => ({
      id: r.id, agreementId: r.agreement_id, name: r.name,
      criteria: JSON.parse(r.criteria_json), priority: r.priority,
    })),
    haircutSchedules: hair.map(r => ({
      id: r.id, agreementId: r.agreement_id,
      eligibilityScheduleId: r.eligibility_schedule_id,
      criteria: JSON.parse(r.criteria_json), haircut: r.haircut,
    })),
  });
});

router.post('/', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const b = req.body || {};
  const governingLaw = sanitise(b.governingLaw);

  if (!isNonEmptyString(b.id, MAX.id))                     return badRequest(res, 'id required');
  if (!isNonEmptyString(b.counterparty))                   return badRequest(res, 'counterparty required');
  if (!AGREEMENT_TYPES.has(b.agreementType))               return badRequest(res, 'agreementType must be GMRA or CSA');
  if (!isOptionalString(governingLaw, MAX.shortText))      return badRequest(res, 'governingLaw too long');
  if (!isIsoCurrency(b.baseCurrency))                      return badRequest(res, 'baseCurrency must be 3-letter ISO 4217');
  if (![b.threshold, b.minimumTransferAmount, b.rounding, b.fourEyesThreshold].every(isFiniteNumber)) {
    return badRequest(res, 'numeric fields must be finite numbers');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.callNoticeDeadlineTime || '')) {
    return badRequest(res, 'callNoticeDeadlineTime must be HH:MM');
  }
  if (!STATUSES.has(b.status))                             return badRequest(res, 'status must be active or terminated');
  if (!isIsoDate(b.effectiveDate))                         return badRequest(res, 'effectiveDate must be YYYY-MM-DD');
  if (b.terminationDate !== undefined && b.terminationDate !== null && !isIsoDate(b.terminationDate)) {
    return badRequest(res, 'terminationDate must be YYYY-MM-DD');
  }

  const existing = db.prepare('SELECT id FROM collateral_agreements WHERE id = ?').get(b.id);
  if (existing) return res.status(409).json({ error: 'Agreement id already exists' });

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO collateral_agreements
      (id, counterparty, agreement_type, governing_law, base_currency,
       threshold, minimum_transfer_amount, rounding, call_notice_deadline_time,
       four_eyes_threshold, status, effective_date, termination_date,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.id, b.counterparty, b.agreementType, governingLaw || null, b.baseCurrency,
    b.threshold, b.minimumTransferAmount, b.rounding, b.callNoticeDeadlineTime,
    b.fourEyesThreshold, b.status, b.effectiveDate, b.terminationDate || null,
    now, now
  );

  appendAuditEntry(db, req.user, 'agreement created', b.id, '',
    `${b.agreementType} · ${b.counterparty} · ${b.baseCurrency}`);

  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(b.id);
  res.status(201).json(rowToAgreement(row));
});

module.exports = router;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd collateral-api && node --test test/routes.agreements.test.js`
Expected: PASS (12/12 tests).

- [ ] **Step 6: Commit**

```bash
git add collateral-api/src/routes/agreements.js collateral-api/test/routes.agreements.test.js collateral-api/package.json collateral-api/package-lock.json
git commit -m "feat(agreements): POST + GET list/detail with validation and perm gate"
```

---

### Task 4: Agreements PATCH + terminate

**Files:**
- Modify: `collateral-api/src/routes/agreements.js`
- Modify: `collateral-api/test/routes.agreements.test.js`

- [ ] **Step 1: Add failing tests**

Append to `collateral-api/test/routes.agreements.test.js`:

```js
test('PATCH /agreements/:id — 200 updates allowed fields', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  const res = await request(app)
    .patch('/agreements/AGR-DBK-001')
    .set('Authorization', `Bearer ${tok}`)
    .send({ threshold: 50000, fourEyesThreshold: 2000000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.threshold, 50000);
  assert.equal(res.body.fourEyesThreshold, 2000000);
});

test('PATCH /agreements/:id — 403 without perm', async () => {
  const { app } = setup();
  const tm = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(validBody);
  const cm = tokenFor('Collateral Manager', 2);
  const res = await request(app)
    .patch('/agreements/AGR-DBK-001')
    .set('Authorization', `Bearer ${cm}`)
    .send({ threshold: 50000 });
  assert.equal(res.status, 403);
});

test('PATCH /agreements/:id — 404 for unknown id', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  const res = await request(app)
    .patch('/agreements/AGR-NOPE')
    .set('Authorization', `Bearer ${tok}`)
    .send({ threshold: 1 });
  assert.equal(res.status, 404);
});

test('PATCH /agreements/:id — 400 rejects immutable fields', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  const res = await request(app)
    .patch('/agreements/AGR-DBK-001')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'AGR-HACK' });
  assert.equal(res.status, 400);
});

test('POST /agreements/:id/terminate — sets status=terminated + termination_date', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/terminate')
    .set('Authorization', `Bearer ${tok}`)
    .send({ terminationDate: '2026-06-30' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'terminated');
  assert.equal(res.body.terminationDate, '2026-06-30');
});

test('POST /agreements/:id/terminate — 409 if already terminated', async () => {
  const { app } = setup();
  const tok = tokenFor('Treasury Manager');
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(validBody);
  await request(app).post('/agreements/AGR-DBK-001/terminate').set('Authorization', `Bearer ${tok}`).send({ terminationDate: '2026-06-30' });
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/terminate')
    .set('Authorization', `Bearer ${tok}`)
    .send({ terminationDate: '2026-07-01' });
  assert.equal(res.status, 409);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `cd collateral-api && node --test test/routes.agreements.test.js`
Expected: FAIL on the 6 new PATCH/terminate tests.

- [ ] **Step 3: Implement PATCH + terminate**

Insert into `collateral-api/src/routes/agreements.js` before `module.exports`:

```js
const MUTABLE = new Set([
  'counterparty', 'governingLaw', 'threshold', 'minimumTransferAmount',
  'rounding', 'callNoticeDeadlineTime', 'fourEyesThreshold',
]);

router.patch('/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agreement not found' });

  const b = req.body || {};
  const keys = Object.keys(b);
  for (const k of keys) {
    if (!MUTABLE.has(k)) return badRequest(res, `field "${k}" is not mutable`);
  }

  const updates = [];
  const params = [];
  if (b.counterparty !== undefined) {
    if (!isNonEmptyString(b.counterparty)) return badRequest(res, 'counterparty invalid');
    updates.push('counterparty = ?'); params.push(b.counterparty);
  }
  if (b.governingLaw !== undefined) {
    const gl = sanitise(b.governingLaw);
    if (gl !== null && !isOptionalString(gl, MAX.shortText)) return badRequest(res, 'governingLaw invalid');
    updates.push('governing_law = ?'); params.push(gl || null);
  }
  for (const [key, col] of [
    ['threshold', 'threshold'],
    ['minimumTransferAmount', 'minimum_transfer_amount'],
    ['rounding', 'rounding'],
    ['fourEyesThreshold', 'four_eyes_threshold'],
  ]) {
    if (b[key] !== undefined) {
      if (!isFiniteNumber(b[key])) return badRequest(res, `${key} must be a finite number`);
      updates.push(`${col} = ?`); params.push(b[key]);
    }
  }
  if (b.callNoticeDeadlineTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.callNoticeDeadlineTime)) {
      return badRequest(res, 'callNoticeDeadlineTime must be HH:MM');
    }
    updates.push('call_notice_deadline_time = ?'); params.push(b.callNoticeDeadlineTime);
  }
  if (updates.length === 0) return badRequest(res, 'no mutable fields provided');

  const now = new Date().toISOString();
  updates.push('updated_at = ?'); params.push(now);
  params.push(req.params.id);

  db.prepare(`UPDATE collateral_agreements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  appendAuditEntry(db, req.user, 'agreement updated', req.params.id, '', keys.join(','));

  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  res.json(rowToAgreement(row));
});

router.post('/:id/terminate', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agreement not found' });
  if (existing.status === 'terminated') return res.status(409).json({ error: 'Already terminated' });

  const termDate = req.body?.terminationDate;
  if (!isIsoDate(termDate)) return badRequest(res, 'terminationDate must be YYYY-MM-DD');

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE collateral_agreements SET status = 'terminated', termination_date = ?, updated_at = ? WHERE id = ?`
  ).run(termDate, now, req.params.id);
  appendAuditEntry(db, req.user, 'agreement terminated', req.params.id, existing.status, 'terminated');

  const row = db.prepare('SELECT * FROM collateral_agreements WHERE id = ?').get(req.params.id);
  res.json(rowToAgreement(row));
});
```

- [ ] **Step 4: Run — verify pass**

Run: `cd collateral-api && node --test test/routes.agreements.test.js`
Expected: PASS (18/18 tests).

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/routes/agreements.js collateral-api/test/routes.agreements.test.js
git commit -m "feat(agreements): PATCH + terminate with field-level allowlist"
```

---

### Task 5: Eligibility schedules CRUD

**Files:**
- Create: `collateral-api/src/routes/eligibilitySchedules.js`
- Create: `collateral-api/test/routes.eligibilitySchedules.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/routes.eligibilitySchedules.test.js
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildApp, tokenFor } = require('./helpers/testApp');

function setup() {
  const built = buildApp({
    mount(app) {
      app.use('/agreements', require('../src/routes/agreements'));
      app.use('/', require('../src/routes/eligibilitySchedules'));
    },
  });
  const tok = tokenFor('Treasury Manager');
  return { ...built, tok };
}

const agreementBody = {
  id: 'AGR-DBK-001', counterparty: 'Deutsche Bank', agreementType: 'GMRA',
  governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
  minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 1000000, status: 'active', effectiveDate: '2026-04-17',
};

async function seedAgreement(app, tok) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(agreementBody);
}

test('POST /agreements/:id/eligibility-schedules — 201 on valid payload', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/eligibility-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({
      id: 'ES-001',
      name: 'Tier 1 Sovereigns',
      criteria: { assetType: 'government_bond', ratingMin: 'AA-' },
      priority: 10,
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 'ES-001');
  assert.deepEqual(res.body.criteria, { assetType: 'government_bond', ratingMin: 'AA-' });
});

test('POST /agreements/:id/eligibility-schedules — 404 if agreement missing', async () => {
  const { app, tok } = setup();
  const res = await request(app)
    .post('/agreements/AGR-NOPE/eligibility-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'ES-X', name: 'X', criteria: {}, priority: 0 });
  assert.equal(res.status, 404);
});

test('POST /agreements/:id/eligibility-schedules — 400 if criteria not object', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/eligibility-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'ES-1', name: 'X', criteria: 'not-an-object', priority: 0 });
  assert.equal(res.status, 400);
});

test('POST /agreements/:id/eligibility-schedules — 403 without perm', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  const cm = tokenFor('Collateral Manager', 2);
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/eligibility-schedules')
    .set('Authorization', `Bearer ${cm}`)
    .send({ id: 'ES-1', name: 'X', criteria: {}, priority: 0 });
  assert.equal(res.status, 403);
});

test('GET /agreements/:id/eligibility-schedules — lists in priority order', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'ES-B', name: 'B', criteria: {}, priority: 20 });
  await request(app).post('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'ES-A', name: 'A', criteria: {}, priority: 10 });
  const res = await request(app).get('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].id, 'ES-A');
  assert.equal(res.body[1].id, 'ES-B');
});

test('PATCH /eligibility-schedules/:id — 200 updates name + criteria', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'ES-1', name: 'Old', criteria: {}, priority: 0 });
  const res = await request(app)
    .patch('/eligibility-schedules/ES-1')
    .set('Authorization', `Bearer ${tok}`)
    .send({ name: 'New', criteria: { assetType: 'bond' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'New');
  assert.deepEqual(res.body.criteria, { assetType: 'bond' });
});

test('DELETE /eligibility-schedules/:id — 204 and record removed', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'ES-1', name: 'X', criteria: {}, priority: 0 });
  const del = await request(app).delete('/eligibility-schedules/ES-1').set('Authorization', `Bearer ${tok}`);
  assert.equal(del.status, 204);
  const after = await request(app).get('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`);
  assert.equal(after.body.length, 0);
});

test('DELETE /eligibility-schedules/:id — 404 if missing', async () => {
  const { app, tok } = setup();
  const res = await request(app).delete('/eligibility-schedules/ES-NOPE').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `cd collateral-api && node --test test/routes.eligibilitySchedules.test.js`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement**

```js
// collateral-api/src/routes/eligibilitySchedules.js
const router = require('express').Router({ mergeParams: true });
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { MAX, badRequest, isNonEmptyString, isFiniteNumber } = require('../validation');

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToEligibility(r) {
  return {
    id: r.id,
    agreementId: r.agreement_id,
    name: r.name,
    criteria: JSON.parse(r.criteria_json),
    priority: r.priority,
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

router.get('/agreements/:id/eligibility-schedules', requireAuth, (req, res) => {
  const db = getDb(req);
  const rows = db.prepare(
    'SELECT * FROM eligibility_schedules WHERE agreement_id = ? ORDER BY priority ASC, id ASC'
  ).all(req.params.id);
  res.json(rows.map(rowToEligibility));
});

router.post('/agreements/:id/eligibility-schedules', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const agr = db.prepare('SELECT id FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!agr) return res.status(404).json({ error: 'Agreement not found' });

  const b = req.body || {};
  if (!isNonEmptyString(b.id, MAX.id))      return badRequest(res, 'id required');
  if (!isNonEmptyString(b.name))            return badRequest(res, 'name required');
  if (!isPlainObject(b.criteria))           return badRequest(res, 'criteria must be an object');
  if (!isFiniteNumber(b.priority))          return badRequest(res, 'priority must be a number');

  const exists = db.prepare('SELECT id FROM eligibility_schedules WHERE id = ?').get(b.id);
  if (exists) return res.status(409).json({ error: 'id already exists' });

  db.prepare(`
    INSERT INTO eligibility_schedules (id, agreement_id, name, criteria_json, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(b.id, req.params.id, b.name, JSON.stringify(b.criteria), b.priority);

  appendAuditEntry(db, req.user, 'eligibility schedule created', b.id, '', req.params.id);
  const row = db.prepare('SELECT * FROM eligibility_schedules WHERE id = ?').get(b.id);
  res.status(201).json(rowToEligibility(row));
});

router.patch('/eligibility-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM eligibility_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const b = req.body || {};
  const updates = [];
  const params = [];
  if (b.name !== undefined) {
    if (!isNonEmptyString(b.name)) return badRequest(res, 'name invalid');
    updates.push('name = ?'); params.push(b.name);
  }
  if (b.criteria !== undefined) {
    if (!isPlainObject(b.criteria)) return badRequest(res, 'criteria must be an object');
    updates.push('criteria_json = ?'); params.push(JSON.stringify(b.criteria));
  }
  if (b.priority !== undefined) {
    if (!isFiniteNumber(b.priority)) return badRequest(res, 'priority must be a number');
    updates.push('priority = ?'); params.push(b.priority);
  }
  if (updates.length === 0) return badRequest(res, 'no fields provided');
  params.push(req.params.id);

  db.prepare(`UPDATE eligibility_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  appendAuditEntry(db, req.user, 'eligibility schedule updated', req.params.id, '', Object.keys(b).join(','));

  const row = db.prepare('SELECT * FROM eligibility_schedules WHERE id = ?').get(req.params.id);
  res.json(rowToEligibility(row));
});

router.delete('/eligibility-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT id FROM eligibility_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  db.prepare('DELETE FROM eligibility_schedules WHERE id = ?').run(req.params.id);
  appendAuditEntry(db, req.user, 'eligibility schedule deleted', req.params.id, '', '');
  res.status(204).end();
});

module.exports = router;
```

- [ ] **Step 4: Run — verify pass**

Run: `cd collateral-api && node --test test/routes.eligibilitySchedules.test.js`
Expected: PASS (8/8 tests).

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/routes/eligibilitySchedules.js collateral-api/test/routes.eligibilitySchedules.test.js
git commit -m "feat(agreements): eligibility schedules CRUD"
```

---

### Task 6: Haircut schedules CRUD

**Files:**
- Create: `collateral-api/src/routes/haircutSchedules.js`
- Create: `collateral-api/test/routes.haircutSchedules.test.js`

- [ ] **Step 1: Write the failing test**

```js
// collateral-api/test/routes.haircutSchedules.test.js
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildApp, tokenFor } = require('./helpers/testApp');

function setup() {
  const built = buildApp({
    mount(app) {
      app.use('/agreements', require('../src/routes/agreements'));
      app.use('/', require('../src/routes/eligibilitySchedules'));
      app.use('/', require('../src/routes/haircutSchedules'));
    },
  });
  const tok = tokenFor('Treasury Manager');
  return { ...built, tok };
}

const agreementBody = {
  id: 'AGR-DBK-001', counterparty: 'Deutsche Bank', agreementType: 'GMRA',
  governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
  minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 1000000, status: 'active', effectiveDate: '2026-04-17',
};

async function seedAgreement(app, tok) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send(agreementBody);
}

test('POST /agreements/:id/haircut-schedules — 201 with haircut between 0 and 1', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/haircut-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({
      id: 'HS-001',
      criteria: { assetType: 'corporate_bond' },
      haircut: 0.05,
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.haircut, 0.05);
});

test('POST /agreements/:id/haircut-schedules — 400 if haircut out of range', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  const res1 = await request(app)
    .post('/agreements/AGR-DBK-001/haircut-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'HS-2', criteria: {}, haircut: -0.01 });
  assert.equal(res1.status, 400);
  const res2 = await request(app)
    .post('/agreements/AGR-DBK-001/haircut-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'HS-3', criteria: {}, haircut: 1.5 });
  assert.equal(res2.status, 400);
});

test('POST /agreements/:id/haircut-schedules — 400 if eligibility_schedule_id points to different agreement', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  // Second agreement
  await request(app).post('/agreements').set('Authorization', `Bearer ${tok}`).send({ ...agreementBody, id: 'AGR-BNP-001', counterparty: 'BNP' });
  await request(app).post('/agreements/AGR-BNP-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'ES-BNP', name: 'X', criteria: {}, priority: 0 });
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/haircut-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'HS-1', criteria: {}, haircut: 0.02, eligibilityScheduleId: 'ES-BNP' });
  assert.equal(res.status, 400);
});

test('POST /agreements/:id/haircut-schedules — 201 with eligibility_schedule_id on same agreement', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/eligibility-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'ES-1', name: 'X', criteria: {}, priority: 0 });
  const res = await request(app)
    .post('/agreements/AGR-DBK-001/haircut-schedules')
    .set('Authorization', `Bearer ${tok}`)
    .send({ id: 'HS-1', criteria: {}, haircut: 0.03, eligibilityScheduleId: 'ES-1' });
  assert.equal(res.status, 201);
  assert.equal(res.body.eligibilityScheduleId, 'ES-1');
});

test('GET /agreements/:id/haircut-schedules — lists', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/haircut-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'HS-1', criteria: {}, haircut: 0.01 });
  await request(app).post('/agreements/AGR-DBK-001/haircut-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'HS-2', criteria: {}, haircut: 0.02 });
  const res = await request(app).get('/agreements/AGR-DBK-001/haircut-schedules').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.body.length, 2);
});

test('PATCH /haircut-schedules/:id — 200 updates haircut', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/haircut-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'HS-1', criteria: {}, haircut: 0.01 });
  const res = await request(app)
    .patch('/haircut-schedules/HS-1')
    .set('Authorization', `Bearer ${tok}`)
    .send({ haircut: 0.08 });
  assert.equal(res.status, 200);
  assert.equal(res.body.haircut, 0.08);
});

test('DELETE /haircut-schedules/:id — 204', async () => {
  const { app, tok } = setup();
  await seedAgreement(app, tok);
  await request(app).post('/agreements/AGR-DBK-001/haircut-schedules').set('Authorization', `Bearer ${tok}`).send({ id: 'HS-1', criteria: {}, haircut: 0.01 });
  const res = await request(app).delete('/haircut-schedules/HS-1').set('Authorization', `Bearer ${tok}`);
  assert.equal(res.status, 204);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `cd collateral-api && node --test test/routes.haircutSchedules.test.js`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement**

```js
// collateral-api/src/routes/haircutSchedules.js
const router = require('express').Router({ mergeParams: true });
const { requireAuth, requirePerm } = require('../middleware/auth');
const { appendAuditEntry } = require('../middleware/auditHelper');
const { MAX, badRequest, isNonEmptyString, isFiniteNumber } = require('../validation');

function getDb(req) {
  return req.testDb || require('../db/schema').getDb();
}

function rowToHaircut(r) {
  return {
    id: r.id,
    agreementId: r.agreement_id,
    eligibilityScheduleId: r.eligibility_schedule_id,
    criteria: JSON.parse(r.criteria_json),
    haircut: r.haircut,
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isValidHaircut(v) {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

router.get('/agreements/:id/haircut-schedules', requireAuth, (req, res) => {
  const db = getDb(req);
  const rows = db.prepare(
    'SELECT * FROM haircut_schedules WHERE agreement_id = ? ORDER BY id ASC'
  ).all(req.params.id);
  res.json(rows.map(rowToHaircut));
});

router.post('/agreements/:id/haircut-schedules', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const agr = db.prepare('SELECT id FROM collateral_agreements WHERE id = ?').get(req.params.id);
  if (!agr) return res.status(404).json({ error: 'Agreement not found' });

  const b = req.body || {};
  if (!isNonEmptyString(b.id, MAX.id))      return badRequest(res, 'id required');
  if (!isPlainObject(b.criteria))           return badRequest(res, 'criteria must be an object');
  if (!isValidHaircut(b.haircut))           return badRequest(res, 'haircut must be between 0 and 1');

  let esId = b.eligibilityScheduleId ?? null;
  if (esId !== null) {
    if (!isNonEmptyString(esId, MAX.id)) return badRequest(res, 'eligibilityScheduleId invalid');
    const es = db.prepare('SELECT agreement_id FROM eligibility_schedules WHERE id = ?').get(esId);
    if (!es) return badRequest(res, 'eligibilityScheduleId not found');
    if (es.agreement_id !== req.params.id) return badRequest(res, 'eligibilityScheduleId belongs to a different agreement');
  }

  const exists = db.prepare('SELECT id FROM haircut_schedules WHERE id = ?').get(b.id);
  if (exists) return res.status(409).json({ error: 'id already exists' });

  db.prepare(`
    INSERT INTO haircut_schedules (id, agreement_id, eligibility_schedule_id, criteria_json, haircut)
    VALUES (?, ?, ?, ?, ?)
  `).run(b.id, req.params.id, esId, JSON.stringify(b.criteria), b.haircut);

  appendAuditEntry(db, req.user, 'haircut schedule created', b.id, '', `${req.params.id} · ${b.haircut}`);
  const row = db.prepare('SELECT * FROM haircut_schedules WHERE id = ?').get(b.id);
  res.status(201).json(rowToHaircut(row));
});

router.patch('/haircut-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT * FROM haircut_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const b = req.body || {};
  const updates = [];
  const params = [];
  if (b.criteria !== undefined) {
    if (!isPlainObject(b.criteria)) return badRequest(res, 'criteria must be an object');
    updates.push('criteria_json = ?'); params.push(JSON.stringify(b.criteria));
  }
  if (b.haircut !== undefined) {
    if (!isValidHaircut(b.haircut)) return badRequest(res, 'haircut must be between 0 and 1');
    updates.push('haircut = ?'); params.push(b.haircut);
  }
  if (updates.length === 0) return badRequest(res, 'no fields provided');
  params.push(req.params.id);

  db.prepare(`UPDATE haircut_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  appendAuditEntry(db, req.user, 'haircut schedule updated', req.params.id, '', Object.keys(b).join(','));

  const row = db.prepare('SELECT * FROM haircut_schedules WHERE id = ?').get(req.params.id);
  res.json(rowToHaircut(row));
});

router.delete('/haircut-schedules/:id', requireAuth, requirePerm('canManageAgreements'), (req, res) => {
  const db = getDb(req);
  const existing = db.prepare('SELECT id FROM haircut_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  db.prepare('DELETE FROM haircut_schedules WHERE id = ?').run(req.params.id);
  appendAuditEntry(db, req.user, 'haircut schedule deleted', req.params.id, '', '');
  res.status(204).end();
});

module.exports = router;
```

- [ ] **Step 4: Run — verify pass**

Run: `cd collateral-api && node --test test/routes.haircutSchedules.test.js`
Expected: PASS (7/7 tests).

- [ ] **Step 5: Commit**

```bash
git add collateral-api/src/routes/haircutSchedules.js collateral-api/test/routes.haircutSchedules.test.js
git commit -m "feat(agreements): haircut schedules CRUD with range + cross-agreement checks"
```

---

### Task 7: Mount routers in index.js

**Files:**
- Modify: `collateral-api/src/index.js`

- [ ] **Step 1: Add the three mounts**

Edit `collateral-api/src/index.js` — insert after `app.use('/ai', ...)`:

```js
  app.use('/agreements',            require('./routes/agreements'));
  app.use('/',                      require('./routes/eligibilitySchedules'));
  app.use('/',                      require('./routes/haircutSchedules'));
```

- [ ] **Step 2: Sanity check — server boots**

Run: `cd collateral-api && JWT_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh-secret timeout 3 node src/index.js || true`
Expected: Log line "Collateral API → http://localhost:3001" then graceful exit.

- [ ] **Step 3: Commit**

```bash
git add collateral-api/src/index.js
git commit -m "feat(agreements): mount routers in app"
```

---

### Task 8: Final test sweep + push

- [ ] **Step 1: Run full foundation + agreements test suite**

Run:
```bash
cd collateral-api && JWT_SECRET=test-secret node --test \
  test/db.hash.test.js test/db.transitions.test.js test/db.schema.test.js \
  test/db.appendEvent.test.js test/db.verifyChain.test.js \
  test/middleware.auth.test.js test/validation.iso.test.js \
  test/routes.agreements.test.js test/routes.eligibilitySchedules.test.js \
  test/routes.haircutSchedules.test.js
```
Expected: All tests pass.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```
