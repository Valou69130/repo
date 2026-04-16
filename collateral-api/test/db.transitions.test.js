const test = require('node:test');
const assert = require('node:assert/strict');
const { stateForEvent, allowedTransitions, STATES, EVENTS } = require('../src/db/transitions');

test('STATES enumerates the nine spec states', () => {
  assert.deepEqual([...STATES].sort(), [
    'agreed', 'cancelled', 'delivered', 'disputed', 'draft',
    'issued', 'pending_four_eyes', 'resolved', 'settled',
  ]);
});

test('stateForEvent: draft + issued → issued', () => {
  assert.equal(stateForEvent('issued', 'draft'), 'issued');
});

test('stateForEvent: draft + four_eyes_requested → pending_four_eyes', () => {
  assert.equal(stateForEvent('four_eyes_requested', 'draft'), 'pending_four_eyes');
});

test('stateForEvent: issued + accepted → agreed', () => {
  assert.equal(stateForEvent('accepted', 'issued'), 'agreed');
});

test('stateForEvent: pending_four_eyes + four_eyes_granted → agreed', () => {
  assert.equal(stateForEvent('four_eyes_granted', 'pending_four_eyes'), 'agreed');
});

test('stateForEvent: pending_four_eyes + four_eyes_rejected → disputed', () => {
  assert.equal(stateForEvent('four_eyes_rejected', 'pending_four_eyes'), 'disputed');
});

test('stateForEvent: issued + dispute_opened → disputed', () => {
  assert.equal(stateForEvent('dispute_opened', 'issued'), 'disputed');
});

test('stateForEvent: disputed + dispute_agreed → agreed', () => {
  assert.equal(stateForEvent('dispute_agreed', 'disputed'), 'agreed');
});

test('stateForEvent: disputed + dispute_withdrawn → cancelled', () => {
  assert.equal(stateForEvent('dispute_withdrawn', 'disputed'), 'cancelled');
});

test('stateForEvent: agreed + delivery_marked → delivered', () => {
  assert.equal(stateForEvent('delivery_marked', 'agreed'), 'delivered');
});

test('stateForEvent: delivered + settled → settled', () => {
  assert.equal(stateForEvent('settled', 'delivered'), 'settled');
});

test('stateForEvent: settled + resolved → resolved', () => {
  assert.equal(stateForEvent('resolved', 'settled'), 'resolved');
});

test('stateForEvent: any non-terminal + cancelled → cancelled', () => {
  for (const s of ['draft', 'issued', 'pending_four_eyes', 'agreed', 'delivered', 'disputed']) {
    assert.equal(stateForEvent('cancelled', s), 'cancelled', `from ${s}`);
  }
});

test('stateForEvent: comment / deadline_breached / dispute_proposed / dispute_escalated do not change state', () => {
  for (const e of ['commented', 'deadline_breached', 'dispute_proposed', 'dispute_escalated']) {
    assert.equal(stateForEvent(e, 'issued'), 'issued');
    assert.equal(stateForEvent(e, 'disputed'), 'disputed');
  }
});

test('stateForEvent: terminal states reject any progressing event', () => {
  for (const terminal of ['resolved', 'cancelled']) {
    assert.throws(
      () => stateForEvent('accepted', terminal),
      /terminal state/,
    );
  }
});

test('stateForEvent: invalid transitions throw', () => {
  assert.throws(() => stateForEvent('settled', 'draft'), /invalid transition/);
  assert.throws(() => stateForEvent('accepted', 'agreed'), /invalid transition/);
  assert.throws(() => stateForEvent('delivery_marked', 'issued'), /invalid transition/);
});

test('allowedTransitions returns valid next events for a given state', () => {
  const fromIssued = allowedTransitions('issued');
  assert.ok(fromIssued.includes('accepted'));
  assert.ok(fromIssued.includes('dispute_opened'));
  assert.ok(fromIssued.includes('four_eyes_requested'));
  assert.ok(fromIssued.includes('cancelled'));
  assert.ok(!fromIssued.includes('settled'));
});

test('allowedTransitions returns empty array for terminal states', () => {
  assert.deepEqual(allowedTransitions('resolved'), []);
  assert.deepEqual(allowedTransitions('cancelled'), []);
});
