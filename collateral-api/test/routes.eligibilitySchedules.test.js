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
