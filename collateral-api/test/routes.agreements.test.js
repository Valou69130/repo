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
