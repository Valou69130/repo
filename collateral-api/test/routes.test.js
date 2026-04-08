const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.COLLATERAL_DB_PATH = path.join(os.tmpdir(), `collateral-api-test-${process.pid}.db`);

const authRouter = require('../src/routes/auth');
const reposRouter = require('../src/routes/repos');
const assetsRouter = require('../src/routes/assets');
const notificationsRouter = require('../src/routes/notifications');
const { getDb, closeDb } = require('../src/db/schema');
const { seedDemoData } = require('../src/db/demoData');

function getHandler(router, routePath, method, index = 0) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods?.[method],
  );
  return layer.route.stack[index].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const loginHandler = getHandler(authRouter, '/login', 'post');
const createRepoHandler = getHandler(reposRouter, '/', 'post', 1);
const updateAssetHandler = getHandler(assetsRouter, '/:id', 'put', 1);
const createNotificationHandler = getHandler(notificationsRouter, '/', 'post', 1);

test.beforeEach(() => {
  seedDemoData(getDb(), { includeUsers: true });
});

test.after(() => {
  closeDb();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${process.env.COLLATERAL_DB_PATH}${suffix}`, { force: true });
  }
});

test('auth login returns a token for demo credentials', () => {
  const req = { body: { email: 'treasury@banca-demo.ro', password: 'demo1234' } };
  const res = createRes();

  loginHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.body.user.email, 'treasury@banca-demo.ro');
});

test('repos rejects invalid payloads', () => {
  const req = { body: { id: 'R-BAD-1', counterparty: 'Bad Repo' } };
  const res = createRes();

  createRepoHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Missing required repo fields/);
});

test('repos creates a valid repo with linked assets', () => {
  const req = {
    body: {
      id: 'R-2001',
      counterparty: 'Test Counterparty',
      amount: 4_000_000,
      currency: 'RON',
      rate: 5.2,
      startDate: '2026-04-07',
      maturityDate: '2026-04-08',
      state: 'Active',
      requiredCollateral: 4_120_000,
      postedCollateral: 4_220_000,
      buffer: 100_000,
      settlement: 'Awaiting confirmation',
      notes: 'Created in test',
      assets: ['AST-001'],
    },
  };
  const res = createRes();

  createRepoHandler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 'R-2001');
  assert.deepEqual(res.body.assets, ['AST-001']);
});

test('assets rejects invalid status updates', () => {
  const req = { params: { id: 'AST-001' }, body: { status: 'Broken' } };
  const res = createRes();

  updateAssetHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Invalid asset status/);
});

test('notifications validates severity and persists valid entries', () => {
  const invalidReq = { body: { severity: 'Low', text: 'Nope' } };
  const invalidRes = createRes();

  createNotificationHandler(invalidReq, invalidRes);
  assert.equal(invalidRes.statusCode, 400);

  const validReq = { body: { severity: 'Info', text: 'Test notification', target: 'R-1021' } };
  const validRes = createRes();

  createNotificationHandler(validReq, validRes);

  assert.equal(validRes.statusCode, 201);
  assert.equal(validRes.body.text, 'Test notification');
});
