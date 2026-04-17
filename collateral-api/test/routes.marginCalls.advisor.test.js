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
  const rr = tokenFor('Risk Reviewer', 3);
  return { ...built, cm, tm, rr };
}

function seedAgreementAndRepos(db) {
  db.prepare(`
    INSERT INTO collateral_agreements
      (id, counterparty, agreement_type, governing_law, base_currency, threshold,
       minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold,
       status, effective_date)
    VALUES ('AGR-ACME','ACME','GMRA','English','EUR',0,10000,10000,'11:00',10000000,'active','2026-04-01')
  `).run();
  db.prepare(`
    INSERT INTO repos
      (id, counterparty, amount, currency, rate, start_date, maturity_date,
       state, required_collateral, posted_collateral, buffer, settlement)
    VALUES
      ('REPO-A','ACME',10000000,'EUR',0.02,'2026-04-01','2026-07-01','Active', 1000000, 700000, 0,'T+2'),
      ('REPO-B','ACME',5000000,'EUR',0.02,'2026-04-01','2026-07-01','Active',   500000, 500000, 0,'T+2'),
      ('REPO-C','ACME',7000000,'EUR',0.02,'2026-04-01','2026-07-01','Active',   600000, 450000, 0,'T+2')
  `).run();
}

// ── GET /margin-calls/suggested ────────────────────────────────────────

test('GET /margin-calls/suggested — returns repos with deficit, rounded to agreement rounding', async () => {
  const { app, db, cm } = setup();
  seedAgreementAndRepos(db);
  const res = await request(app).get('/margin-calls/suggested').set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  const byRepo = Object.fromEntries(res.body.data.map(r => [r.repoId, r]));
  assert.ok(byRepo['REPO-A'], 'REPO-A (deficit 300k) is suggested');
  assert.ok(byRepo['REPO-C'], 'REPO-C (deficit 150k) is suggested');
  assert.equal(byRepo['REPO-B'], undefined, 'REPO-B (no deficit) not suggested');
  assert.equal(byRepo['REPO-A'].suggestedCallAmount, 300000);
  assert.equal(byRepo['REPO-A'].counterparty, 'ACME');
  assert.equal(byRepo['REPO-A'].agreementId, 'AGR-ACME');
});

test('GET /margin-calls/suggested — 200 empty array when no deficits', async () => {
  const { app, db, cm } = setup();
  db.prepare(`
    INSERT INTO collateral_agreements
      (id, counterparty, agreement_type, base_currency, status, effective_date,
       threshold, minimum_transfer_amount, rounding, call_notice_deadline_time, four_eyes_threshold)
    VALUES ('AGR-OK','X','GMRA','EUR','active','2026-04-01',0,10000,10000,'11:00',1000000)
  `).run();
  db.prepare(`
    INSERT INTO repos
      (id, counterparty, amount, currency, rate, start_date, maturity_date,
       state, required_collateral, posted_collateral, buffer, settlement)
    VALUES ('REPO-OK','X',1000000,'EUR',0.02,'2026-04-01','2026-07-01','Active',500000,600000,0,'T+2')
  `).run();
  const res = await request(app).get('/margin-calls/suggested').set('Authorization', `Bearer ${cm}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

// ── POST /margin-calls/:id/ai-assess ───────────────────────────────────

async function seedIssuedCall(app, cm, tm) {
  await request(app).post('/agreements').set('Authorization', `Bearer ${tm}`).send({
    id: 'AGR-AI', counterparty: 'ACME', agreementType: 'GMRA',
    governingLaw: 'English', baseCurrency: 'EUR', threshold: 0,
    minimumTransferAmount: 10000, rounding: 1000, callNoticeDeadlineTime: '11:00',
    fourEyesThreshold: 10000000, status: 'active', effectiveDate: '2026-04-17',
  });
  await request(app).post('/margin-calls').set('Authorization', `Bearer ${cm}`).send({
    id: 'MC-AI', agreementId: 'AGR-AI', direction: 'received',
    callDate: '2026-04-17', exposureAmount: 1500000, collateralValue: 1000000,
    callAmount: 500000, currency: 'EUR',
  });
}

test('POST /margin-calls/:id/ai-assess — appends commented event with actor_type=agent', async () => {
  const { app, cm, tm } = setup();
  await seedIssuedCall(app, cm, tm);
  const res = await request(app)
    .post('/margin-calls/MC-AI/ai-assess')
    .set('Authorization', `Bearer ${cm}`)
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.event.eventType, 'commented');
  assert.equal(res.body.event.actorType, 'agent');
  assert.ok(res.body.rationale && res.body.rationale.length > 0);
});

test('POST /margin-calls/:id/ai-assess — 403 without respond or issue permissions', async () => {
  const { app, cm, tm, rr } = setup();
  await seedIssuedCall(app, cm, tm);
  const res = await request(app)
    .post('/margin-calls/MC-AI/ai-assess')
    .set('Authorization', `Bearer ${rr}`)
    .send({});
  assert.equal(res.status, 403);
});

test('POST /margin-calls/:id/ai-assess — 404 on missing call', async () => {
  const { app, cm } = setup();
  const res = await request(app)
    .post('/margin-calls/MC-NOPE/ai-assess')
    .set('Authorization', `Bearer ${cm}`)
    .send({});
  assert.equal(res.status, 404);
});
