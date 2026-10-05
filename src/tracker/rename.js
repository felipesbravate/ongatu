// Renaming a category or a sub-category from one month on (Oct 5, Felipe): the change starts in the month being edited
// and spreads to every month after it (later years included); earlier months keep the old name.
//
// Sub-category (the entries' `group`): renamed in the taxonomy of that year and every later year, and in every entry,
// override and month budget from that month on. The year's starting budget is shared by all its months, so before it is
// renamed, the earlier months that rely on it get their own copy (old names) — history doesn't move. Starting budgets of
// later years and the remembered budget suggestions (budgetDefaults) are renamed too.
// Category: built-in categories store their new name in the taxonomy's `labels`, custom ones in `custom[].name`; names
// are per year, so the year being edited and every later year show it. Entries keep their type, nothing else moves.
//
// planRename() only computes the writes; the caller applies them. Pure, so it is unit-tested.
import { budgetDefaultDocId, copyTaxonomy, isCustomType, yearNum } from './model.js';

const strip = (d) => { const { id, ...rest } = d; return rest; };

function renameKey(obj, from, to) {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, from)) return obj;
  const out = {};
  Object.keys(obj).forEach((k) => { out[k === from ? to : k] = obj[k]; });
  return out;
}

export function renameSubInTaxonomy(tx, type, from, to) {
  if (type === 'expense') tx.expenses = renameKey(tx.expenses || {}, from, to);
  else if (type === 'income' || type === 'investment') { const k = type === 'income' ? 'incomeSubs' : 'investmentSubs'; if (tx[k]) tx[k] = renameKey(tx[k], from, to); }
  else if (isCustomType(type)) { const c = (tx.custom || []).find((x) => x.type === type); if (c) c.subs = renameKey(c.subs || {}, from, to); }
  return tx;
}
export function renameCategoryInTaxonomy(tx, type, to) {
  if (isCustomType(type)) { const c = (tx.custom || []).find((x) => x.type === type); if (c) c.name = to; else tx.custom = [...(tx.custom || []), { type, name: to, subs: {} }]; }
  else tx.labels = { ...(tx.labels || {}), [type]: to };
  return tx;
}

/**
 * @param {{ level: 'category'|'sub', type: string, from?: string, to: string, year: string, mi: number,
 *           data: { years: any[], entries: any[], overrides: any[], budgets: any[], budgetDefaults: any[] },
 *           taxonomyForYear: (label: string) => any }} o
 * @returns {{ sets: {col: string, id: string, doc: any}[], adds: {col: string, doc: any}[], deletes: {col: string, id: string}[] }}
 */
export function planRename({ level, type, from, to, year, mi, data, taxonomyForYear }) {
  const sets = [], adds = [], deletes = [];
  const Y = yearNum(year);
  const later = (label) => yearNum(label) > Y;
  // Taxonomy of the year and every later year.
  (data.years || []).filter((y) => yearNum(y.year) >= Y).forEach((y) => {
    const tx = copyTaxonomy(y.taxonomy || taxonomyForYear(y.year));
    if (level === 'category') renameCategoryInTaxonomy(tx, type, to);
    else {
      renameSubInTaxonomy(tx, type, from, to);
      // Months before `mi` in this year keep showing the old name (subsOf reads this).
      if (y.year === year && mi > 0) tx.renames = [...(tx.renames || []), { type, from, to, year, mi }];
    }
    sets.push({ col: 'years', id: y.id, doc: { ...strip(y), taxonomy: tx } });
  });
  if (level === 'category') return { sets, adds, deletes };

  const fromThisMonth = (d) => later(d.year) || (d.year === year && d.monthIndex != null && d.monthIndex >= mi);
  const hit = (d) => d.type === type && (d.group || null) === from;
  ['entries', 'overrides'].forEach((col) => (data[col] || []).forEach((d) => {
    if (hit(d) && fromThisMonth(d)) sets.push({ col, id: d.id, doc: { ...strip(d), group: to } });
  }));
  const budgets = data.budgets || [];
  const isMonthB = (b) => b.monthIndex !== undefined && b.monthIndex !== null;
  budgets.filter((b) => isMonthB(b) && hit(b) && fromThisMonth(b)).forEach((b) => sets.push({ col: 'budgets', id: b.id, doc: { ...strip(b), group: to } }));
  // Starting budget of the year: earlier months without their own budget keep a copy with the old names first.
  const starting = budgets.filter((b) => b.year === year && !isMonthB(b));
  if (starting.some(hit)) {
    for (let m = 0; m < mi; m++) {
      if (budgets.some((b) => b.year === year && b.monthIndex === m)) continue;
      starting.forEach((b) => adds.push({ col: 'budgets', doc: { ...strip(b), monthIndex: m } }));
    }
    starting.filter(hit).forEach((b) => sets.push({ col: 'budgets', id: b.id, doc: { ...strip(b), group: to } }));
  }
  budgets.filter((b) => !isMonthB(b) && later(b.year) && hit(b)).forEach((b) => sets.push({ col: 'budgets', id: b.id, doc: { ...strip(b), group: to } }));
  (data.budgetDefaults || []).filter(hit).forEach((d) => {
    deletes.push({ col: 'budgetDefaults', id: d.id });
    sets.push({ col: 'budgetDefaults', id: budgetDefaultDocId(d.type, to, d.category || null, d.item), doc: { ...strip(d), group: to } });
  });
  return { sets, adds, deletes };
}
