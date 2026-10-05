// Oct 5: renaming a category / sub-category from a month on (planRename).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planRename } from '../src/tracker/rename.js';

const tx = { incomes: [], investments: ['Savings'], expenses: { Fixed: { Home: ['Rent'] } }, investmentSubs: { Funds: ['ETF'] } };
const data = {
  years: [{ id: 'y26', year: '2026', taxonomy: tx }, { id: 'y27', year: '2027', taxonomy: tx }, { id: 'y25', year: '2025', taxonomy: tx }],
  entries: [
    { id: 'e1', year: '2026', monthIndex: 3, type: 'investment', group: 'Funds', item: 'ETF', amount: 1 },   // before: stays
    { id: 'e2', year: '2026', monthIndex: 9, type: 'investment', group: 'Funds', item: 'ETF', amount: 2 },   // from Oct: renamed
    { id: 'e3', year: '2027', monthIndex: 0, type: 'investment', group: 'Funds', item: 'ETF', amount: 3 },   // later year: renamed
    { id: 'e4', year: '2026', monthIndex: 9, type: 'investment', group: null, item: 'Savings', amount: 4 },  // other sub-category
  ],
  overrides: [],
  budgets: [
    { id: 'b1', year: '2026', type: 'investment', group: 'Funds', item: 'ETF', amount: 50 },                // starting budget
    { id: 'b2', year: '2026', monthIndex: 1, type: 'investment', group: 'Funds', item: 'ETF', amount: 60 }, // Feb has its own
  ],
  budgetDefaults: [{ id: 'old', type: 'investment', group: 'Funds', category: null, item: 'ETF', amount: 50 }],
};

test('sub-category: renamed from the month on, earlier months keep the old name and their plan', () => {
  const p = planRename({ level: 'sub', type: 'investment', from: 'Funds', to: 'Index funds', year: '2026', mi: 9, data, taxonomyForYear: () => tx });
  const set = (col, id) => p.sets.find((s) => s.col === col && s.id === id);
  assert.equal(set('entries', 'e1'), undefined);
  assert.equal(set('entries', 'e2').doc.group, 'Index funds');
  assert.equal(set('entries', 'e3').doc.group, 'Index funds');
  assert.equal(set('entries', 'e4'), undefined);
  assert.deepEqual(Object.keys(set('years', 'y26').doc.taxonomy.investmentSubs), ['Index funds']);
  assert.ok(set('years', 'y27') && !set('years', 'y25'), 'that year and later years only');
  assert.equal(set('budgets', 'b1').doc.group, 'Index funds');
  assert.equal(set('budgets', 'b2'), undefined, "February's own budget is history");
  // Jan, Mar…Sep had no own budget: they get a copy of the starting budget with the old name.
  assert.deepEqual(p.adds.map((a) => a.doc.monthIndex), [0, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(p.adds.every((a) => a.doc.group === 'Funds' && a.doc.amount === 50 && !('id' in a.doc)));
  assert.deepEqual(p.deletes, [{ col: 'budgetDefaults', id: 'old' }]);
  assert.ok(p.sets.some((s) => s.col === 'budgetDefaults' && s.doc.group === 'Index funds'));
});

test('category: a new label in that year and later years, data untouched', () => {
  const p = planRename({ level: 'category', type: 'investment', to: 'Nest egg', year: '2026', mi: 9, data, taxonomyForYear: () => tx });
  assert.deepEqual(p.sets.map((s) => [s.col, s.id, s.doc.taxonomy.labels.investment]), [['years', 'y26', 'Nest egg'], ['years', 'y27', 'Nest egg']]);
  assert.equal(p.adds.length + p.deletes.length, 0);
  const c = planRename({ level: 'category', type: 'custom-pets', to: 'Animals', year: '2026', mi: 0, data: { years: [{ id: 'y', year: '2026', taxonomy: { ...tx, custom: [{ type: 'custom-pets', name: 'Pets', subs: {} }] } }] }, taxonomyForYear: () => tx });
  assert.equal(c.sets[0].doc.taxonomy.custom[0].name, 'Animals');
});

test('after the rename, earlier months list the old name only, later months the new one', async () => {
  const { createModel, yearsFromDocs } = await import('../src/tracker/model.js');
  const p = planRename({ level: 'sub', type: 'investment', from: 'Funds', to: 'Index funds', year: '2026', mi: 9, data, taxonomyForYear: () => tx });
  const years = p.sets.filter((s) => s.col === 'years').map((s) => ({ id: s.id, ...s.doc }));
  assert.deepEqual(years.find((y) => y.year === '2027').taxonomy.renames, undefined, 'only the edited year remembers it');
  const ents = data.entries.map((e) => { const s = p.sets.find((x) => x.col === 'entries' && x.id === e.id); return s ? { id: e.id, ...s.doc } : e; });
  const m = createModel({ data: yearsFromDocs(years), entries: ents, overrides: [], budgets: [], budgetDefaults: [] });
  assert.deepEqual(m.subsOf('investment', '2026', 3), [null, 'Funds']);
  assert.deepEqual(m.subsOf('investment', '2026', 9), [null, 'Index funds']);
  assert.deepEqual(m.subsOf('investment', '2027', 0), [null, 'Index funds']);
});
