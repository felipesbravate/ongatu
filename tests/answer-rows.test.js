import test from 'node:test';
import assert from 'node:assert/strict';
import { answerRows } from '../src/tracker/reader.js';

const tx = { date: '2026-10-20', description: 'Shop', amount: 12.5, type: 'expense' };
test("Claude's answer shapes all give the transactions (Oct 21)", () => {
  assert.deepEqual(answerRows([tx]), [tx]);
  assert.deepEqual(answerRows(tx), [tx]);                       // one receipt as a bare object
  assert.deepEqual(answerRows({ transactions: [tx, tx] }), [tx, tx]);
  assert.deepEqual(answerRows({ entries: [tx] }), [tx]);
  assert.deepEqual(answerRows({ result: { x: 1 }, list: [tx] }), [tx]); // any array of transactions
  assert.deepEqual(answerRows([[tx]]), [tx]);
  assert.deepEqual(answerRows([]), []);
  assert.deepEqual(answerRows({ note: 'nothing here' }), []);
  assert.deepEqual(answerRows(null), []);
});
