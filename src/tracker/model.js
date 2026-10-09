// The tracker's data model: years, entries, overrides and budgets in; everything the screens show out.
// Ported from the legacy page (src/legacy/tracker.template.html) with the logic unchanged, so the React
// screens compute exactly the same figures. createModel() takes one snapshot of the data; make a new model
// whenever the data changes (that is also what resets the estimate caches, like the legacy renderAll()).
//
// Accounts have no spreadsheet-sourced years (the multi-user build's BASE_YEARS is always empty), so every
// year is a stored year: its items come from entries, starting budgets and projections.

export const EXP_GROUPS = ['Fixed', 'Variable', 'Extra', 'Additional'];
export const GROUP_COLOR = { Fixed: 'var(--group-fixed)', Variable: 'var(--group-variable)', Extra: 'var(--group-extra)', Additional: 'var(--group-additional)', Income: 'var(--income)', Investments: 'var(--invest)' };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));
const BUDGET_WINDOW = 12; // months of trailing history a budget suggestion is averaged over

// Generic starter taxonomy for a year that has none (same list as public/legacy/taxonomy.js).
export const CATS = {
  incomes: ['Salary', 'Freelance', 'Bonus', 'Other income'],
  investments: ['Savings', 'Pension', 'Stocks & funds', 'Crypto', 'Other investments'],
  expenses: {
    Fixed: { Habitation: ['Rent or mortgage', 'Electricity', 'Water', 'Gas', 'Internet', 'Phone'], Bank: ['Bank fees', 'Loan payment'], Insurances: ['Health insurance', 'Home insurance', 'Car insurance'], Education: ['Tuition', 'Courses'], Other: ['Subscriptions'] },
    Variable: { Food: ['Groceries', 'Restaurants'], Transport: ['Public transport', 'Fuel', 'Taxi'], Health: ['Pharmacy', 'Doctor'], 'Personal care': ['Haircut', 'Cosmetics'], 'Credit card': ['Credit card payment'], Others: ['Miscellaneous'] },
    Extra: { Health: ['Dentist', 'Specialist'], 'Maintence and prevention': ['Home repairs', 'Car maintenance'] },
    Additional: { Fun: ['Cinema and events', 'Hobbies'], Clothes: ['Clothes', 'Shoes'], Trips: ['Flights', 'Hotels'], Others: ['Gifts', 'Other'] },
  },
};

// Type/sub-type as one pickable value (the review table's Type column). Order = the Type controller (52:3443).
export const TYPE_OPTS = [
  { key: 'income', type: 'income', group: null, label: 'Income' },
  { key: 'investment', type: 'investment', group: null, label: 'Savings/Investment' },
  { key: 'expense:Fixed', type: 'expense', group: 'Fixed', label: 'Expenses/Fixed' },
  { key: 'expense:Variable', type: 'expense', group: 'Variable', label: 'Expenses/Variable' },
  { key: 'expense:Additional', type: 'expense', group: 'Additional', label: 'Expenses/Additional' },
  { key: 'expense:Extra', type: 'expense', group: 'Extra', label: 'Expenses/Extra' },
];
export const typeKeyOf = (type, group) => (group ? type + ':' + group : type);

// ---- the board (Oct 4–6) ----
// Felipe (Oct 5–6): Income, Savings and investments and Expenses are the only categories: always there, never created,
// deleted or renamed. Sub-categories and groups are the user's. A year's taxonomy holds:
//   incomes / investments: [types]  (no sub-category);  incomeSubs / investmentSubs: { [sub-category]: [types] }
//   expenses: { [sub-category]: { [group]: [types] } }  (Fixed, Variable, Extra, Additional, or the user's own)
// Entries keep { type, group (= sub-category, null when none), category (= group name, expenses only), item }.
/** Types whose rows sit in named groups (Habitation, Food…): Expenses. */
export const hasGroups = (t) => t === 'expense';
export const KIND_LABEL = { income: 'Income', investment: 'Savings and investments', expense: 'Expenses' };
/** Label of a category. */
export const typeLabel = (TX, type) => KIND_LABEL[type] || type;

export const currentYearLabel = () => String(new Date().getFullYear());
export function todayISO() { const d = new Date(); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export const yearNum = (l) => parseInt(l, 10);
export const yearLabelOfDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).slice(0, 4) : currentYearLabel());
export const periodKeyOfDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).slice(0, 7) : null);
export const periodLabel = (key) => { const m = /^(\d{4})-(\d{2})$/.exec(key || ''); return m ? `${MONTH_NAMES[parseInt(m[2], 10) - 1]} ${m[1]}` : ''; };
export const fmtDateEU = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ''); };
export const periodMismatch = (dateISO, key) => { const dk = periodKeyOfDate(dateISO); return !dk || !key || dk > key; };
// From the 25th of December, January of the next year is open for entries even though that year does not exist yet.
export const openNextYearLabel = (now = new Date()) => ((now.getMonth() === 11 && now.getDate() >= 25) ? String(now.getFullYear() + 1) : null);
export const fmtNum = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const parseAmount = (v) => {
  if (typeof v === 'number') return isFinite(v) ? Math.abs(v) : 0;
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');   // European: 1.163,59
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // dots as thousands only: 1.163 = 1163
  const n = parseFloat(s);
  return isFinite(n) ? Math.abs(n) : 0;
};
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
export const findIn = (list, v) => { const n = norm(v); return (list || []).find((x) => norm(x) === n) || null; };
function slugPart(s) { return String(s || '-').replace(/[^a-zA-Z0-9_\-.~:@+]/g, '-').slice(0, 60) || '-'; }
// Deterministic id for a budgetDefaults doc, so saving an edited suggestion is a plain set().
export const budgetDefaultDocId = (type, group, category, item) => [type, group || '-', category || '-', item].map(slugPart).join('__');

function emptyYearObj(yearLabel, currency) {
  const expenses = {};
  EXP_GROUPS.forEach((g) => { expenses[g] = []; });
  return { year: yearLabel, currency, months: MONTH_NAMES.slice(), incomes: [], investments: [], expenses };
}

/** Stored year docs -> the year list (DATA), in year order, each label once. */
export function yearsFromDocs(docs) {
  const yNum = (y) => { const n = parseInt(y.year, 10); return isNaN(n) ? Infinity : n; };
  const extra = (docs || []).slice().sort((a, b) => (yNum(a) === yNum(b) ? 0 : yNum(a) < yNum(b) ? -1 : 1) || (a.createdAt || '').localeCompare(b.createdAt || '') || (a.id < b.id ? -1 : 1));
  const seen = new Set();
  const data = extra.filter((y) => !seen.has(y.year) && seen.add(y.year)).map((y) => {
    const o = emptyYearObj(y.year, y.currency);
    o.dbId = y.id; o.isExtra = true; o.taxonomy = y.taxonomy || null;
    return o;
  });
  // Until the user's own years load (or if they delete them all), show an empty placeholder for the current year.
  if (!data.length) { const o = emptyYearObj(currentYearLabel(), 'EUR'); o.isPlaceholder = true; data.push(o); }
  return data;
}

/** Declares a sub-category (no types yet) on a taxonomy. */
export function addSubToTaxonomy(tx, type, sub) {
  if (!sub) return tx;
  if (type === 'expense') { tx.expenses = tx.expenses || {}; tx.expenses[sub] = tx.expenses[sub] || {}; }
  else if (type === 'income' || type === 'investment') { const k = type === 'income' ? 'incomeSubs' : 'investmentSubs'; tx[k] = tx[k] || {}; tx[k][sub] = tx[k][sub] || []; }
  return tx;
}
/** Declares an (empty) group of an Expenses sub-category. */
export function addGroupToTaxonomy(tx, sub, group) {
  if (!sub || !group) return tx;
  tx.expenses = tx.expenses || {}; const g = tx.expenses[sub] || (tx.expenses[sub] = {}); g[group] = g[group] || [];
  return tx;
}
/** Adds one type ({ type, group, category, item }) to a taxonomy, in place. */
export function addTypeToTaxonomy(tx, { type, group, category, item }) {
  const add = (arr) => { if (item && !arr.includes(item)) arr.push(item); };
  if (type === 'expense') { tx.expenses = tx.expenses || {}; const g = tx.expenses[group] || (tx.expenses[group] = {}); add(g[category] || (g[category] = [])); }
  else if (type === 'income' || type === 'investment') {
    if (group) { const k = type === 'income' ? 'incomeSubs' : 'investmentSubs'; tx[k] = tx[k] || {}; add(tx[k][group] || (tx[k][group] = [])); }
    else add(type === 'income' ? (tx.incomes || (tx.incomes = [])) : (tx.investments || (tx.investments = [])));
  }
  return tx;
}

/**
 * Oct 5 (Felipe): Income, Savings and investments and Expenses are the only categories. Boards made while custom
 * categories existed (Oct 4–5) are read with each custom category folded into Expenses: it becomes an Expenses
 * sub-category with the same name, its sub-categories become groups (its groups too, for types without a sub-category;
 * "General" when neither). It was money out already, so totals and the balance don't move. Read-time only: a doc is
 * rewritten in the new shape the next time it is saved.
 */
const isLegacyCustom = (t) => typeof t === 'string' && t.startsWith('custom-');
export function foldLegacyCustom(data) {
  const cols = ['entries', 'overrides', 'budgets', 'budgetDefaults'];
  const years = data.years || [];
  const legacyTx = (tx) => !!(tx && ((tx.custom && tx.custom.length) || tx.labels));
  if (!years.some((y) => legacyTx(y.taxonomy)) && !cols.some((c) => (data[c] || []).some((d) => isLegacyCustom(d.type)))) return data;
  const names = {};
  years.forEach((y) => ((y.taxonomy && y.taxonomy.custom) || []).forEach((c) => { if (c.name) names[c.type] = c.name; }));
  const nameOf = (t) => names[t] || (t.slice(7).replace(/-/g, ' ').replace(/^./, (ch) => ch.toUpperCase()) || 'Other');
  const out = { ...data };
  out.years = years.map((y) => {
    if (!legacyTx(y.taxonomy)) return y;
    const custom = y.taxonomy.custom || [];
    const tx = copyTaxonomy(y.taxonomy);
    custom.forEach((c) => {
      const exp = tx.expenses || (tx.expenses = {});
      const g = exp[c.name] || (exp[c.name] = {});
      Object.entries(c.subs || {}).forEach(([sub, groups]) => {
        if (sub && !Object.keys(groups || {}).length) g[sub] = g[sub] || [];
        Object.entries(groups || {}).forEach(([grp, types]) => {
          const arr = g[sub || grp || 'General'] || (g[sub || grp || 'General'] = []);
          (types || []).forEach((t) => { if (!arr.includes(t)) arr.push(t); });
        });
      });
    });
    if (tx.renames) tx.renames = tx.renames.filter((r) => !isLegacyCustom(r.type));
    return { ...y, taxonomy: tx };
  });
  const fold = (d) => (isLegacyCustom(d.type) ? { ...d, type: 'expense', group: nameOf(d.type), category: d.group || d.category || 'General' } : d);
  cols.forEach((c) => { if (data[c]) out[c] = data[c].map(fold); });
  return out;
}

/** A deep copy of a taxonomy, new fields included. */
export function copyTaxonomy(base) {
  const b = base || {};
  const out = { incomes: (b.incomes || []).slice(), investments: (b.investments || []).slice(), expenses: {} };
  Object.keys(b.expenses || {}).forEach((g) => { out.expenses[g] = {}; Object.keys(b.expenses[g]).forEach((c) => { out.expenses[g][c] = b.expenses[g][c].slice(); }); });
  ['incomeSubs', 'investmentSubs'].forEach((k) => { if (b[k]) { out[k] = {}; Object.keys(b[k]).forEach((g) => { out[k][g] = b[k][g].slice(); }); } });
  if (b.renames) out.renames = b.renames.map((r) => ({ ...r }));
  if (b.removed) out.removed = b.removed.map((r) => ({ ...r }));
  return out;
}

/**
 * @param {{ data: any[], entries: any[], overrides: any[], budgets: any[], budgetDefaults: any[] }} s
 */
export function createModel({ data: DATA, entries: ENTRIES, overrides: OVERRIDES, budgets: BUDGETS, budgetDefaults: BUDGET_DEFAULTS }) {
  const ESTIMATE_CACHE = new Map();
  const ROSTER_CACHE = new Map();
  const listOf = (y, type, group) => (type === 'income' ? (group ? [] : y.incomes) : type === 'investment' ? (group ? [] : y.investments) : type === 'expense' ? (y.expenses[group] || []) : []);
  // Same sub-category (null-safe) and, for grouped types, the same group. Income and savings entries always carry a
  // null group unless the board gave them sub-categories, so this reads old data exactly as before.
  const sameGroup = (a, b) => (a || null) === (b || null);
  const sameCat = (type, a, b) => !hasGroups(type) || (a || null) === (b || null);

  const entriesFor = (yearLabel, mi) => ENTRIES.filter((e) => e.year === yearLabel && e.monthIndex === mi);
  const entriesForYear = (yearLabel) => ENTRIES.filter((e) => e.year === yearLabel);
  const sumItems = (items, mi) => items.reduce((a, it) => a + (it.values[mi] || 0), 0);
  const sumItemsYear = (items) => items.reduce((a, it) => a + it.values.reduce((x, y) => x + (y || 0), 0), 0);

  function currentYearMonthIndex() {
    const now = new Date();
    const yi = DATA.findIndex((y) => y.year === String(now.getFullYear()));
    return yi === -1 ? null : { yearIdx: yi, monthIndex: now.getMonth() };
  }
  function monthHasData(y, mi) {
    const inc = sumItems(y.incomes, mi);
    const exp = EXP_GROUPS.reduce((a, g) => a + sumItems(y.expenses[g], mi), 0);
    return (inc + exp) !== 0 || entriesFor(y.year, mi).length > 0;
  }
  function isFutureMonth(y, mi) {
    const now = new Date();
    const yNum = parseInt(y.year, 10);
    if (isNaN(yNum)) return false;
    if (yNum !== now.getFullYear()) return yNum > now.getFullYear();
    return mi > now.getMonth();
  }
  function defaultMonth(y) {
    for (let i = 11; i >= 0; i--) { if (!isFutureMonth(y, i) && monthHasData(y, i)) return i; }
    const now = new Date();
    return parseInt(y.year, 10) === now.getFullYear() ? now.getMonth() : 0;
  }

  function realSheetValue(y, mi, type, group, category, itemName) {
    let v = 0;
    listOf(y, type, group).forEach((it) => { if (it.item === itemName && (it.category || null) === (category || null)) v += it.values[mi] || 0; });
    return v;
  }
  function manualEntriesFor(y, mi, type, group, category, itemName) {
    return entriesFor(y.year, mi).filter((e) => e.type === type && sameGroup(e.group, group) && sameCat(type, e.category, category) && e.item === itemName);
  }
  function findOverride(yearLabel, mi, type, group, category, itemName) {
    return OVERRIDES.find((o) => o.year === yearLabel && o.monthIndex === mi && o.type === type && sameGroup(o.group, group) && sameCat(type, o.category, category) && o.item === itemName);
  }
  // The real (already happened) contribution of one item/month. Used only for projections and rosters.
  function historicalRealValue(y, mi, type, group, category, itemName) {
    const manual = manualEntriesFor(y, mi, type, group, category, itemName).reduce((a, e) => a + (e.amount || 0), 0);
    return (isFutureMonth(y, mi) ? 0 : realSheetValue(y, mi, type, group, category, itemName)) + manual;
  }
  // Up to maxSamples most recent real nonzero values of one item, walking back from just before (yi, mi).
  function itemHistorySamples(yi, mi, type, group, category, itemName, maxSamples) {
    const samples = [];
    for (let yy = yi; yy >= 0 && samples.length < maxSamples; yy--) {
      const y = DATA[yy];
      for (let mm = yy === yi ? mi - 1 : 11; mm >= 0 && samples.length < maxSamples; mm--) {
        const v = historicalRealValue(y, mm, type, group, category, itemName);
        if (v > 0) samples.push(v);
      }
    }
    return samples;
  }
  // Projection = average of up to the last 3 real months the item had a value.
  function estimateFor(yi, mi, type, group, category, itemName) {
    const key = [yi, mi, type, group || '', category || '', itemName].join('␟');
    if (ESTIMATE_CACHE.has(key)) return ESTIMATE_CACHE.get(key);
    const samples = itemHistorySamples(yi, mi, type, group, category, itemName, 3);
    const v = samples.length ? { amount: Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100, n: samples.length } : { amount: 0, n: 0 };
    ESTIMATE_CACHE.set(key, v);
    return v;
  }
  // The items active in the most recent real month before (yi, mi): who populates a future month of a new year.
  function rosterFor(yi, mi, type, group) {
    const key = ['r', yi, mi, type, group || ''].join('␟');
    if (ROSTER_CACHE.has(key)) return ROSTER_CACHE.get(key);
    let found = [];
    outer:
    for (let yy = yi; yy >= 0; yy--) {
      const y = DATA[yy];
      for (let mm = yy === yi ? mi - 1 : 11; mm >= 0; mm--) {
        if (isFutureMonth(y, mm)) continue;
        const seen = new Map();
        listOf(y, type, group).forEach((it) => { const k = (it.category || '') + '␟' + it.item; if ((it.values[mm] || 0) > 0 && !seen.has(k)) seen.set(k, { item: it.item, category: it.category || null }); });
        entriesFor(y.year, mm).filter((e) => e.type === type && sameGroup(e.group, group)).forEach((e) => {
          const k = (e.category || '') + '␟' + e.item;
          if (!seen.has(k)) seen.set(k, { item: e.item, category: e.category || null });
        });
        if (seen.size) { found = [...seen.values()]; break outer; }
      }
    }
    ROSTER_CACHE.set(key, found);
    return found;
  }

  // ---- starting budgets ----
  // Budgets: a year's starting budget (no monthIndex) and "Adjust month's budget" edits (monthIndex set). When a month has
  // its own budget, that set replaces the starting budget for the month.
  const isMonthBudget = (b) => b.monthIndex !== undefined && b.monthIndex !== null;
  const hasMonthBudget = (yearLabel, mi) => mi != null && BUDGETS.some((b) => b.year === yearLabel && b.monthIndex === mi);
  const budgetsFor = (yearLabel, mi) => (hasMonthBudget(yearLabel, mi)
    ? BUDGETS.filter((b) => b.year === yearLabel && b.monthIndex === mi)
    : BUDGETS.filter((b) => b.year === yearLabel && !isMonthBudget(b)));
  // A month's budget counts where figures are planned: any month of a year added here, future months of the others.
  const budgetApplies = (y, mi) => y.isExtra || y.isPlaceholder || (hasMonthBudget(y.year, mi) && isFutureMonth(y, mi));
  const findBudget = (yearLabel, type, group, category, itemName, mi) => budgetsFor(yearLabel, mi).find((b) => b.type === type && sameGroup(b.group, group) && (b.category || null) === (category || null) && b.item === itemName);
  const findBudgetDefault = (type, group, category, itemName) => BUDGET_DEFAULTS.find((b) => b.type === type && sameGroup(b.group, group) && (b.category || null) === (category || null) && b.item === itemName);
  const budgetItemsFor = (yearLabel, type, group, mi) => budgetsFor(yearLabel, mi).filter((b) => b.type === type && sameGroup(b.group, group)).map((b) => ({ item: b.item, category: b.category || null }));
  // Every item with a real value in any of the last monthWindow real months (catches seasonal items).
  function widerRosterFor(yi, mi, type, group, monthWindow) {
    const seen = new Map();
    let monthsSeen = 0;
    outer:
    for (let yy = yi; yy >= 0; yy--) {
      const y = DATA[yy];
      for (let mm = yy === yi ? mi - 1 : 11; mm >= 0; mm--) {
        if (isFutureMonth(y, mm)) continue;
        if (monthsSeen >= monthWindow) break outer;
        monthsSeen++;
        listOf(y, type, group).forEach((it) => { const k = (it.category || '') + '␟' + it.item; if ((it.values[mm] || 0) > 0 && !seen.has(k)) seen.set(k, { item: it.item, category: it.category || null }); });
        entriesFor(y.year, mm).filter((e) => e.type === type && sameGroup(e.group, group)).forEach((e) => {
          const k = (e.category || '') + '␟' + e.item;
          if (!seen.has(k)) seen.set(k, { item: e.item, category: e.category || null });
        });
      }
    }
    return [...seen.values()];
  }
  // The sections of the Year budget panel: every item active in the trailing year, with its suggested figure.
  function buildBudgetSuggestions() {
    const now = new Date();
    let anchorYi = DATA.findIndex((y) => parseInt(y.year, 10) === now.getFullYear());
    let anchorMi = now.getMonth();
    if (anchorYi === -1) { anchorYi = DATA.length - 1; anchorMi = 11; }
    const groups = combosOf(DATA[anchorYi] ? DATA[anchorYi].year : currentYearLabel()).map((c) => ({ type: c.type, group: c.group, label: c.type === 'expense' ? c.group : c.group ? c.kindLabel + ' / ' + c.group : c.type === 'investment' ? 'Savings / Investments' : c.kindLabel }));
    return groups.map(({ type, group, label }) => {
      const items = widerRosterFor(anchorYi, anchorMi + 1, type, group, BUDGET_WINDOW).map((r) => {
        const def = findBudgetDefault(type, group, r.category, r.item);
        const samples = itemHistorySamples(anchorYi, anchorMi + 1, type, group, r.category, r.item, BUDGET_WINDOW);
        const computed = samples.length ? Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100 : 0;
        return { type, group, category: r.category, item: r.item, suggested: def ? def.amount : computed, computed, isCustomized: !!def };
      }).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.item.localeCompare(b.item));
      return { type, group, label, items };
    }).filter((s) => s.items.length);
  }

  // "Adjust month's budget" is offered where a month's figures are planned rather than recorded.
  // Every month of the account's own years can be planned. The stand-in year (shown while the account has no saved
  // year) counts too (Oct 4): saving its budget creates the year, so a new account is never locked out of editing.
  function canAdjustMonthBudget(y, mi) { return !!y && (y.isExtra || y.isPlaceholder || isFutureMonth(y, mi)); }
  // Rows of the month-budget panel: every item of the month with the figure it shows now.
  function monthBudgetRows(y, mi) {
    const yi = DATA.indexOf(y);
    const out = [];
    combosOf(y.year, mi).map((c) => [c.type, c.group]).forEach(([type, group]) => {
      listItemsForMonth(yi, mi, type, group).forEach((r) => {
        const e = effectiveItem(yi, mi, type, group, r.category, r.item, r.fromRoster);
        if (e.deleted) return;
        out.push({ type, group, category: r.category || null, item: r.item, amount: Math.round(e.amount * 100) / 100 });
      });
    });
    return out;
  }
  // Item roster for (yi, mi): starting-budget items of a stored year, the rolling roster for an empty future
  // month, and any item the user has logged an entry for.
  function listItemsForMonth(yi, mi, type, group) {
    const y = DATA[yi];
    const list = listOf(y, type, group);
    const seen = new Map();
    list.forEach((it) => seen.set((it.category || '') + '␟' + it.item, { item: it.item, category: it.category || null, fromRoster: false }));
    const budgetItems = budgetApplies(y, mi) ? budgetItemsFor(y.year, type, group, mi) : [];
    budgetItems.forEach((b) => { const k = (b.category || '') + '␟' + b.item; if (!seen.has(k)) seen.set(k, { item: b.item, category: b.category || null, fromRoster: false }); });
    if (!list.length && !budgetItems.length && isFutureMonth(y, mi) && !hasMonthBudget(y.year, mi)) {
      rosterFor(yi, mi, type, group).forEach((r) => { const k = (r.category || '') + '␟' + r.item; if (!seen.has(k)) seen.set(k, { item: r.item, category: r.category || null, fromRoster: true }); });
    }
    entriesFor(y.year, mi).forEach((e) => {
      if (e.type !== type || !sameGroup(e.group, group)) return;
      const cat = hasGroups(type) ? (e.category || null) : null;
      const k = (cat || '') + '␟' + e.item;
      if (!seen.has(k)) seen.set(k, { item: e.item, category: cat, fromRoster: false });
    });
    return [...seen.values()];
  }
  // One item's figure for (yi, mi): a real entry wins (replacing a guess, adding to a confirmed record); an
  // override removes it; otherwise the starting budget, or the projection for a year without one.
  function effectiveItem(yi, mi, type, group, category, itemName, fromRoster) {
    const y = DATA[yi];
    const manual = manualEntriesFor(y, mi, type, group, category, itemName);
    const manualSum = manual.reduce((a, e) => a + (e.amount || 0), 0);
    const ov = findOverride(y.year, mi, type, group, category, itemName);
    const deleted = !!ov;
    const future = isFutureMonth(y, mi);
    const budget = budgetApplies(y, mi) ? findBudget(y.year, type, group, category, itemName, mi) : null;
    const isGuess = future || !!budget;
    const sheetVal = deleted ? 0 : (budget ? budget.amount : realSheetValue(y, mi, type, group, category, itemName));
    if (manual.length) {
      return { amount: isGuess ? manualSum : (sheetVal + manualSum), isEstimate: false, deleted: false, override: null, manual, baseAmount: isGuess ? 0 : sheetVal, estimateSamples: 0, estimateSource: null };
    }
    if (!isGuess) return { amount: sheetVal, isEstimate: false, deleted, override: deleted ? ov : null, manual: [], baseAmount: sheetVal, estimateSamples: 0, estimateSource: null };
    if (deleted) return { amount: 0, isEstimate: true, deleted: true, override: ov, manual: [], baseAmount: 0, estimateSamples: 0, estimateSource: null };
    if (budget) return { amount: budget.amount, isEstimate: true, deleted: false, override: null, manual: [], baseAmount: 0, estimateSamples: 0, estimateSource: 'budget' };
    if (!fromRoster) return { amount: sheetVal, isEstimate: true, deleted: false, override: null, manual: [], baseAmount: 0, estimateSamples: 0, estimateSource: 'sheet' };
    const est = estimateFor(yi, mi, type, group, category, itemName);
    return { amount: est.amount, isEstimate: true, deleted: false, override: null, manual: [], baseAmount: 0, estimateSamples: est.n, estimateSource: 'projected' };
  }

  // ---- the board's categories for a year (Oct 4) ----
  // Sub-categories of a type, in board order. Expenses: the four defaults, then the board's own, then any an entry
  // uses. Income and savings: null (types without a sub-category) first, then their sub-categories.
  // categories: their sub-categories ('' = none -> null).
  const subsCache = new Map();
  // With `mi`, only that month's entries and budgets add names (so a sub-category renamed from a month on doesn't
  // linger as an empty tab in the months after it). Expenses: the board's own sub-categories (the four defaults when the
  // board has none).
  function subsOf(type, yearLabel, mi) {
    const key = type + '␟' + yearLabel + '␟' + (mi == null ? '' : mi);
    if (subsCache.has(key)) return subsCache.get(key);
    const TX = taxonomyForYear(yearLabel);
    const out = [];
    const add = (g) => { const v = g || null; if (!out.includes(v)) out.push(v); };
    const ents = [
      ...ENTRIES.filter((e) => e.year === yearLabel && e.type === type && (mi == null || e.monthIndex === mi)),
      ...(mi == null ? [] : budgetsFor(yearLabel, mi).filter((b) => b.type === type)),
    ];
    if (type === 'expense') { const own = Object.keys(TX.expenses || {}); (own.length ? own : EXP_GROUPS).forEach(add); ents.forEach((e) => { if (e.group) add(e.group); }); }
    else if (type === 'income' || type === 'investment') { add(null); Object.keys((type === 'income' ? TX.incomeSubs : TX.investmentSubs) || {}).forEach(add); ents.forEach((e) => add(e.group)); }
    // A sub-category renamed from a later month of this year still has its old name in this month (Oct 5).
    if (mi != null) {
      (TX.renames || []).filter((r) => r.type === type && r.year === yearLabel && mi < r.mi).reverse().forEach((r) => {
        const i = out.indexOf(r.to); if (i < 0) return;
        if (out.includes(r.from)) out.splice(i, 1); else out[i] = r.from;
      });
    }
    // A sub-category deleted from a later month of this year is still there in this month (Oct 5).
    if (mi != null) (TX.removed || []).filter((r) => r.type === type && r.year === yearLabel && mi < r.mi && !out.includes(r.sub)).forEach((r) => out.push(r.sub));
    subsCache.set(key, out);
    return out;
  }
  /** The three categories, in board order. (`yearLabel`/`mi` kept for callers; the list never changes.) */
  // eslint-disable-next-line no-unused-vars
  const kindsOf = (yearLabel, mi) => ['income', 'investment', 'expense'].map((t) => ({ type: t, label: KIND_LABEL[t], flow: t === 'income' ? 'in' : t === 'investment' ? 'save' : 'out' }));
  /** Every type/sub-category pair of a year (budgets, the month-budget panel). */
  const combosOf = (yearLabel, mi) => kindsOf(yearLabel, mi).flatMap((k) => subsOf(k.type, yearLabel, mi).map((g) => ({ type: k.type, group: g, kindLabel: k.label })));

  const monthCache = new Map();
  function computeMonth(y, mi) {
    const yi = DATA.indexOf(y);
    const key = yi + ':' + mi;
    if (monthCache.has(key)) return monthCache.get(key);
    const groupTotal = (type, group) => listItemsForMonth(yi, mi, type, group).reduce((a, r) => a + effectiveItem(yi, mi, type, group, r.category, r.item, r.fromRoster).amount, 0);
    const sumType = (type) => subsOf(type, y.year, mi).reduce((a, g) => a + groupTotal(type, g), 0);
    const income = sumType('income');
    const invest = sumType('investment');
    const byGroup = {};
    const groups = subsOf('expense', y.year, mi);
    groups.forEach((g) => { byGroup[g] = groupTotal('expense', g); });
    const expenseTotal = groups.reduce((a, g) => a + byGroup[g], 0);
    const out = { mi, income, invest, byGroup, expenseTotal, balance: income - invest - expenseTotal, manual: entriesFor(y.year, mi), isEstimateMonth: isFutureMonth(y, mi) };
    monthCache.set(key, out);
    return out;
  }

  // ---- notes on imported spreadsheet cells ----
  function splitNoteLines(note) {
    if (!note) return [];
    return note.split('\n').map((l) => l.trim()).filter((l) => l && l !== '―').map((l) => l.replace(/^[-*•]\s*/, ''));
  }
  function parseNoteLine(line) {
    const m = line.match(/^(.*?)\s*\((\d{1,2})\/(\d{1,2})\)\s*$/);
    if (!m) return { text: line, date: null };
    const day = parseInt(m[2], 10), month = parseInt(m[3], 10);
    const valid = month >= 1 && month <= 12 && day >= 1 && day <= 31;
    return { text: m[1].trim() || line, date: valid ? `${MONTH_ABBR[month - 1]} ${day}` : null };
  }
  function buildNoteEntries(noteText, cellValue, realAmounts) {
    const lines = splitNoteLines(noteText);
    if (!lines.length) return [];
    const n = lines.length;
    if (realAmounts && realAmounts.length === n) return lines.map((line, i) => { const { text, date } = parseNoteLine(line); return { text, date, amount: realAmounts[i], isEstimate: false }; });
    const totalCents = Math.round((cellValue || 0) * 100);
    const base = Math.floor(totalCents / n);
    const remainder = totalCents - base * n;
    return lines.map((line, i) => { const { text, date } = parseNoteLine(line); return { text, date, amount: (base + (i < remainder ? 1 : 0)) / 100, isEstimate: true }; });
  }
  function itemRowFor(yi, mi, type, group, r, y) {
    const eff = effectiveItem(yi, mi, type, group, r.category, r.item, r.fromRoster);
    const sheetItem = listOf(y, type, group).find((it) => it.item === r.item && (it.category || null) === (r.category || null));
    const note = sheetItem && sheetItem.notes ? sheetItem.notes[mi] : null;
    const realAmounts = sheetItem && sheetItem.realAmounts ? sheetItem.realAmounts[mi] : null;
    let noteEntries = (!eff.deleted && note) ? buildNoteEntries(note, sheetItem.values[mi] || 0, realAmounts) : [];
    // An imported spreadsheet cell arrives as one entry carrying its own note: one base line, then the note's lines.
    const importedCells = eff.manual.filter((e) => e.note);
    importedCells.forEach((e) => { noteEntries = noteEntries.concat(buildNoteEntries(e.note, e.amount, e.realAmounts)); });
    return {
      item: r.item, category: r.category, amount: eff.amount, entries: eff.manual.filter((e) => !e.note), importedCells, noteEntries,
      isEstimate: eff.isEstimate, deleted: eff.deleted, override: eff.override,
      baseAmount: eff.baseAmount, estimateSamples: eff.estimateSamples, estimateSource: eff.estimateSource,
      type, group: group || null, yearLabel: y.year, mi,
      budget: budgetOf(y, mi, type, group, r.category, r.item),
    };
  }
  // The item's budget for the month (the Entries tooltip's "Budget set"), or null when none is set.
  function budgetOf(y, mi, type, group, category, item) {
    const b = budgetApplies(y, mi) ? findBudget(y.year, type, group, category, item, mi) : null;
    return b && b.amount > 0 ? b.amount : null;
  }

  // ---- over-budget alerts (the bell) ----
  // Variable, Additional and Extra expenses whose recorded entries add up to more than the item's budget, in any month
  // of the current year (entries can be dated ahead, e.g. a booking in a budgeted future month). Newest first.
  // `at` = when the entry that took it over was added.
  const ALERT_GROUPS = ['Variable', 'Additional', 'Extra'];
  function budgetAlerts(now = new Date()) {
    const y = DATA.find((d) => d.year === String(now.getFullYear()));
    if (!y) return [];
    const out = [];
    for (let mi = 0; mi < 12; mi++) {
      if (!budgetApplies(y, mi)) continue;
      for (const b of budgetsFor(y.year, mi)) {
        // Variable, Additional, Extra and the board's own Expenses sub-categories (not Fixed).
        const alertable = b.type === 'expense' && b.group && (ALERT_GROUPS.includes(b.group) || !EXP_GROUPS.includes(b.group));
        if (!alertable || !(b.amount > 0)) continue;
        const manual = manualEntriesFor(y, mi, b.type, b.group, b.category || null, b.item)
          .slice().sort((a, c) => String(a.date || a.createdAt || '').localeCompare(String(c.date || c.createdAt || '')));
        let run = 0, crossed = null;
        for (const e of manual) { run += e.amount || 0; if (crossed === null && run > b.amount + 0.004) crossed = e; }
        if (!crossed) continue;
        out.push({
          id: [y.year, mi, b.group, b.category || '', b.item].join('|'), year: y.year, mi, type: b.type, group: b.group, category: b.category || null, item: b.item,
          spent: Math.round(run * 100) / 100, budget: b.amount, at: crossed.createdAt || crossed.date || null, date: crossed.date || null,
        });
      }
    }
    return out.sort((a, c) => String(c.at || '').localeCompare(String(a.at || '')));
  }
  // The Tracker's rows: every item of the year's categories for this type (0,00 when nothing is recorded), plus any
  // item the month has figures for.
  const zeroRow = (type, group, category, item, y, mi) => ({
    item, category: category || null, amount: 0, entries: [], importedCells: [], noteEntries: [], isEstimate: false, deleted: false, override: null,
    baseAmount: 0, estimateSamples: 0, estimateSource: null, type, group: group || null, yearLabel: y.year, mi, empty: true, budget: null,
  });
  // `type`: 'Income' | 'Investments' | an Expenses sub-category (Fixed…). Income and savings with sub-categories come back as blocks (one per sub-category), like Expenses.
  function buildBreakdown(y, mi, type) {
    const yi = DATA.indexOf(y);
    const TX = taxonomyForYear(y.year);
    // Oct 9 (Felipe): a type removed in "Adjust month's budget" leaves that month's Tracker. A month with its own
    // budget shows the types in that budget, plus any type that still has something recorded (an entry, a value).
    const monthPlan = budgetApplies(y, mi) && hasMonthBudget(y.year, mi) ? budgetsFor(y.year, mi) : null;
    const planned = (t, g, c, item) => !monthPlan || monthPlan.some((b) => b.type === t && sameGroup(b.group, g) && (b.category || null) === (c || null) && b.item === item);
    const hasData = (r) => r.deleted || r.entries.length > 0 || r.importedCells.length > 0 || r.noteEntries.length > 0 || Math.abs(r.amount || 0) > 0.004;
    const keep = (r) => planned(r.type, r.group, r.category, r.item) || hasData(r);
    if (type === 'Income' || type === 'Investments') {
      const t = type === 'Income' ? 'income' : 'investment';
      const flatOrder = (t === 'income' ? TX.incomes : TX.investments) || [];
      const subTx = (t === 'income' ? TX.incomeSubs : TX.investmentSubs) || {};
      const flatRows = () => {
        const rows = listItemsForMonth(yi, mi, t, null).map((r) => itemRowFor(yi, mi, t, null, r, y)).filter(keep);
        flatOrder.forEach((item) => { if (planned(t, null, null, item) && !rows.some((r) => r.item === item)) rows.push(zeroRow(t, null, null, item, y, mi)); });
        return inOrder(rows, flatOrder, (r) => r.item);
      };
      const named = subsOf(t, y.year, mi).filter(Boolean);
      if (!named.length) return { flat: true, rows: flatRows() };
      const blocks = named.map((g) => {
        const rows = listItemsForMonth(yi, mi, t, g).map((r) => itemRowFor(yi, mi, t, g, r, y)).filter(keep);
        (subTx[g] || []).forEach((item) => { if (planned(t, g, null, item) && !rows.some((r) => r.item === item)) rows.push(zeroRow(t, g, null, item, y, mi)); });
        const items = inOrder(rows, subTx[g] || [], (r) => r.item);
        return { category: g, group: g, amount: items.reduce((a, r) => a + r.amount, 0), items };
      });
      const rest = flatRows();
      if (rest.length) blocks.unshift({ category: KIND_LABEL[t], group: null, amount: rest.reduce((a, r) => a + r.amount, 0), items: rest });
      return { flat: false, rows: blocks };
    }
    const kind = 'expense';
    const grp = type;
    const catMap = new Map();
    const catOf = (name) => { if (!catMap.has(name)) catMap.set(name, { category: name, amount: 0, items: [] }); return catMap.get(name); };
    listItemsForMonth(yi, mi, kind, grp).forEach((r) => {
      const row = itemRowFor(yi, mi, kind, grp, r, y);
      if (!keep(row)) return;
      const cat = catOf(row.category || 'Other');
      cat.amount += row.amount;
      cat.items.push(row);
    });
    const groupTx = (TX.expenses || {})[type] || {};
    Object.entries(groupTx).forEach(([category, items]) => {
      const missing = items.filter((item) => planned(kind, grp, category || null, item));
      if (monthPlan && !missing.length && !catMap.has(category || 'Other')) return; // every type of this group was removed
      const cat = catOf(category || 'Other');
      missing.forEach((item) => { if (!cat.items.some((i) => i.item === item)) cat.items.push(zeroRow(kind, grp, category || null, item, y, mi)); });
    });
    // Categories and their items always in the order the user set (the year's taxonomy), never by amount; anything
    // not in it (e.g. an old entry's item) comes after, in the order it was found.
    const cats = inOrder([...catMap.values()], Object.keys(groupTx), (c) => c.category);
    cats.forEach((c) => { c.items = inOrder(c.items, groupTx[c.category] || [], (r) => r.item); });
    return { flat: false, rows: cats };
  }
  // Sorts `list` by the position of key(x) in `order`; unknown keys keep their relative order at the end.
  function inOrder(list, order, key) {
    const pos = new Map(order.map((k, i) => [k, i]));
    return list.map((x, i) => [x, i]).sort((a, b) => {
      const pa = pos.has(key(a[0])) ? pos.get(key(a[0])) : order.length + a[1];
      const pb = pos.has(key(b[0])) ? pos.get(key(b[0])) : order.length + b[1];
      return pa - pb;
    }).map(([x]) => x);
  }

  // Annual totals for the year-over-year chart.
  const yearIncome = (y) => sumItemsYear(y.incomes) + entriesForYear(y.year).filter((e) => e.type === 'income').reduce((a, e) => a + e.amount, 0);
  const yearExpense = (y) => EXP_GROUPS.reduce((a, g) => a + sumItemsYear(y.expenses[g]), 0) + entriesForYear(y.year).filter((e) => e.type === 'expense').reduce((a, e) => a + e.amount, 0);

  // ---- per-year taxonomy ----
  // A year's own stored taxonomy wins; otherwise the nearest year that has one (earlier first), else the
  // starter list, plus whatever its own entries already use.
  function entryTaxonomy(label) {
    const t = { incomes: [], investments: [], expenses: {}, incomeSubs: {}, investmentSubs: {} };
    const add = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
    ENTRIES.filter((e) => e.year === label).forEach((e) => {
      if (e.type === 'income' || e.type === 'investment') {
        const subs = e.type === 'income' ? t.incomeSubs : t.investmentSubs;
        if (e.group) add(subs[e.group] || (subs[e.group] = []), e.item); else add(e.type === 'income' ? t.incomes : t.investments, e.item);
      }
      else if (e.type === 'expense' && e.group && e.category) { const g = t.expenses[e.group] || (t.expenses[e.group] = {}); add(g[e.category] || (g[e.category] = []), e.item); }
    });
    return t;
  }
  const taxCache = new Map();
  function taxonomyForYear(label) {
    if (taxCache.has(label)) return taxCache.get(label);
    const y = DATA.find((x) => x.year === label);
    if (y && y.taxonomy) { taxCache.set(label, y.taxonomy); return y.taxonomy; }
    const n = yearNum(label);
    const withTax = DATA.filter((x) => x.taxonomy && !isNaN(yearNum(x.year)));
    const earlier = withTax.filter((x) => yearNum(x.year) < n).sort((a, b) => yearNum(b.year) - yearNum(a.year));
    const later = withTax.filter((x) => yearNum(x.year) > n).sort((a, b) => yearNum(a.year) - yearNum(b.year));
    const base = (earlier[0] || later[0] || {}).taxonomy || CATS;
    const out = copyTaxonomy(base);
    const own = entryTaxonomy(label);
    const add = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
    own.incomes.forEach((i) => add(out.incomes, i)); own.investments.forEach((i) => add(out.investments, i));
    Object.keys(own.expenses).forEach((g) => Object.keys(own.expenses[g]).forEach((c) => {
      const gc = out.expenses[g] || (out.expenses[g] = {}); own.expenses[g][c].forEach((i) => add(gc[c] || (gc[c] = []), i));
    }));
    ['incomeSubs', 'investmentSubs'].forEach((k) => Object.keys(own[k]).forEach((g) => {
      const subs = out[k] || (out[k] = {}); own[k][g].forEach((i) => add(subs[g] || (subs[g] = []), i));
    }));
    taxCache.set(label, out);
    return out;
  }
  // Category options: "Group/Item" for expenses (the item alone when it has no group), the item
  // alone for income and savings.
  function catOptions(type, group, yearLabel) {
    const TX = taxonomyForYear(yearLabel);
    if (hasGroups(type)) {
      const gc = TX.expenses[group] || {};
      const out = [];
      Object.keys(gc).sort().forEach((c) => gc[c].slice().sort().forEach((i) => out.push({ label: c ? c + '/' + i : i, category: c || null, item: i })));
      return out;
    }
    const list = group ? (((type === 'income' ? TX.incomeSubs : TX.investmentSubs) || {})[group] || []) : ((type === 'income' ? TX.incomes : TX.investments) || []);
    return list.slice().sort().map((i) => ({ label: i, category: null, item: i }));
  }
  // The Type picker's options for a year: the fixed list (Income, Savings/Investment, Expenses/<four>) plus the
  // board's own sub-categories, each "Category/Sub-category".
  function typeOpts(yearLabel) {
    const out = TYPE_OPTS.slice();
    kindsOf(yearLabel).forEach((k) => subsOf(k.type, yearLabel).forEach((g) => {
      const key = typeKeyOf(k.type, g);
      if (out.some((t) => t.key === key)) return;
      const base = k.type === 'investment' ? 'Savings/Investment' : k.label;
      out.push({ key, type: k.type, group: g, label: g ? base + '/' + g : base });
    }));
    return out;
  }
  const typeOptsForYear = (yearLabel, keepKey) => typeOpts(yearLabel).filter((t) => t.key === keepKey || catOptions(t.type, t.group, yearLabel).length);

  // ---- "Add to": month and year periods ----
  const resolveDate = (val) => {
    const m = val && String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const monthIndex = parseInt(m[2], 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;
    const yi = DATA.findIndex((y) => y.year === m[1]);
    return yi === -1 ? null : { yearIdx: yi, monthIndex, yearLabel: m[1] };
  };
  const isOpenNextMonthDate = (val) => { const label = openNextYearLabel(); return !!label && new RegExp('^' + label + '-01-\\d{2}$').test(String(val || '')) && !DATA.some((y) => y.year === label); };
  function periodYears() {
    const ys = DATA.map((y) => y.year).filter((l) => /^\d{4}$/.test(l));
    const open = openNextYearLabel(); if (open && !ys.includes(open)) ys.push(open);
    return ys.sort((a, b) => Number(b) - Number(a));
  }
  const periodKeysOfYear = (y) => (DATA.some((d) => d.year === y) ? MONTH_NAMES.map((_, i) => `${y}-${String(i + 1).padStart(2, '0')}`) : [`${y}-01`]);
  const periodKeys = () => periodYears().flatMap(periodKeysOfYear);
  const periodExists = (key) => periodKeys().includes(key);
  /** Dropdown options for a period picker, grouped by year, newest first. */
  const periodOptions = () => periodYears().map((y) => ({ group: y, options: periodKeysOfYear(y).map((k) => ({ value: k, label: MONTH_NAMES[parseInt(k.slice(5), 10) - 1], selectedLabel: periodLabel(k) })) }));
  function defaultPeriodKey(yearIdx, monthIdx) {
    const t = todayISO().slice(0, 7);
    if (periodExists(t)) return t;
    const y = DATA[yearIdx];
    if (y && /^\d{4}$/.test(y.year)) { const k = `${y.year}-${String(monthIdx + 1).padStart(2, '0')}`; if (periodExists(k)) return k; }
    return periodKeys()[0] || t;
  }
  function entryDateBounds() {
    const numericYears = DATA.map((y) => parseInt(y.year, 10)).filter((n) => !isNaN(n));
    if (!numericYears.length) return {};
    const next = openNextYearLabel();
    return { min: `${Math.min(...numericYears)}-01-01`, max: next && parseInt(next, 10) > Math.max(...numericYears) ? `${next}-01-31` : `${Math.max(...numericYears)}-12-31` };
  }
  // The year whose categories the document reader is shown: this calendar year if it exists, else the newest.
  function promptYearLabel() {
    const now = currentYearLabel();
    if (DATA.some((y) => y.year === now)) return now;
    const nums = DATA.map((y) => yearNum(y.year)).filter((n) => !isNaN(n));
    return nums.length ? String(Math.max(...nums)) : now;
  }

  return {
    DATA, ENTRIES, OVERRIDES, BUDGETS, BUDGET_DEFAULTS, canAdjustMonthBudget, monthBudgetRows,
    entriesFor, entriesForYear, currentYearMonthIndex, monthHasData, isFutureMonth, defaultMonth,
    computeMonth, buildBreakdown, buildBudgetSuggestions, yearIncome, yearExpense, budgetAlerts,
    taxonomyForYear, catOptions, typeOptsForYear, typeOpts, kindsOf, subsOf, combosOf,
    resolveDate, isOpenNextMonthDate, periodYears, periodExists, periodOptions, defaultPeriodKey, entryDateBounds, promptYearLabel,
  };
}
