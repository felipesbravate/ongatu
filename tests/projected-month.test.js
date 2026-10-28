import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, yearsFromDocs } from '../src/tracker/model.js';
import { cardIndicators } from '../src/tracker/indicators.js';

// Oct 28 (Felipe): a coming month is "projected" only until it has a real entry. Built on next year so the months are
// in the future whatever day the tests run.
const Y = String(new Date().getFullYear() + 1);
const years = [{ id: 'y1', year: Y, currency: 'EUR', createdAt: '2026-01-01' }];
const budgets = [
  { id: 'b1', year: Y, type: 'income', group: null, category: null, item: 'Salary', amount: 3000 },
  { id: 'b2', year: Y, type: 'expense', group: 'Fixed', category: 'Habitation', item: 'Rent or mortgage', amount: 1000 },
  { id: 'b3', year: Y, type: 'expense', group: 'Fixed', category: 'Habitation', item: 'Electricity', amount: 80 },
];
const entry = { id: 'e1', year: Y, monthIndex: 1, type: 'expense', group: 'Fixed', category: 'Habitation', item: 'Electricity', description: 'Endesa', amount: 64.3, date: `${Y}-02-03` };
const build = (entries) => createModel({ data: yearsFromDocs(years), entries, overrides: [], budgets, budgetDefaults: [] });

test('a coming month without entries stays projected', () => {
  const m = build([]);
  const y = m.DATA[0];
  assert.equal(m.isFutureMonth(y, 1), true);
  assert.equal(m.isProjectedMonth(y, 1), true);
  assert.equal(m.computeMonth(y, 1).isEstimateMonth, true);
  assert.equal(cardIndicators(m, y, 1).balance.text, 'Projected from budget');
});

test('once it has a real entry it is not projected: no pill, read against its budget, other months unchanged', () => {
  const m = build([entry]);
  const y = m.DATA[0];
  assert.equal(m.isFutureMonth(y, 1), true); // still plannable (Adjust month's budget)
  assert.equal(m.isProjectedMonth(y, 1), false);
  const c = m.computeMonth(y, 1);
  assert.equal(c.isEstimateMonth, false);
  assert.equal(Math.round(c.expenseTotal * 100) / 100, 1064.3); // the real Electricity replaces its 80 budget; Rent keeps its budget
  const r = cardIndicators(m, y, 1);
  assert.notEqual(r.balance.text, 'Projected from budget');
  assert.notEqual(r.expense.text, 'Projected from budget');
  assert.equal(r.expense.text, '99% of 1.080 € budget');
  assert.equal(m.isProjectedMonth(y, 2), true);
  assert.equal(cardIndicators(m, y, 2).income.text, 'Projected from budget');
});
