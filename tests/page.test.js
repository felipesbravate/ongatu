import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackerCsp } from '../src/lib/headers.js';
import { CATS } from '../src/tracker/model.js';

test('tracker CSP is strict in production', () => {
  const c = trackerCsp('abc');
  assert.match(c, /script-src 'self' 'nonce-abc' 'strict-dynamic'/);
  assert.ok(!/unsafe-eval/.test(c));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(c));
  assert.match(c, /default-src 'none'/);
  assert.match(c, /frame-ancestors 'none'/);
  assert.match(c, /connect-src 'self';/);
});

test('the starter categories hold no personal data', () => {
  assert.ok(!/felipe|sbravate|barcelona/i.test(JSON.stringify(CATS)));
});

test('pdf.js is opened with eval disabled (hardening against CVE-2024-4367-style font exploits)', () => {
  const src = readFileSync(new URL('../src/tracker/reader.js', import.meta.url), 'utf8');
  assert.match(src, /getDocument\(\{[^}]*isEvalSupported:\s*false/);
});

test('no page source loads a third-party script host', () => {
  for (const f of ['../app/page.jsx', '../src/tracker/TrackerApp.jsx', '../src/tracker/reader.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/<script[^>]+src="https?:/.test(src) && !/cdnjs|jsdelivr|unpkg/.test(src), f);
  }
});

// "Adjust month's budget": a month's own budget replaces the starting budget for that month only.
test('month budget replaces the starting budget for its month', async () => {
  const { createModel, yearsFromDocs } = await import('../src/tracker/model.js');
  const years = [{ id: 'y', year: '2031', currency: 'EUR' }];
  const budgets = [
    { id: 'a', year: '2031', type: 'expense', group: 'Fixed', category: 'Home', item: 'Rent', amount: 800 },
    { id: 'b', year: '2031', type: 'expense', group: 'Fixed', category: 'Home', item: 'Alarm', amount: 30 },
    { id: 'c', year: '2031', monthIndex: 2, type: 'expense', group: 'Fixed', category: 'Home', item: 'Rent', amount: 950 },
  ];
  const m = createModel({ data: yearsFromDocs(years), entries: [], overrides: [], budgets, budgetDefaults: [] });
  const y = m.DATA.find((d) => d.year === '2031');
  assert.equal(m.computeMonth(y, 1).byGroup.Fixed, 830);
  assert.equal(m.computeMonth(y, 2).byGroup.Fixed, 950); // Alarm left out of March's own budget
  assert.deepEqual(m.monthBudgetRows(y, 2).map((r) => [r.item, r.amount]), [['Rent', 950]]);
  assert.ok(m.canAdjustMonthBudget(y, 0));
});

// Oct 4: an account with no saved year sees a stand-in for the current year; it must still be editable (Juliana).
test('the stand-in year (no saved years) can have its months budgeted', async () => {
  const { createModel, yearsFromDocs, currentYearLabel } = await import('../src/tracker/model.js');
  const m = createModel({ data: yearsFromDocs([]), entries: [], overrides: [], budgets: [], budgetDefaults: [] });
  const y = m.DATA[0];
  assert.ok(y.isPlaceholder && y.year === currentYearLabel());
  const cur = new Date().getMonth();
  assert.ok(m.canAdjustMonthBudget(y, cur));
  assert.ok(m.canAdjustMonthBudget(y, 0));
});

// Oct 4: boards built however people want — custom categories (money out), and sub-categories anywhere.
test('custom categories count as money out; Income/Savings sub-categories add up; old boards unchanged', async () => {
  const { createModel, yearsFromDocs, customTypeOf, copyTaxonomy, addTypeToTaxonomy, addSubToTaxonomy } = await import('../src/tracker/model.js');
  const phil = customTypeOf('Philanthropy');
  assert.equal(phil, 'custom-philanthropy');
  const tx = copyTaxonomy({ incomes: ['Salary'], investments: ['Savings'], expenses: { Fixed: { Home: ['Rent'] } } });
  addSubToTaxonomy(tx, 'investment', 'Funds');
  addTypeToTaxonomy(tx, { type: 'investment', group: 'Funds', category: null, item: 'ETF' });
  addTypeToTaxonomy(tx, { type: phil, group: 'Doctors without borders', category: 'Monthly', item: 'Donation' }, 'Philanthropy');
  addTypeToTaxonomy(tx, { type: 'expense', group: 'Pets', category: 'Cat', item: 'Food' });
  const years = [{ id: 'y', year: '2031', currency: 'EUR', taxonomy: tx }];
  const e = (o) => ({ year: '2031', monthIndex: 0, amount: 0, date: '2031-01-05', ...o });
  const entries = [
    e({ type: 'income', group: null, category: null, item: 'Salary', amount: 3000 }),
    e({ type: 'investment', group: null, category: null, item: 'Savings', amount: 100 }),
    e({ type: 'investment', group: 'Funds', category: null, item: 'ETF', amount: 200 }),
    e({ type: 'expense', group: 'Fixed', category: 'Home', item: 'Rent', amount: 1000 }),
    e({ type: 'expense', group: 'Pets', category: 'Cat', item: 'Food', amount: 50 }),
    e({ type: phil, group: 'Doctors without borders', category: 'Monthly', item: 'Donation', amount: 30 }),
  ];
  const m = createModel({ data: yearsFromDocs(years), entries, overrides: [], budgets: [], budgetDefaults: [] });
  const y = m.DATA[0];
  const c = m.computeMonth(y, 0);
  assert.equal(c.income, 3000);
  assert.equal(c.invest, 300, 'savings without and with a sub-category');
  assert.equal(c.byGroup.Pets, 50, "the board's own Expenses sub-category");
  assert.equal(c.byCustom[phil], 30);
  assert.equal(c.expenseTotal, 1080, 'custom category inside Expenses (money out)');
  assert.equal(c.balance, 3000 - 300 - 1080);
  assert.deepEqual(m.kindsOf('2031').map((k) => k.label), ['Income', 'Savings and investments', 'Expenses', 'Philanthropy']);
  assert.deepEqual(m.subsOf(phil, '2031'), ['Doctors without borders']);
  const bd = m.buildBreakdown(y, 0, phil, 'Doctors without borders');
  assert.deepEqual(bd.rows.map((r) => [r.category, r.amount]), [['Monthly', 30]]);
  const inv = m.buildBreakdown(y, 0, 'Investments');
  assert.equal(inv.flat, false);
  assert.deepEqual(inv.rows.map((r) => [r.category, r.amount]), [['Savings and investments', 100], ['Funds', 200]]);
  assert.ok(m.typeOptsForYear('2031').some((t) => t.key === phil + ':Doctors without borders' && t.label === 'Philanthropy/Doctors without borders'));
  // An old board (no new fields) computes exactly as before.
  const old = createModel({ data: yearsFromDocs([{ id: 'o', year: '2031', currency: 'EUR', taxonomy: { incomes: ['Salary'], investments: [], expenses: { Fixed: { Home: ['Rent'] } } } }]), entries: [entries[0], entries[1], entries[3]], overrides: [], budgets: [], budgetDefaults: [] });
  const oc = old.computeMonth(old.DATA[0], 0);
  assert.deepEqual([oc.income, oc.invest, oc.expenseTotal, oc.balance, Object.keys(oc.byGroup)], [3000, 100, 1000, 1900, ['Fixed', 'Variable', 'Extra', 'Additional']]);
  assert.equal(old.buildBreakdown(old.DATA[0], 0, 'Investments').flat, true);
});
