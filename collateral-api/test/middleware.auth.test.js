const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const { requirePerm, ROLE_PERMS } = require('../src/middleware/auth');

const NEW_PERMS = [
  'canManageAgreements',
  'canIssueCall',
  'canRespondCall',
  'canOpenDispute',
  'canResolveDispute',
  'canApproveFourEyes',
  'canCancelCall',
  'canExportAudit',
];

test('all 8 new permissions exist on every role (default false)', () => {
  for (const role of Object.keys(ROLE_PERMS)) {
    for (const perm of NEW_PERMS) {
      assert.ok(perm in ROLE_PERMS[role], `role ${role} missing perm ${perm}`);
    }
  }
});

test('Collateral Manager gets canIssueCall, canRespondCall, canOpenDispute', () => {
  assert.equal(ROLE_PERMS['Collateral Manager'].canIssueCall, true);
  assert.equal(ROLE_PERMS['Collateral Manager'].canRespondCall, true);
  assert.equal(ROLE_PERMS['Collateral Manager'].canOpenDispute, true);
});

test('Credit Approver role exists and has canApproveFourEyes + canResolveDispute', () => {
  assert.ok(ROLE_PERMS['Credit Approver'], 'Credit Approver role must exist');
  assert.equal(ROLE_PERMS['Credit Approver'].canApproveFourEyes, true);
  assert.equal(ROLE_PERMS['Credit Approver'].canResolveDispute, true);
});

test('Credit Approver does NOT have canIssueCall (separation of duties)', () => {
  assert.equal(ROLE_PERMS['Credit Approver'].canIssueCall, false);
});

test('Treasury Manager gets canCancelCall + canManageAgreements', () => {
  assert.equal(ROLE_PERMS['Treasury Manager'].canCancelCall, true);
  assert.equal(ROLE_PERMS['Treasury Manager'].canManageAgreements, true);
});

test('Risk Reviewer gets canExportAudit (read-only role)', () => {
  assert.equal(ROLE_PERMS['Risk Reviewer'].canExportAudit, true);
  assert.equal(ROLE_PERMS['Risk Reviewer'].readOnly, true);
});

test('requirePerm returns 403 when perm absent', () => {
  const middleware = requirePerm('canApproveFourEyes');
  let statusCode, body;
  const res = {
    status(c) { statusCode = c; return this; },
    json(b) { body = b; return this; },
  };
  let nextCalled = false;
  middleware(
    { user: { role: 'Collateral Manager' } },
    res,
    () => { nextCalled = true; },
  );
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test('requirePerm calls next when perm present', () => {
  const middleware = requirePerm('canIssueCall');
  let nextCalled = false;
  middleware(
    { user: { role: 'Collateral Manager' } },
    { status() { return this; }, json() { return this; } },
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});
