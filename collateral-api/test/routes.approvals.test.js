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
      app.use('/approvals', require('../src/routes/approvals'));
    },
  });
  const tm = tokenFor('Treasury Manager', 1);
  const cm = tokenFor('Collateral Manager', 2);
  const rr = tokenFor('Risk Reviewer', 3);
  const ca = tokenFor('Credit Approver', 4);
  const oa = tokenFor('Operations Analyst', 5);
  return { ...built, tm, cm, rr, ca, oa };
}

// Agreement with a low four-eyes threshold so we can trigger it easily.
const agreement = {
  id: 'AGR-X', counterparty: 'ACME', agreementType: 'GMRA',
  governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
  minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 1000000, status: 'active', effectiveDate: '2026-04-17',
};

const bigCall = {
  id: 'MC-BIG', agreementId: 'AGR-X', direction: 'received',
  callDate: '2026-04-17', exposureAmount: 2000000, collateralValue: 0,
  callAmount: 2000000, currency: 'EUR',
};

const smallCall = {
  id: 'MC-SMALL', agreementId: 'AGR-X', direction: 'received',
  callDate: '2026-04-17', exposureAmount: 500000, collateralValue: 0,
  callAmount: 500000, currency: 'EUR',
};

async function seedBig(app, tm, cm) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(agreement);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(bigCall);
}

async function seedSmall(app, tm, cm) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(agreement);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(smallCall);
}

test('accept above threshold returns 202 + pending_four_eyes + approval row', async () => {
  const { app, tm, cm } = setup();
  await seedBig(app, tm, cm);
  const res = await request(app)
    .post('/margin-calls/MC-BIG/accept')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'issued' });
  assert.equal(res.status, 202);
  assert.equal(res.body.marginCall.currentState, 'pending_four_eyes');
  assert.equal(res.body.event.eventType, 'four_eyes_requested');
  assert.ok(res.body.approvalPending);
  assert.equal(res.body.approvalPending.entityType, 'margin_call_accept');
  assert.equal(res.body.approvalPending.entityId, 'MC-BIG');
});

test('accept at-or-below threshold returns 200 + agreed (unchanged)', async () => {
  const { app, tm, cm } = setup();
  await seedSmall(app, tm, cm);
  const res = await request(app)
    .post('/margin-calls/MC-SMALL/accept')
    .set('Authorization', `Bearer ${cm}`)
    .send({ expectedState: 'issued' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'agreed');
});

test('GET /approvals/pending — excludes self-requested, includes others', async () => {
  const { app, tm, cm, ca } = setup();
  await seedBig(app, tm, cm);
  await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });

  const asRequester = await request(app).get('/approvals/pending').set('Authorization', `Bearer ${cm}`);
  assert.equal(asRequester.status, 200);
  assert.equal(asRequester.body.data.length, 0);

  const asApprover = await request(app).get('/approvals/pending').set('Authorization', `Bearer ${ca}`);
  assert.equal(asApprover.status, 200);
  assert.equal(asApprover.body.data.length, 1);
  assert.equal(asApprover.body.data[0].entityId, 'MC-BIG');
});

test('POST /approvals/:id/grant by approver → call state agreed, approval granted', async () => {
  const { app, tm, cm, ca } = setup();
  await seedBig(app, tm, cm);
  const accept = await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const approvalId = accept.body.approvalPending.id;

  const res = await request(app)
    .post(`/approvals/${approvalId}/grant`)
    .set('Authorization', `Bearer ${ca}`)
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'agreed');
  assert.equal(res.body.approval.status, 'granted');
  assert.equal(res.body.event.eventType, 'four_eyes_granted');
});

test('POST /approvals/:id/grant by same user who requested → 403', async () => {
  const { app, tm, cm } = setup();
  await seedBig(app, tm, cm);
  const accept = await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const approvalId = accept.body.approvalPending.id;
  // cm requested; cm cannot grant (even if cm had canApproveFourEyes, here they don't, but server must reject on self-approval rule).
  // We use the Credit Approver role for the would-be-approver check; same user id means we need a user with canApproveFourEyes and same id.
  // Easier: issue a token with Credit Approver role but userId=2 (same as cm/requester id in buildApp).
  const sameUserDifferentRole = require('jsonwebtoken').sign({ id: 2, role: 'Credit Approver', name: 'Credit Approver' }, process.env.JWT_SECRET);
  const res = await request(app)
    .post(`/approvals/${approvalId}/grant`)
    .set('Authorization', `Bearer ${sameUserDifferentRole}`)
    .send({});
  assert.equal(res.status, 403);
});

test('POST /approvals/:id/grant without canApproveFourEyes → 403', async () => {
  const { app, tm, cm, rr } = setup();
  await seedBig(app, tm, cm);
  const accept = await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const approvalId = accept.body.approvalPending.id;
  const res = await request(app)
    .post(`/approvals/${approvalId}/grant`)
    .set('Authorization', `Bearer ${rr}`)
    .send({});
  assert.equal(res.status, 403);
});

test('POST /approvals/:id/grant on already-granted approval → 409', async () => {
  const { app, tm, cm, ca } = setup();
  await seedBig(app, tm, cm);
  const accept = await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const approvalId = accept.body.approvalPending.id;
  await request(app).post(`/approvals/${approvalId}/grant`).set('Authorization', `Bearer ${ca}`).send({});
  const res = await request(app).post(`/approvals/${approvalId}/grant`).set('Authorization', `Bearer ${ca}`).send({});
  assert.equal(res.status, 409);
});

test('POST /approvals/:id/grant missing approval → 404', async () => {
  const { app, ca } = setup();
  const res = await request(app).post('/approvals/APP-NOPE/grant').set('Authorization', `Bearer ${ca}`).send({});
  assert.equal(res.status, 404);
});

test('POST /approvals/:id/reject with reason → call state disputed, approval rejected', async () => {
  const { app, tm, cm, ca } = setup();
  await seedBig(app, tm, cm);
  const accept = await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const approvalId = accept.body.approvalPending.id;

  const res = await request(app)
    .post(`/approvals/${approvalId}/reject`)
    .set('Authorization', `Bearer ${ca}`)
    .send({ reason: 'valuation unclear' });
  assert.equal(res.status, 200);
  assert.equal(res.body.marginCall.currentState, 'disputed');
  assert.equal(res.body.approval.status, 'rejected');
  assert.equal(res.body.event.eventType, 'four_eyes_rejected');
});

test('POST /approvals/:id/reject without reason → 400', async () => {
  const { app, tm, cm, ca } = setup();
  await seedBig(app, tm, cm);
  const accept = await request(app).post('/margin-calls/MC-BIG/accept').set('Authorization', `Bearer ${cm}`).send({ expectedState: 'issued' });
  const approvalId = accept.body.approvalPending.id;
  const res = await request(app).post(`/approvals/${approvalId}/reject`).set('Authorization', `Bearer ${ca}`).send({});
  assert.equal(res.status, 400);
});
