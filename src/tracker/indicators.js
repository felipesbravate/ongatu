// The "details" line of the Balance, Incomes, Expenses and Savings cards and of the phone's Expense cards (Oct 9).
// What each figure is compared with depends on the month shown:
//   finished month -> the previous month (Incomes: the average of the 3 months before, as income comes in lumps);
//   current month  -> the month's budget when one is set, otherwise a share of the 3 months' average
//                     ("55% of €2.837 avg": a month in progress is never "down" against whole months; the kept and
//                     saved rates only compare with a plan, as incomes land early and spending builds up);
//   future month   -> nothing to compare: "Projected from budget".
// Each result is { head?, tone: 'good' | 'bad' | 'neutral', dir: 'up' | 'down' | 'flat' | null, text }: `head` is the
// plain part before the comparison ("Kept 62% of incomes"), `text` the coloured comparison after the arrow.
import { MONTH_ABBR } from './model.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const money = (v, cur) => {
  const n = Math.round(Math.abs(v));
  const s = n.toLocaleString('de-DE');
  return cur === 'EUR' ? `€${s}` : `${s} ${cur === 'SEK' ? 'kr' : cur}`;
};

// The months to compare with: { prev: { c, label } | null, avg: c-like | null, state, budget }.
export function comparisonBase(model, y, mi, now = new Date()) {
  const DATA = model.DATA;
  const yNum = parseInt(y.year, 10);
  const isCurrent = yNum === now.getFullYear() && mi === now.getMonth();
  const state = model.isFutureMonth(y, mi) ? 'future' : isCurrent ? 'current' : 'past';
  // The months before this one that have figures, newest first (crossing into the year before).
  const back = [];
  let yy = y, m = mi;
  for (let i = 0; i < 12 && back.length < 3; i++) {
    m -= 1;
    if (m < 0) { const yl = parseInt(yy.year, 10) - 1; yy = DATA.find((d) => parseInt(d.year, 10) === yl); m = 11; if (!yy) break; }
    if (model.isFutureMonth(yy, m) || !model.monthHasData(yy, m)) continue;
    back.push({ y: yy, mi: m, steps: i + 1, c: model.computeMonth(yy, m) });
  }
  // "The previous month" only when it is the month right before and has figures.
  const prev = back[0] && back[0].steps === 1 ? { c: back[0].c, label: MONTH_ABBR[back[0].mi] } : null;
  const three = back.slice(0, 3);
  const avg = three.length ? {
    income: three.reduce((a, b) => a + b.c.income, 0) / three.length,
    invest: three.reduce((a, b) => a + b.c.invest, 0) / three.length,
    expenseTotal: three.reduce((a, b) => a + b.c.expenseTotal, 0) / three.length,
    byGroup: (g) => three.reduce((a, b) => a + (b.c.byGroup[g] || 0), 0) / three.length,
  } : null;
  // The month's budget (its own, or the year's starting budget), summed per kind and per Expenses sub-category.
  const budgets = model.budgetsFor ? model.budgetsFor(y.year, mi) : [];
  const sum = (f) => budgets.filter(f).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const budget = {
    income: sum((b) => b.type === 'income'),
    invest: sum((b) => b.type === 'investment'),
    expense: sum((b) => b.type === 'expense'),
    group: (g) => sum((b) => b.type === 'expense' && b.group === g),
  };
  return { state, prev, avg, budget };
}

// A change between two figures; `upIsGood` sets the colour. `fmt` writes the size of the change.
function change(now, then, label, upIsGood, fmt, flatWithin) {
  const d = now - then;
  if (Math.abs(d) <= flatWithin) return { tone: 'neutral', dir: 'flat', text: `same as ${label}` };
  const up = d > 0;
  return { tone: up === upIsGood ? 'good' : 'bad', dir: up ? 'up' : 'down', text: `${fmt(Math.abs(d))} vs ${label}` };
}
// "3-mo avg" is written with a non-breaking hyphen and space so it never splits across lines on the phone tiles.
const NONE = { tone: 'neutral', dir: null, text: 'Nothing to compare yet' };
const FUTURE = { tone: 'neutral', dir: null, text: 'Projected from budget' };
const share = (part, whole) => (whole > 0 ? part / whole : null);
const pts = (v) => { const n = Math.round(v * 100); return `${n} ${n === 1 ? 'pt' : 'pts'}`; };

export function cardIndicators(model, y, mi, now = new Date()) {
  const cur = y.currency;
  const c = model.computeMonth(y, mi);
  const { state, prev, avg, budget } = comparisonBase(model, y, mi, now);
  const kept = share(c.income - c.invest - c.expenseTotal, c.income);
  const saved = share(c.invest, c.income);
  const out = {};

  // Balance: the share of incomes kept, against the plan / the previous month / the 3-month average.
  if (state === 'future') out.balance = FUTURE;
  else if (kept === null) out.balance = { tone: 'neutral', dir: null, text: 'No incomes yet this month' };
  else {
    const head = kept < 0 ? `Spent ${pct(-kept)} over incomes` : `Kept ${pct(kept)} of incomes`;
    let ref = null, label = null;
    if (state === 'current' && budget.income > 0 && budget.expense > 0) { ref = share(budget.income - budget.invest - budget.expense, budget.income); label = 'plan'; }
    else if (state === 'past' && prev && prev.c.income > 0) { ref = share(prev.c.income - prev.c.invest - prev.c.expenseTotal, prev.c.income); label = prev.label; }
    else if (state === 'past' && avg && avg.income > 0) { ref = share(avg.income - avg.invest - avg.expenseTotal, avg.income); label = '3‑mo avg'; }
    out.balance = ref === null ? { tone: 'neutral', dir: null, text: head }
      : { head, ...change(kept, ref, label, true, pts, 0.005) };
  }

  // Incomes: share of what was expected this month, or against the 3-month average.
  if (state === 'future') out.income = FUTURE;
  else if (state === 'current' && budget.income > 0) {
    const r = c.income / budget.income;
    out.income = { tone: r >= 0.995 ? 'good' : 'neutral', dir: null, text: `${pct(r)} of expected` };
  } else if (state === 'current' && avg && avg.income > 0) {
    out.income = { tone: 'neutral', dir: null, text: `${pct(c.income / avg.income)} of 3‑mo avg` };
  } else if (avg && avg.income > 0) {
    const r = c.income / avg.income - 1;
    out.income = Math.abs(r) < 0.005 ? { tone: 'neutral', dir: 'flat', text: 'same as 3‑mo avg' }
      : { tone: r > 0 ? 'good' : 'bad', dir: r > 0 ? 'up' : 'down', text: `${pct(Math.abs(r))} vs 3‑mo avg` };
  } else out.income = NONE;

  // Expenses: share of the budget this month, or the change against the previous month / the 3-month average.
  const expenseVs = (value, budgetAmount, prevValue, avgValue, prevLabel) => {
    if (state === 'future') return FUTURE;
    if (state === 'current' && budgetAmount > 0) {
      const r = value / budgetAmount;
      return { tone: r > 1.005 ? 'bad' : 'good', dir: null, text: `${pct(r)} of ${money(budgetAmount, cur)} budget` };
    }
    // A month still running is set against a whole month as a share, never as "down by".
    if (state === 'current' && avg) return avgValue > 0
      ? { tone: value > avgValue * 1.005 ? 'bad' : 'neutral', dir: null, text: `${pct(value / avgValue)} of ${money(avgValue, cur)} avg` }
      : value > 0 ? { tone: 'neutral', dir: null, text: 'Nothing to compare yet' } : { tone: 'neutral', dir: 'flat', text: 'same as 3‑mo avg' };
    if (state === 'past' && prev) return change(value, prevValue, prevLabel || prev.label, false, (v) => money(v, cur), 0.5);
    if (avg) return change(value, avgValue, '3‑mo avg', false, (v) => money(v, cur), 0.5);
    return NONE;
  };
  out.expense = expenseVs(c.expenseTotal, budget.expense, prev && prev.c.expenseTotal, avg && avg.expenseTotal);
  out.group = (g, prevLabel) => expenseVs(c.byGroup[g] || 0, budget.group(g), prev && (prev.c.byGroup[g] || 0), avg && avg.byGroup(g), prevLabel);

  // Savings: the rate, against the plan / the previous month / the 3-month average.
  if (state === 'future') out.invest = FUTURE;
  else if (saved === null) out.invest = { tone: 'neutral', dir: null, text: 'No incomes yet this month' };
  else {
    const head = `${pct(saved)} of incomes`;
    let ref = null, label = null;
    if (state === 'current' && budget.income > 0 && budget.invest > 0) { ref = share(budget.invest, budget.income); label = 'plan'; }
    else if (state === 'past' && prev && prev.c.income > 0) { ref = share(prev.c.invest, prev.c.income); label = prev.label; }
    else if (state === 'past' && avg && avg.income > 0) { ref = share(avg.invest, avg.income); label = '3‑mo avg'; }
    out.invest = ref === null ? { tone: 'neutral', dir: null, text: head }
      : { head, ...change(saved, ref, label, true, pts, 0.005) };
  }
  return out;
}
