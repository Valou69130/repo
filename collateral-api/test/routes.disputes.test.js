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
      app.use('/', require('../src/routes/disputes'));
    },
  });
  const cm = tokenFor('Collateral Manager', 2);
  const tm = tokenFor('Treasury Manager', 1);
  const ca = tokenFor('Credit Approver', 4);
  const rr = tokenFor('Risk Reviewer', 3);
  const oa = tokenFor('Operations Analyst', 5);
  return { ...built, cm, tm, ca, rr, oa };
}

const agreement = {
  id: 'AGR-DBK-001', counterparty: 'Deutsche Bank', agreementType: 'GMRA',
  governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
  minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 10000000, status: 'active', effectiveDate: '2026-04-17',
};

const callBody = {
  id: 'MC-2026-0001', agreementId: 'AGR-DBK-001', direction: 'received',
  callDate: '2026-04-17', exposureAmount: 1500000, collateralValue: 1000000,
  callAmount: 500000, currency: 'EUR',
};

async function seedCall(app, cm, tm, overrides = {}) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(agreement);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, ...overrides });
}

async function openDispute(app, cm, body = {}) {
  return request(app)
    .post(`/margin-calls/${callBody.id}/disputes`)
    .set('Authorization', `Bearer ${cm}`)
    .send({ id: 'DSP-001', reasonCode: 'valuation', theirProposedValue: 520000, ourProposedValue: 480000, ...body });
}

// ── Task 1: open dispute ────────────────────────────────────────────────

test('POST /margin-calls/:id/disputes — 201 opens dispute, transitions issued→disputed', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  const res = await openDispute(app, cm);
  assert.equal(res.status, 201);
  assert.equal(res.body.dispute.id, 'DSP-001');
  assert.equal(res.body.dispute.status, 'open');
  assert.equal(res.body.dispute.reasonCode, 'valuation');
  assert.equal(res.body.dispute.delta, 40000);
  assert.equal(res.body.marginCall.currentState, 'disputed');
  assert.equal(res.body.event.eventType, 'dispute_opened');
});

test('POST /margin-calls/:id/disputes — 400 on invalid reason code', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  const res = await openDispute(app, cm, { reasonCode: 'bogus' });
  assert.equal(res.status, 400);
});

test('POST /margin-calls/:id/disputes — 400 when id missing', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  const res = await openDispute(app, cm, { id: '' });
  assert.equal(res.status, 400);
});

test('POST /margin-calls/:id/disputes — 403 without canOpenDispute', async () => {
  const { app, cm, tm, rr } = setup();
  await seedCall(app, cm, tm);
  const res = await request(app)
    .post(`/margin-calls/${callBody.id}/disputes`)
    .set('Authorization', `Bearer ${rr}`)
    .send({ id: 'DSP-X', reasonCode: 'valuation' });
  assert.equal(res.status, 403);
});

test('POST /margin-calls/:id/disputes — 404 when margin call missing', async () => {
  const { app, cm } = setup();
  const res = await request(app)
    .post('/margin-calls/MC-NOPE/disputes')
    .set('Authorization', `Bearer ${cm}`)
    .send({ id: 'DSP-X', reasonCode: 'valuation' });
  assert.equal(res.status, 404);
});

test('POST /margin-calls/:id/disputes — 409 when not in issued state', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  // accept it first → agreed
  await request(app).post(`/margin-calls/${callBody.id}/accept`).set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const res = await openDispute(app, cm);
  assert.equal(res.status, 409);
});

test('POST /margin-calls/:id/disputes — 409 on duplicate dispute id', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  // Re-open with same id on a fresh call via the same app should 409 (duplicate id); state has already moved
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({ ...callBody, id: 'MC-2026-0002' });
  const res = await request(app)
    .post(`/margin-calls/MC-2026-0002/disputes`)
    .set('Authorization', `Bearer ${cm}`)
    .send({ id: 'DSP-001', reasonCode: 'valuation' });
  assert.equal(res.status, 409);
});

// ── Task 2: propose ─────────────────────────────────────────────────────

test('POST /disputes/:id/propose — 200 appends non-progressing event, updates proposals', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/propose')
    .set('Authorization', `Bearer ${cm}`)
    .send({ theirProposedValue: 510000, ourProposedValue: 495000, note: 'mid-market revised' });
  assert.equal(res.status, 200);
  assert.equal(res.body.event.eventType, 'dispute_proposed');
  assert.equal(res.body.marginCall.currentState, 'disputed');
  assert.equal(res.body.dispute.theirProposedValue, 510000);
  assert.equal(res.body.dispute.ourProposedValue, 495000);
  assert.equal(res.body.dispute.delta, 15000);
});

test('POST /disputes/:id/propose — 403 without dispute permission', async () => {
  const { app, cm, tm, rr } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/propose')
    .set('Authorization', `Bearer ${rr}`)
    .send({ theirProposedValue: 510000, ourProposedValue: 495000 });
  assert.equal(res.status, 403);
});

test('POST /disputes/:id/propose — 404 on missing dispute', async () => {
  const { app, cm } = setup();
  const res = await request(app)
    .post('/disputes/DSP-NOPE/propose')
    .set('Authorization', `Bearer ${cm}`)
    .send({ theirProposedValue: 1, ourProposedValue: 1 });
  assert.equal(res.status, 404);
});

test('POST /disputes/:id/propose — 409 when dispute not open', async () => {
  const { app, cm, tm, ca } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  await request(app).post('/disputes/DSP-001/agree').set('Authorization', `Bearer ${ca}`).send({ expectedState: 'disputed', agreedAmount: 500000 });
  const res = await request(app)
    .post('/disputes/DSP-001/propose')
    .set('Authorization', `Bearer ${cm}`)
    .send({ theirProposedValue: 1, ourProposedValue: 1 });
  assert.equal(res.status, 409);
});

// ── Task 3: agree ───────────────────────────────────────────────────────

test('POST /disputes/:id/agree — 200 disputed→agreed and updates call amount when agreedAmount given', async () => {
  const { app, cm, tm, ca } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/agree')
    .set('Authorization', `Bearer ${ca}`)
    .send({ expectedState: 'disputed', agreedAmount: 495000, resolutionNote: 'converged at mid' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'agreed');
  assert.equal(res.body.marginCall.callAmount, 495000);
  assert.equal(res.body.dispute.status, 'agreed');
  assert.equal(res.body.event.eventType, 'dispute_agreed');
});

test('POST /disputes/:id/agree — 403 without canResolveDispute', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/agree')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'disputed', agreedAmount: 500000 });
  assert.equal(res.status, 403);
});

test('POST /disputes/:id/agree — 409 when dispute already closed', async () => {
  const { app, cm, tm, ca } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  await request(app).post('/disputes/DSP-001/agree').set('Authorization', `Bearer ${ca}`).send({ expectedState: 'disputed', agreedAmount: 500000 });
  const res = await request(app).post('/disputes/DSP-001/agree').set('Authorization', `Bearer ${ca}`).send({ expectedState: 'disputed', agreedAmount: 500000 });
  assert.equal(res.status, 409);
});

// ── Task 4: withdraw ────────────────────────────────────────────────────

test('POST /disputes/:id/withdraw — 200 originator can withdraw → cancelled', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/withdraw')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'disputed', reason: 'opened in error' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'cancelled');
  assert.equal(res.body.dispute.status, 'withdrawn');
  assert.equal(res.body.event.eventType, 'dispute_withdrawn');
});

test('POST /disputes/:id/withdraw — 403 if not originator', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  // second collateral manager id=6 not in seed; use tm (id=1) — different user id from opener (id=2)
  const res = await request(app)
    .post('/disputes/DSP-001/withdraw')
    .set('Authorization', `Bearer ${tm}`)
    .send({ expectedState: 'disputed', reason: 'not mine' });
  assert.equal(res.status, 403);
});

test('POST /disputes/:id/withdraw — 404 on missing dispute', async () => {
  const { app, cm } = setup();
  const res = await request(app)
    .post('/disputes/DSP-NOPE/withdraw')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'disputed', reason: 'x' });
  assert.equal(res.status, 404);
});

// ── Task 5: escalate ────────────────────────────────────────────────────

test('POST /disputes/:id/escalate — 200 sets escalated status (non-progressing)', async () => {
  const { app, cm, tm, ca } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/escalate')
    .set('Authorization', `Bearer ${ca}`)
    .send({ reason: 'senior review' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'disputed');
  assert.equal(res.body.dispute.status, 'escalated');
  assert.equal(res.body.event.eventType, 'dispute_escalated');
});

test('POST /disputes/:id/escalate — 403 without canResolveDispute', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app)
    .post('/disputes/DSP-001/escalate')
    .set('Authorization', `Bearer ${cm}`)
    .send({ reason: 'x' });
  assert.equal(res.status, 403);
});

// ── Task 6: GET /margin-calls/:id includes disputes ─────────────────────

test('GET /margin-calls/:id — includes disputes array', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  await openDispute(app, cm);
  const res = await request(app).get(`/margin-calls/${callBody.id}`).set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.disputes));
  assert.equal(res.body.disputes.length, 1);
  assert.equal(res.body.disputes[0].id, 'DSP-001');
  assert.equal(res.body.disputes[0].status, 'open');
});
