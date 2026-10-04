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
export const typeKeyOf = (type, group) => (type === 'expense' ? 'expense:' + group : type);

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

/**
 * @param {{ data: any[], entries: any[], overrides: any[], budgets: any[], budgetDefaults: any[] }} s
 */
export function createModel({ data: DATA, entries: ENTRIES, overrides: OVERRIDES, budgets: BUDGETS, budgetDefaults: BUDGET_DEFAULTS }) {
  const ESTIMATE_CACHE = new Map();
  const ROSTER_CACHE = new Map();
  const listOf = (y, type, group) => (type === 'income' ? y.incomes : type === 'investment' ? y.investments : (y.expenses[group] || []));

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
    return entriesFor(y.year, mi).filter((e) => e.type === type && (type !== 'expense' || e.group === group) && (type !== 'expense' || (e.category || null) === (category || null)) && e.item === itemName);
  }
  function findOverride(yearLabel, mi, type, group, category, itemName) {
    return OVERRIDES.find((o) => o.year === yearLabel && o.monthIndex === mi && o.type === type && (type !== 'expense' || o.group === group) && (type !== 'expense' || (o.category || null) === (category || null)) && o.item === itemName);
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
        entriesFor(y.year, mm).filter((e) => e.type === type && (type !== 'expense' || e.group === group)).forEach((e) => {
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
  const findBudget = (yearLabel, type, group, category, itemName, mi) => budgetsFor(yearLabel, mi).find((b) => b.type === type && (type !== 'expense' || b.group === group) && (b.category || null) === (category || null) && b.item === itemName);
  const findBudgetDefault = (type, group, category, itemName) => BUDGET_DEFAULTS.find((b) => b.type === type && (type !== 'expense' || b.group === group) && (b.category || null) === (category || null) && b.item === itemName);
  const budgetItemsFor = (yearLabel, type, group, mi) => budgetsFor(yearLabel, mi).filter((b) => b.type === type && (type !== 'expense' || b.group === group)).map((b) => ({ item: b.item, category: b.category || null }));
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
        entriesFor(y.year, mm).filter((e) => e.type === type && (type !== 'expense' || e.group === group)).forEach((e) => {
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
    const groups = [{ type: 'income', group: null, label: 'Income' }, { type: 'investment', group: null, label: 'Savings / Investments' }, ...EXP_GROUPS.map((g) => ({ type: 'expense', group: g, label: g }))];
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
    [['income', null], ['investment', null], ...EXP_GROUPS.map((g) => ['expense', g])].forEach(([type, group]) => {
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
      if (e.type !== type || (type === 'expense' && e.group !== group)) return;
      const cat = type === 'expense' ? (e.category || null) : null;
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

  const monthCache = new Map();
  function computeMonth(y, mi) {
    const yi = DATA.indexOf(y);
    const key = yi + ':' + mi;
    if (monthCache.has(key)) return monthCache.get(key);
    const groupTotal = (type, group) => listItemsForMonth(yi, mi, type, group).reduce((a, r) => a + effectiveItem(yi, mi, type, group, r.category, r.item, r.fromRoster).amount, 0);
    const income = groupTotal('income', null);
    const invest = groupTotal('investment', null);
    const byGroup = {};
    EXP_GROUPS.forEach((g) => { byGroup[g] = groupTotal('expense', g); });
    const expenseTotal = EXP_GROUPS.reduce((a, g) => a + byGroup[g], 0);
    const out = { income, invest, byGroup, expenseTotal, balance: income - invest - expenseTotal, manual: entriesFor(y.year, mi), isEstimateMonth: isFutureMonth(y, mi) };
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
        if (b.type !== 'expense' || !ALERT_GROUPS.includes(b.group) || !(b.amount > 0)) continue;
        const manual = manualEntriesFor(y, mi, 'expense', b.group, b.category || null, b.item)
          .slice().sort((a, c) => String(a.date || a.createdAt || '').localeCompare(String(c.date || c.createdAt || '')));
        let run = 0, crossed = null;
        for (const e of manual) { run += e.amount || 0; if (crossed === null && run > b.amount + 0.004) crossed = e; }
        if (!crossed) continue;
        out.push({
          id: [y.year, mi, b.group, b.category || '', b.item].join('|'), year: y.year, mi, group: b.group, category: b.category || null, item: b.item,
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
  function buildBreakdown(y, mi, type) {
    const yi = DATA.indexOf(y);
    const TX = taxonomyForYear(y.year);
    if (type === 'Income' || type === 'Investments') {
      const t = type === 'Income' ? 'income' : 'investment';
      const rows = listItemsForMonth(yi, mi, t, null).map((r) => itemRowFor(yi, mi, t, null, r, y));
      const order = (t === 'income' ? TX.incomes : TX.investments) || [];
      order.forEach((item) => { if (!rows.some((r) => r.item === item)) rows.push(zeroRow(t, null, null, item, y, mi)); });
      return { flat: true, rows: inOrder(rows, order, (r) => r.item) };
    }
    const catMap = new Map();
    const catOf = (name) => { if (!catMap.has(name)) catMap.set(name, { category: name, amount: 0, items: [] }); return catMap.get(name); };
    listItemsForMonth(yi, mi, 'expense', type).forEach((r) => {
      const row = itemRowFor(yi, mi, 'expense', type, r, y);
      const cat = catOf(row.category || 'Other');
      cat.amount += row.amount;
      cat.items.push(row);
    });
    const groupTx = (TX.expenses || {})[type] || {};
    Object.entries(groupTx).forEach(([category, items]) => {
      const cat = catOf(category);
      items.forEach((item) => { if (!cat.items.some((i) => i.item === item)) cat.items.push(zeroRow('expense', type, category, item, y, mi)); });
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
    const t = { incomes: [], investments: [], expenses: {} };
    const add = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
    ENTRIES.filter((e) => e.year === label).forEach((e) => {
      if (e.type === 'income') add(t.incomes, e.item);
      else if (e.type === 'investment') add(t.investments, e.item);
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
    const out = { incomes: (base.incomes || []).slice(), investments: (base.investments || []).slice(), expenses: {} };
    Object.keys(base.expenses || {}).forEach((g) => { out.expenses[g] = {}; Object.keys(base.expenses[g]).forEach((c) => { out.expenses[g][c] = base.expenses[g][c].slice(); }); });
    const own = entryTaxonomy(label);
    const add = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
    own.incomes.forEach((i) => add(out.incomes, i)); own.investments.forEach((i) => add(out.investments, i));
    Object.keys(own.expenses).forEach((g) => Object.keys(own.expenses[g]).forEach((c) => {
      const gc = out.expenses[g] || (out.expenses[g] = {}); own.expenses[g][c].forEach((i) => add(gc[c] || (gc[c] = []), i));
    }));
    taxCache.set(label, out);
    return out;
  }
  // Category options: "Category/Item" for expenses, the item alone for income and savings.
  function catOptions(type, group, yearLabel) {
    const TX = taxonomyForYear(yearLabel);
    if (type === 'expense') {
      const gc = TX.expenses[group] || {}; const out = [];
      Object.keys(gc).sort().forEach((c) => gc[c].slice().sort().forEach((i) => out.push({ label: c + '/' + i, category: c, item: i })));
      return out;
    }
    return ((type === 'income' ? TX.incomes : TX.investments) || []).slice().sort().map((i) => ({ label: i, category: null, item: i }));
  }
  const typeOptsForYear = (yearLabel, keepKey) => TYPE_OPTS.filter((t) => t.key === keepKey || catOptions(t.type, t.group, yearLabel).length);

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
    taxonomyForYear, catOptions, typeOptsForYear,
    resolveDate, isOpenNextMonthDate, periodYears, periodExists, periodOptions, defaultPeriodKey, entryDateBounds, promptYearLabel,
  };
}
