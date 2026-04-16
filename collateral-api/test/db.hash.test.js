const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, stableStringify, GENESIS_HASH } = require('../src/db/hash');

test('sha256 returns 64-char hex', () => {
  const h = sha256('hello');
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('sha256 is deterministic', () => {
  assert.equal(sha256('abc'), sha256('abc'));
});

test('GENESIS_HASH is a 64-char hex zero-prefix sentinel', () => {
  assert.equal(GENESIS_HASH.length, 64);
  assert.match(GENESIS_HASH, /^[0-9a-f]{64}$/);
});

test('stableStringify produces same output regardless of key order', () => {
  const a = stableStringify({ b: 1, a: 2, c: { y: 1, x: 2 } });
  const b = stableStringify({ a: 2, c: { x: 2, y: 1 }, b: 1 });
  assert.equal(a, b);
});

test('stableStringify handles arrays, numbers, strings, null, booleans', () => {
  const out = stableStringify({ s: 'x', n: 1, b: true, z: null, arr: [3, 1, 2] });
  assert.equal(out, '{"arr":[3,1,2],"b":true,"n":1,"s":"x","z":null}');
});
