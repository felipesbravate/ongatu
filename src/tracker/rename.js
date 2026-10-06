// Renaming a sub-category from one month on (Oct 5, Felipe): the change starts in the month being edited
// and spreads to every month after it (later years included); earlier months keep the old name.
//
// Sub-category (the entries' `group`): renamed in the taxonomy of that year and every later year, and in every entry,
// override and month budget from that month on. The year's starting budget is shared by all its months, so before it is
// renamed, the earlier months that rely on it get their own copy (old names) — history doesn't move. Starting budgets of
// later years and the remembered budget suggestions (budgetDefaults) are renamed too.
// The three categories themselves are never renamed (Felipe, Oct 5).
//
// planRename() only computes the writes; the caller applies them. Pure, so it is unit-tested.
import { budgetDefaultDocId, copyTaxonomy, yearNum } from './model.js';

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
  return tx;
}

/**
 * @param {{ type: string, from: string, to: string, year: string, mi: number,
 *           data: { years: any[], entries: any[], overrides: any[], budgets: any[], budgetDefaults: any[] },
 *           taxonomyForYear: (label: string) => any }} o
 * @returns {{ sets: {col: string, id: string, doc: any}[], adds: {col: string, doc: any}[], deletes: {col: string, id: string}[] }}
 */
export function planRename({ type, from, to, year, mi, data, taxonomyForYear }) {
  const sets = [], adds = [], deletes = [];
  const Y = yearNum(year);
  const later = (label) => yearNum(label) > Y;
  // Taxonomy of the year and every later year.
  (data.years || []).filter((y) => yearNum(y.year) >= Y).forEach((y) => {
    const tx = copyTaxonomy(y.taxonomy || taxonomyForYear(y.year));
    renameSubInTaxonomy(tx, type, from, to);
    // Months before `mi` in this year keep showing the old name (subsOf reads this).
    if (y.year === year && mi > 0) tx.renames = [...(tx.renames || []), { type, from, to, year, mi }];
    sets.push({ col: 'years', id: y.id, doc: { ...strip(y), taxonomy: tx } });
  });
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

/** Removes a sub-category from a taxonomy, in place (its types go with it). */
export function deleteSubInTaxonomy(tx, type, sub) {
  const drop = (obj) => { if (obj && Object.prototype.hasOwnProperty.call(obj, sub)) { const o = { ...obj }; delete o[sub]; return o; } return obj; };
  if (type === 'expense') tx.expenses = drop(tx.expenses || {});
  else if (type === 'income' || type === 'investment') { const k = type === 'income' ? 'incomeSubs' : 'investmentSubs'; if (tx[k]) tx[k] = drop(tx[k]); }
  return tx;
}

/**
 * Deleting a sub-category from one month on (Oct 5, Felipe: sub-categories are freely created and deleted). Like a
 * rename, it starts in the month being edited and spreads to every month after it; earlier months keep it, with their
 * budgets. Entries are never deleted here: the caller refuses while the sub-category has entries from that month on
 * (`entriesFrom`), so nothing logged disappears.
 * @returns {{ sets: any[], adds: any[], deletes: any[], entriesFrom: number }}
 */
export function planDeleteSub({ type, sub, year, mi, data, taxonomyForYear }) {
  const sets = [], adds = [], deletes = [];
  const Y = yearNum(year);
  const later = (label) => yearNum(label) > Y;
  const fromThisMonth = (d) => later(d.year) || (d.year === year && d.monthIndex != null && d.monthIndex >= mi);
  const hit = (d) => d.type === type && (d.group || null) === sub;
  const entriesFrom = (data.entries || []).filter((e) => hit(e) && fromThisMonth(e)).length;
  (data.years || []).filter((y) => yearNum(y.year) >= Y).forEach((y) => {
    const tx = deleteSubInTaxonomy(copyTaxonomy(y.taxonomy || taxonomyForYear(y.year)), type, sub);
    if (y.year === year && mi > 0) tx.removed = [...(tx.removed || []), { type, sub, year, mi }];
    sets.push({ col: 'years', id: y.id, doc: { ...strip(y), taxonomy: tx } });
  });
  (data.overrides || []).forEach((d) => { if (hit(d) && fromThisMonth(d)) deletes.push({ col: 'overrides', id: d.id }); });
  const budgets = data.budgets || [];
  const isMonthB = (b) => b.monthIndex !== undefined && b.monthIndex !== null;
  budgets.filter((b) => isMonthB(b) && hit(b) && fromThisMonth(b)).forEach((b) => deletes.push({ col: 'budgets', id: b.id }));
  const starting = budgets.filter((b) => b.year === year && !isMonthB(b));
  if (starting.some(hit)) {
    for (let m = 0; m < mi; m++) {
      if (budgets.some((b) => b.year === year && b.monthIndex === m)) continue;
      starting.forEach((b) => adds.push({ col: 'budgets', doc: { ...strip(b), monthIndex: m } }));
    }
    starting.filter(hit).forEach((b) => deletes.push({ col: 'budgets', id: b.id }));
  }
  budgets.filter((b) => !isMonthB(b) && later(b.year) && hit(b)).forEach((b) => deletes.push({ col: 'budgets', id: b.id }));
  (data.budgetDefaults || []).filter(hit).forEach((d) => deletes.push({ col: 'budgetDefaults', id: d.id }));
  return { sets, adds, deletes, entriesFrom };
}
