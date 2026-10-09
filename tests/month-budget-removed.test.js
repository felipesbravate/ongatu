import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, yearsFromDocs } from '../src/tracker/model.js';

// Oct 9 (Felipe): a type removed in "Adjust month's budget" leaves that month's Tracker.
const taxonomy = { incomes: ['Salary', 'Bonus'], investments: [], expenses: { Fixed: { Habitation: ['Rent', 'Home help'], Bank: ['Fees', 'Taxes'], Education: ['College'] } } };
const budget = (mi, type, group, category, item, amount) => ({ id: item + mi, year: '2030', monthIndex: mi, type, group, category, item, amount });
const m = createModel({
  data: yearsFromDocs([{ id: 'y', year: '2030', currency: 'EUR', createdAt: '2030-01-01', taxonomy }]),
  entries: [{ id: 'e1', year: '2030', monthIndex: 4, type: 'expense', group: 'Fixed', category: 'Bank', item: 'Taxes', amount: 12, description: 'x', date: '2030-05-02' }],
  overrides: [],
  budgets: [budget(4, 'expense', 'Fixed', 'Habitation', 'Rent', 900), budget(4, 'expense', 'Fixed', 'Bank', 'Fees', 5), budget(4, 'income', null, null, 'Salary', 3000)],
  budgetDefaults: [],
});
const y = m.DATA[0];
const items = (bd) => bd.rows.map((c) => [c.category, c.items.map((r) => r.item)]);

test('the month budget decides which types the Tracker lists that month', () => {
  // Home help and College were removed; Education has nothing left, so the group goes too.
  // Taxes was removed but has an entry this month, so it stays.
  assert.deepEqual(items(m.buildBreakdown(y, 4, 'Fixed')), [['Habitation', ['Rent']], ['Bank', ['Fees', 'Taxes']]]);
  assert.deepEqual(m.buildBreakdown(y, 4, 'Income').rows.map((r) => r.item), ['Salary']);
});

test('months without their own budget still list every type of the year', () => {
  assert.deepEqual(items(m.buildBreakdown(y, 5, 'Fixed')), [['Habitation', ['Rent', 'Home help']], ['Bank', ['Fees', 'Taxes']], ['Education', ['College']]]);
  assert.deepEqual(m.buildBreakdown(y, 5, 'Income').rows.map((r) => r.item), ['Salary', 'Bonus']);
});
