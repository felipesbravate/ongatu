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
