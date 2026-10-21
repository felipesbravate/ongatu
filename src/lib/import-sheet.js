// @ts-check
// Converts the spreadsheet-export shape ({years:[{year,currency,incomes,investments,expenses}]})
// into this app's documents: one `years` doc per year and one `entries` doc per non-zero month cell.
// Pure function: no I/O, so it is unit-tested with fake data. Real data is only ever fed to it at import time.

/**
 * The categories a year of the sheet really has: every row of that year, including rows that are 0 all year
 * (they are what you may still book into later in the year). Order of the sheet is kept, duplicates dropped.
 * @param {any} y  one year of the export
 * @returns {{ incomes: string[], investments: string[], expenses: Record<string, Record<string, string[]>> }}
 */
export function taxonomyOfYear(y) {
  const uniq = (/** @type {string[]} */ a) => [...new Set(a)];
  /** @type {Record<string, Record<string, string[]>>} */ const expenses = {};
  for (const [g, list] of Object.entries(y.expenses || {})) {
    /** @type {Record<string, string[]>} */ const cats = {};
    for (const it of /** @type {any[]} */ (list)) {
      if (!it || !it.item || !it.category) continue;
      (cats[it.category] ||= []).push(it.item);
    }
    for (const c of Object.keys(cats)) cats[c] = uniq(cats[c]);
    if (Object.keys(cats).length) expenses[g] = cats;
  }
  return {
    incomes: uniq((y.incomes || []).map((/** @type {any} */ i) => i.item).filter(Boolean)),
    investments: uniq((y.investments || []).map((/** @type {any} */ i) => i.item).filter(Boolean)),
    expenses,
  };
}

/**
 * @param {{ years: any[] }} data
 * @param {{ now?: string }} [opts]
 * @returns {{ years: any[], entries: any[], report: { years: number, entries: number, negatives: number, notes: number, notesWithoutEntry: number } }}
 */
export function convertSheet(data, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const years = [], entries = [];
  let negatives = 0, notes = 0, notesWithoutEntry = 0;
  for (const y of data.years || []) {
    const label = String(y.year);
    years.push({ year: label, currency: ['SEK', 'GBP', 'BRL'].includes(y.currency) ? y.currency : 'EUR', createdAt: now, taxonomy: taxonomyOfYear(y) });
    /** @type {{type:string, group:string|null, list:any[]}[]} */
    const groups = [
      { type: 'income', group: null, list: y.incomes || [] },
      { type: 'investment', group: null, list: y.investments || [] },
      ...Object.entries(y.expenses || {}).map(([g, list]) => ({ type: 'expense', group: g, list: /** @type {any[]} */ (list) })),
    ];
    for (const { type, group, list } of groups) {
      for (const it of list) {
        (it.values || []).forEach((/** @type {any} */ v, /** @type {number} */ m) => {
          // Per-month note: a text with one line per sub-item, plus optional real amounts for those lines.
          const noteText = Array.isArray(it.notes) && typeof it.notes[m] === 'string' && it.notes[m].trim() ? it.notes[m] : null;
          const real = noteText && Array.isArray(it.realAmounts) && Array.isArray(it.realAmounts[m]) && it.realAmounts[m].every((/** @type {any} */ x) => typeof x === 'number' && isFinite(x)) ? it.realAmounts[m] : null;
          if (typeof v !== 'number' || !isFinite(v) || v === 0) { if (noteText) notesWithoutEntry++; return; }
          if (v < 0) negatives++;
          if (noteText) notes++;
          entries.push({
            year: label, monthIndex: m, type, group,
            category: type === 'expense' ? (it.category || null) : null,
            item: it.item, description: 'Imported', amount: Math.round(v * 100) / 100,
            date: `${label}-${String(m + 1).padStart(2, '0')}-01`, createdAt: now,
            ...(noteText ? { note: noteText, ...(real ? { realAmounts: real } : {}) } : {}),
          });
        });
      }
    }
  }
  return { years, entries, report: { years: years.length, entries: entries.length, negatives, notes, notesWithoutEntry } };
}

/** Evaluates a `window.MONTHLY_COSTS_DATA = {...}` file without executing anything but that assignment. */
export function parseSheetFile(/** @type {string} */ src) {
  const w = /** @type {any} */ ({});
  new Function('window', src)(w);
  if (!w.MONTHLY_COSTS_DATA || !Array.isArray(w.MONTHLY_COSTS_DATA.years)) throw new Error('file does not define window.MONTHLY_COSTS_DATA.years');
  return w.MONTHLY_COSTS_DATA;
}
