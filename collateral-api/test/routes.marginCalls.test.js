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
