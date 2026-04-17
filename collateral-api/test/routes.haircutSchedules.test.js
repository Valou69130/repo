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
