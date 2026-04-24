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
  id: 'AGR-PDF-001', counterparty: 'Deutsche Bank', agreementType: 'GMRA',
  governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
  minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
  fourEyesThreshold: 10000000, status: 'active', effectiveDate: '2026-04-17',
};

const callBody = {
  id: 'MC-PDF-0001',
  agreementId: 'AGR-PDF-001',
  direction: 'issued',
  callDate: '2026-04-17',
  exposureAmount: 1500000,
  collateralValue: 1000000,
  callAmount: 500000,
  currency: 'EUR',
};

async function seedCall(app, cm, tm) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send(agreementBody);
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send(callBody);
}

// ── PDF download ──────────────────────────────────────────────────────────────

test('GET /margin-calls/:id/pdf — 200 application/pdf for valid authenticated call', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  const res = await request(app)
    .get('/margin-calls/MC-PDF-0001/pdf')
    .set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('application/pdf'));
  assert.ok(res.body.length > 0 || res.text.length > 0);
});

test('GET /margin-calls/:id/pdf — 401 without auth token', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  const res = await request(app).get('/margin-calls/MC-PDF-0001/pdf');
  assert.equal(res.status, 401);
});

test('GET /margin-calls/:id/pdf — 404 for unknown id', async () => {
  const { app, cm } = setup();
  const res = await request(app)
    .get('/margin-calls/MC-DOES-NOT-EXIST/pdf')
    .set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 404);
});

// ── POST dedup ────────────────────────────────────────────────────────────────

test('POST /margin-calls — 409 when open call already exists for same agreement', async () => {
  const { app, cm, tm } = setup();
  await seedCall(app, cm, tm);
  // second call with different id, same agreementId
  const res = await request(app)
    .post('/margin-calls')
    .set('Authorization', `Bearer ${cm}`)
    .send({ ...callBody, id: 'MC-PDF-0002' });
  assert.equal(res.status, 409);
  assert.equal(res.body.existingId, 'MC-PDF-0001');
});
