import test from 'node:test';
import assert from 'node:assert/strict';
import { cardIndicators } from '../src/tracker/indicators.js';

// Oct 9: the cards' details line. A stand-in model: months 0-8 of 2026 have figures, "now" is September (mi 8).
function fake({ months, budgets = [], nowMi = 8 }) {
  const y = { year: '2026', currency: 'EUR' };
  const comp = (mi) => { const m = months[mi] || { income: 0, invest: 0, byGroup: {} }; const expenseTotal = Object.values(m.byGroup).reduce((a, b) => a + b, 0); return { ...m, expenseTotal, balance: m.income - m.invest - expenseTotal }; };
  return { y, model: { DATA: [y], computeMonth: (_y, mi) => comp(mi), monthHasData: (_y, mi) => !!months[mi], isFutureMonth: (_y, mi) => mi > nowMi, budgetsFor: () => budgets } };
}
const NOW = new Date(2026, 8, 15);
const mo = (income, invest, fixed, variable = 0) => ({ income, invest, byGroup: { Fixed: fixed, Variable: variable } });

test('finished month compares with the previous month (incomes with the 3-month average)', () => {
  const { y, model } = fake({ months: { 4: mo(3000, 300, 1500), 5: mo(3000, 300, 1500), 6: mo(3000, 300, 1500, 100), 7: mo(3300, 600, 1460) } });
  const r = cardIndicators(model, y, 7, NOW);
  assert.deepEqual(r.expense, { tone: 'good', dir: 'down', text: '€140 vs Jul' });
  assert.deepEqual(r.income, { tone: 'good', dir: 'up', text: '10% vs 3‑mo avg' });
  assert.equal(r.invest.head, '18% of incomes');
  assert.deepEqual([r.invest.tone, r.invest.dir, r.invest.text], ['good', 'up', '8 pts vs Jul']);
  assert.equal(r.balance.head, 'Kept 38% of incomes');
  assert.deepEqual(r.group('Variable', 'last month'), { tone: 'good', dir: 'down', text: '€100 vs last month' });
  assert.deepEqual(r.group('Fixed', 'last month'), { tone: 'good', dir: 'down', text: '€40 vs last month' });
});

test('"same as" when nothing moved; red when expenses rise', () => {
  const { y, model } = fake({ months: { 6: mo(3000, 300, 1500), 7: mo(3000, 300, 1600) } });
  const r = cardIndicators(model, y, 7, NOW);
  assert.deepEqual(r.expense, { tone: 'bad', dir: 'up', text: '€100 vs Jul' });
  assert.equal(r.invest.dir, 'flat');
  assert.equal(r.invest.text, 'same as Jul');
});

test('current month uses the budget, otherwise the 3-month average', () => {
  const budgets = [{ type: 'income', amount: 4000 }, { type: 'expense', group: 'Fixed', amount: 2100 }, { type: 'investment', amount: 400 }];
  const months = { 5: mo(4000, 400, 2000), 6: mo(4000, 400, 2000), 7: mo(4000, 400, 2000), 8: mo(3520, 300, 1575) };
  let { y, model } = fake({ months, budgets });
  let r = cardIndicators(model, y, 8, NOW);
  assert.deepEqual(r.income, { tone: 'neutral', dir: null, text: '88% of expected' });
  assert.deepEqual(r.expense, { tone: 'good', dir: null, text: '75% of €2.100 budget' });
  assert.equal(r.invest.text, '1 pt vs plan');
  ({ y, model } = fake({ months: { ...months, 8: mo(3520, 300, 2310) }, budgets }));
  assert.equal(cardIndicators(model, y, 8, NOW).expense.tone, 'bad');
  ({ y, model } = fake({ months }));
  r = cardIndicators(model, y, 8, NOW);
  assert.deepEqual(r.expense, { tone: 'neutral', dir: null, text: '79% of €2.000 avg' });
  assert.deepEqual(r.income, { tone: 'neutral', dir: null, text: '88% of 3‑mo avg' });
});

test('future months and months with nothing before them', () => {
  const { y, model } = fake({ months: { 0: mo(3000, 0, 1000) } });
  const r = cardIndicators(model, y, 10, NOW);
  for (const k of ['balance', 'income', 'expense', 'invest']) assert.equal(r[k].text, 'Projected from budget');
  const first = cardIndicators(model, y, 0, NOW);
  assert.equal(first.expense.text, 'Nothing to compare yet');
  assert.equal(first.invest.text, '0% of incomes');
});
