import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtNum, parseAmount } from '../src/tracker/model.js';
import { fmtMoney, fmtMoneyShort } from '../src/ui/format.js';

test('amounts are shown in European format', () => {
  assert.equal(fmtNum(1163.59), '1.163,59');
  assert.equal(fmtNum(6.06), '6,06');
  assert.equal(fmtMoney(1234.5, 'EUR'), '1.234,50\u00a0€');
  assert.equal(fmtMoney(-12, 'SEK'), '-12,00\u00a0kr');
  assert.equal(fmtMoneyShort(1318.4, 'EUR'), '1.318\u00a0€');
});

test('typed amounts are read the European way, and a plain dot decimal still works', () => {
  assert.equal(parseAmount('1.163,59'), 1163.59);
  assert.equal(parseAmount('1163,59'), 1163.59);
  assert.equal(parseAmount('6,06'), 6.06);
  assert.equal(parseAmount('1163.59'), 1163.59);
  assert.equal(parseAmount('1.163'), 1163);
  assert.equal(parseAmount('12.500'), 12500);
  assert.equal(parseAmount('€ 2.000.000,00'), 2000000);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount(64.2), 64.2);
});
