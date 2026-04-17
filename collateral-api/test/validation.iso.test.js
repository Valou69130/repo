const test = require('node:test');
const assert = require('node:assert/strict');
const { isIsoCurrency, isIsoDate } = require('../src/validation');

test('isIsoCurrency accepts 3 uppercase letters', () => {
  assert.equal(isIsoCurrency('EUR'), true);
  assert.equal(isIsoCurrency('USD'), true);
  assert.equal(isIsoCurrency('GBP'), true);
});

test('isIsoCurrency rejects lowercase, wrong length, non-strings', () => {
  assert.equal(isIsoCurrency('eur'), false);
  assert.equal(isIsoCurrency('EU'), false);
  assert.equal(isIsoCurrency('EURO'), false);
  assert.equal(isIsoCurrency(''), false);
  assert.equal(isIsoCurrency(null), false);
  assert.equal(isIsoCurrency(123), false);
});

test('isIsoDate accepts YYYY-MM-DD', () => {
  assert.equal(isIsoDate('2026-04-17'), true);
  assert.equal(isIsoDate('1999-12-31'), true);
});

test('isIsoDate rejects malformed strings', () => {
  assert.equal(isIsoDate('2026/04/17'), false);
  assert.equal(isIsoDate('17-04-2026'), false);
  assert.equal(isIsoDate('2026-4-17'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-04-32'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(null), false);
});
