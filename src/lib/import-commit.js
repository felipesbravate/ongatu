// @ts-check
// Server side of the initial-data import: validates reviewed rows and saves them in bulk.
// The browser parses and categorizes (public/legacy/importer.js); the server trusts none of it.

export const MAX_IMPORT_BATCH = 500;
const TYPES = ['expense', 'income', 'investment'];
// Expenses sub-categories are the user's own since Oct 5 (onboarding import, Oct 9): any short name is accepted;
// Income and Savings may carry an optional sub-category too.
const str = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/**
 * Checks one reviewed row and returns the exact `entries` document to store (unknown fields dropped).
 * @param {any} e
 * @returns {{ ok: true, doc: any } | { ok: false, problems: string[] }}
 */
export function validateImportEntry(e) {
  const problems = [];
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, problems: ['not_an_object'] };
  const m = typeof e.date === 'string' && e.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || +m[1] < 1900 || +m[1] > 2100) problems.push('date');
  if (!TYPES.includes(e.type)) problems.push('type');
  if (e.type === 'expense' && (!str(e.group, 60) || !str(e.category))) problems.push('category');
  if (e.type !== 'expense' && e.group != null && !str(e.group, 60)) problems.push('group');
  if (!str(e.item)) problems.push('item');
  if (!str(e.description)) problems.push('description');
  const amount = typeof e.amount === 'number' ? Math.round(e.amount * 100) / 100 : NaN;
  if (!(amount > 0 && amount < 1e9)) problems.push('amount');
  if (problems.length) return { ok: false, problems };
  const expense = e.type === 'expense';
  return {
    ok: true,
    doc: {
      year: e.date.slice(0, 4), monthIndex: Number(e.date.slice(5, 7)) - 1,
      type: e.type, group: expense || e.group ? e.group.trim() : null, category: expense ? e.category.trim() : null,
      item: e.item.trim(), description: e.description.trim(), amount, date: e.date,
      createdAt: new Date().toISOString(), source: 'import',
    },
  };
}

/**
 * Validates a whole batch; nothing is saved unless every row is valid.
 * @param {any} body
 */
export function validateImportBatch(body) {
  const list = body && body.entries;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'No rows to import' };
  if (list.length > MAX_IMPORT_BATCH) return { ok: false, error: `At most ${MAX_IMPORT_BATCH} rows per request` };
  const docs = [], bad = [];
  list.forEach((e, index) => { const r = validateImportEntry(e); if (r.ok) docs.push(r.doc); else bad.push({ index, problems: r.problems }); });
  return bad.length ? { ok: false, error: 'Some rows are not valid', rows: bad } : { ok: true, docs };
}
