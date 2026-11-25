import { periodMismatch, periodKeyOfDate, periodLabel } from './shared';

// Review table rules (trial, Nov 25): ported as-is from the web's AddPanel.jsx (rowIssues, fitRows, status text).
// In a unified codebase these move to one shared module; today they exist twice (here and src/tracker/AddPanel.jsx).
export type Row = { id: number; date: string; description: string; type: string; group: string | null; category: string | null; item: string | null; amount: number;
  guess?: boolean; flag?: string; fileName?: string; renamedFrom?: string | null; readDescription?: string };
export type ReviewState = { rows: Row[]; period: string; status: { err: boolean; text: string } | null };

export const rowCatLabel = (r: Row) => (!r.item ? '' : r.type === 'expense' ? (r.category ? `${r.category}/${r.item}` : '') : r.item);
export function rowIssues(r: Row, period: string) {
  const iss: string[] = [];
  if (!r.description.trim()) iss.push('desc');
  if (!r.item || (r.type === 'expense' && !r.category)) iss.push('cat');
  if (!(r.amount > 0)) iss.push('amount');
  if (r.flag) iss.push('flag');
  if (periodMismatch(r.date, period)) iss.push('date');
  return iss;
}
/** A row's category has to exist in the year it's added to; if not, the person picks it again. */
export function fitRows(rv: ReviewState, model: any): ReviewState {
  const yl = (rv.period || '').slice(0, 4);
  return { ...rv, rows: rv.rows.map((r) => { const label = rowCatLabel(r); return label && !model.catOptions(r.type, r.group, yl).some((o: any) => o.label === label) ? { ...r, category: null, item: null } : r; }) };
}
export const shortDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return isNaN(+d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

export function reviewStatus(rows: Row[], period: string, status: ReviewState['status']) {
  const issues = rows.map((r) => rowIssues(r, period));
  const bad = issues.filter((i) => i.length).length;
  const dateBad = issues.filter((i) => i.includes('date')).length;
  const otherBad = issues.filter((i) => i.some((k) => k !== 'date')).length;
  const guesses = rows.filter((r) => r.guess && rowCatLabel(r)).length;
  const away = rows.filter((r) => !periodMismatch(r.date, period) && periodKeyOfDate(r.date) !== period).length;
  let st: { err: boolean; text: string; guess?: boolean } | null = status;
  if (bad) {
    const parts: string[] = [];
    if (otherBad) parts.push(`${otherBad} ${otherBad === 1 ? 'entry needs' : 'entries need'} attention before you can submit.`);
    if (dateBad) parts.push(`The date of ${dateBad} ${dateBad === 1 ? 'entry doesn’t' : 'entries don’t'} match the month and year selected.`);
    st = { err: true, text: parts.join(' ') };
  } else if (!st) {
    const parts: string[] = [];
    if (guesses) parts.push(`${guesses} ${guesses === 1 ? 'category is a guess' : 'categories are guesses'}. Check ${guesses === 1 ? 'it' : 'them'} before you submit.`);
    if (away) parts.push(`${away} ${away === 1 ? 'entry is' : 'entries are'} dated in another month and will count toward ${periodLabel(period)}.`);
    st = { err: false, text: parts.join(' '), guess: guesses > 0 };
  }
  return { issues, bad, st };
}
