import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMerchants, learnMerchants, merchantKey, renameMerchantGroup, typedRows, MAX_NAMES, MAX_BYTES } from '../src/tracker/merchants.js';
import { createModel, yearsFromDocs } from '../src/tracker/model.js';

// Nov 18 (Felipe): "Mercat de Sants" on the receipt is Carrefour, and the category the reader guesses is often not
// the one he keeps. Every saved row read from a document is remembered and applied on the next read.
const model = createModel({ data: yearsFromDocs([{ id: 'y', year: '2026', currency: 'EUR', createdAt: '2026-01-01' }]), entries: [], overrides: [], budgets: [], budgetDefaults: [] });
const groceries = model.catOptions('expense', 'Variable', '2026')[0];
const row = (description, extra = {}) => ({ id: 1, date: '2026-11-03', description, readDescription: description, type: 'expense', group: 'Fixed', category: null, item: null, guess: true, amount: 12.4, ...extra });
const asGroceries = { group: 'Variable', category: groceries.category, item: groceries.item };
const D1 = '2026-11-18T10:00:00Z';

test('names compare without case, accents, punctuation or store numbers', () => {
  assert.equal(merchantKey('MERCAT DE SANTS, 0234 Barcelona'), 'mercat de sants barcelona');
  assert.equal(merchantKey('Mercat de Sants'), merchantKey('MERCAT  DE SANTS.'));
  assert.equal(merchantKey('Café Ñandú *4521'), 'cafe nandu');
  assert.equal(merchantKey('0234 5678'), '');
});

test('a renamed row is remembered with its category, and the next read arrives renamed with a "Was" note', () => {
  const saved = [{ ...row('MERCAT DE SANTS'), description: 'Carrefour', ...asGroceries }];
  const { store, changed } = learnMerchants(null, saved, D1);
  assert.equal(changed, true);
  const [r] = applyMerchants([row('Mercat de Sants')], store, model);
  assert.deepEqual([r.description, r.renamedFrom, r.readDescription], ['Carrefour', 'Mercat de Sants', 'Mercat de Sants']);
  assert.deepEqual([r.type, r.group, r.category, r.item, r.guess], ['expense', 'Variable', groceries.category, groceries.item, false]);
  const [other] = applyMerchants([row('Bar Pepe')], store, model);
  assert.deepEqual([other.description, other.renamedFrom, other.guess], ['Bar Pepe', undefined, true], 'other names untouched');
});

test('a row saved under its own name is remembered too: the category comes back, the name and no "Was" note', () => {
  const { store } = learnMerchants(null, [{ ...row('MERCADONA 0412'), ...asGroceries }], D1);
  const [r] = applyMerchants([row('Mercadona')], store, model);
  assert.deepEqual([r.description, r.renamedFrom, r.item, r.guess], ['Mercadona', undefined, groceries.item, false]);
});

test('the latest save wins; saving the same again that day writes nothing; old lists still read', () => {
  let { store } = learnMerchants(null, [{ ...row('MERCAT DE SANTS'), description: 'Carrefour', ...asGroceries }], D1);
  const [r] = applyMerchants([row('MERCAT DE SANTS')], store, model);
  assert.equal(learnMerchants(store, [r], D1).changed, false);
  ({ store } = learnMerchants(store, [{ ...r, description: 'Mercat de Sants' }], '2026-11-19T10:00:00Z'));
  const [back] = applyMerchants([row('Mercat de Sants')], store, model);
  assert.deepEqual([back.description, back.renamedFrom, back.item], ['Mercat de Sants', undefined, groceries.item], 'name dropped, category kept');
  const old = { v: 1, map: { 'mercat de sants': { name: 'Carrefour', type: 'expense', ...asGroceries, at: D1, n: 2 } } };
  assert.equal(applyMerchants([row('MERCAT DE SANTS')], old, model)[0].description, 'Carrefour');
});

test('one name saved twice with different answers in the same save is not learned', () => {
  const { store, changed } = learnMerchants(null, [{ ...row('BIZUM'), description: 'Ana' }, { ...row('BIZUM'), description: 'Rent' }], D1);
  assert.equal(changed, false);
  assert.equal(Object.keys(store.map).length, 0);
});

test('a remembered category that no longer exists in that year is not applied (the name still is)', () => {
  const { store } = learnMerchants(null, [{ ...row('MERCAT DE SANTS'), description: 'Carrefour', group: 'Variable', category: 'Gone', item: 'Old type' }], D1);
  const [r] = applyMerchants([row('MERCAT DE SANTS')], store, model);
  assert.deepEqual([r.description, r.category, r.item, r.guess], ['Carrefour', null, null, true]);
});

test('rows typed by hand teach nothing; the list keeps the most recent and stays under the size limit', () => {
  assert.equal(learnMerchants(null, [{ description: 'Carrefour', type: 'expense' }], D1).changed, false);
  let store = null;
  const word = (i) => [0, 1, 2].map((p) => String.fromCharCode(97 + (Math.floor(i / 26 ** p) % 26))).join('');
  for (let i = 0; i < MAX_NAMES + 5; i++) {
    const day = new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString();
    ({ store } = learnMerchants(store, [{ ...row(`Supermercado del barrio ${word(i)}`), description: 'Some longer shop name ' + i, ...asGroceries }], day));
  }
  assert.ok(JSON.stringify(store).length <= MAX_BYTES + 100, 'fits the document');
  const names = Object.values(store.map).map((m) => m.d);
  assert.ok(names.length > 150, `keeps many (${names.length})`);
  assert.ok(names.includes('Some longer shop name ' + (MAX_NAMES + 4)) && !names.includes('Some longer shop name 0'), 'oldest dropped first');
});

test('a new category for a merchant, typed by hand or saved from a document, follows every name it is known by', () => {
  const restaurants = model.catOptions('expense', 'Variable', '2026').find((o) => o.item !== groceries.item);
  let { store } = learnMerchants(null, [{ ...row('MERCAT DE SANTS 0234'), description: 'Carrefour', ...asGroceries }], D1);
  // Typed in the Add form as "Carrefour" with another category: the document name renamed to Carrefour follows.
  const typed = typedRows([{ type: 'expense', group: 'Variable', category: restaurants.category, item: restaurants.item, description: 'Carrefour', amount: 3, date: '2026-11-20' }]);
  let r = learnMerchants(store, typed, '2026-11-20T10:00:00Z');
  assert.equal(r.changed, true);
  store = r.store;
  const [a] = applyMerchants([row('MERCAT DE SANTS')], store, model);
  const [b] = applyMerchants([row('CARREFOUR')], store, model);
  assert.deepEqual([a.description, a.item, b.description, b.item], ['Carrefour', restaurants.item, 'CARREFOUR', restaurants.item]);
  // A document saved with the first category again moves both back.
  r = learnMerchants(store, [{ ...row('CARREFOUR'), ...asGroceries }], '2026-11-21T10:00:00Z');
  assert.equal(applyMerchants([row('MERCAT DE SANTS')], r.store, model)[0].item, groceries.item);
  assert.equal(typedRows([{ description: 'No type yet' }]).length, 0);
});

test('a renamed sub-category is renamed in the list', () => {
  const { store } = learnMerchants(null, [{ ...row('MERCAT DE SANTS'), description: 'Carrefour', ...asGroceries }], D1);
  const r = renameMerchantGroup(store, 'expense', 'Variable', 'Day to day');
  assert.equal(r.changed, true);
  assert.equal(Object.values(r.store.map)[0].g, 'Day to day');
  assert.equal(renameMerchantGroup(store, 'income', 'Variable', 'X').changed, false);
});
