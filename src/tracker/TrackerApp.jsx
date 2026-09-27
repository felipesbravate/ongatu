'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../ui/okara.css';
import '../ui/shell.css';
import { AppHeader, Button, MobileBottomNav, Toast, useToast } from '../ui/index.js';
import { db, getMe } from './api.js';
import { AccountNav, firstNameOf } from './AccountBar.jsx';
import { AddPanel } from './AddPanel.jsx';
import { useConfirm } from './ConfirmModal.jsx';
import { useProfile } from './profile.js';
import { BudgetPanel } from './BudgetPanel.jsx';
import { ExpenseStrip, HeroLeft, TrackerCard, TrendChart, YearOverYear } from './Dashboard.jsx';
import { MONTH_ABBR, budgetDefaultDocId, createModel, currentYearLabel, parseAmount, yearsFromDocs } from './model.js';
import { YearNav } from './YearNav.jsx';

const COLLECTIONS = ['entries', 'years', 'overrides', 'budgets', 'budgetDefaults'];
const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const copy = (o) => JSON.parse(JSON.stringify(o));

export default function TrackerApp() {
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ years: [], entries: [], overrides: [], budgets: [], budgetDefaults: [] });
  const DATA = useMemo(() => yearsFromDocs(data.years), [data.years]);
  const model = useMemo(() => createModel({ data: DATA, entries: data.entries, overrides: data.overrides, budgets: data.budgets, budgetDefaults: data.budgetDefaults }), [DATA, data]);
  const modelRef = useRef(model); modelRef.current = model;

  // Which year and month are shown. Starts on today's month, like the legacy page.
  const [view, setView] = useState(() => {
    const m = createModel({ data: yearsFromDocs([]), entries: [], overrides: [], budgets: [], budgetDefaults: [] });
    const cur = m.currentYearMonthIndex();
    return cur ? { yearIdx: cur.yearIdx, monthIdx: cur.monthIndex } : { yearIdx: 0, monthIdx: m.defaultMonth(m.DATA[0]) };
  });
  const viewRef = useRef(view); viewRef.current = view;
  const [bd, setBd] = useState({ type: 'Fixed', group: 'Fixed' });
  const [tip, setTip] = useState(null);
  const [confirmModal, confirm] = useConfirm();
  const profile = useProfile(me);
  const pendingAlert = useRef(null);
  const [addPanel, setAddPanel] = useState({ open: false, preset: { type: 'expense', group: 'Fixed' } });
  const [pendingYear, setPendingYear] = useState(null);
  const [monthBudget, setMonthBudget] = useState(null); // { yearIdx, monthIdx } while "Adjust month's budget" is open
  const [addingYear, setAddingYear] = useState(false);
  const [yearToast, setYearToast] = useState(null); // { message, undo }
  const [toastEl, showToast] = useToast();
  const yearToastTimer = useRef(null);
  const yearsHydrated = useRef(false);
  const autoYearTried = useRef(false);

  // ---- data ----
  useEffect(() => {
    // The page shows nothing until the account is known to be approved (signed out: api() goes to /login).
    getMe().then((m) => {
      if (m.status === 'pending') location.href = '/pending';
      else if (m.status === 'blocked') location.href = '/blocked';
      else {
        setMe(m);
        // Account > Import data lands here with ?add=1: open the Add panel (upload a spreadsheet or documents).
        const q = new URLSearchParams(location.search);
        if (q.get('add') === '1') { setAddPanel((p) => ({ ...p, open: true })); history.replaceState(null, '', location.pathname); }
        // A notification's "View" from another page: /?alert=<year>|<month>|<group> opens that month and group.
        if (q.get('alert')) { pendingAlert.current = q.get('alert'); history.replaceState(null, '', location.pathname); }
      }
    }).catch(() => {});
    const offs = COLLECTIONS.map((name) => db.collection(name).onSnapshot((snap) => {
      const docs = docsOf(snap);
      if (name !== 'years') { setData((d) => ({ ...d, [name]: docs })); return; }
      // Years: keep looking at the same year when the list changes; jump to a year that was just added.
      const prevData = modelRef.current.DATA;
      const newData = yearsFromDocs(docs);
      const tmp = createModel({ data: newData, entries: modelRef.current.ENTRIES, overrides: modelRef.current.OVERRIDES, budgets: modelRef.current.BUDGETS, budgetDefaults: modelRef.current.BUDGET_DEFAULTS });
      const v = viewRef.current;
      const currentLabel = prevData[v.yearIdx] ? prevData[v.yearIdx].year : null;
      let next = v;
      if (!yearsHydrated.current) {
        yearsHydrated.current = true;
        const cur = tmp.currentYearMonthIndex();
        if (cur) next = { yearIdx: cur.yearIdx, monthIdx: cur.monthIndex };
        else if (v.yearIdx >= newData.length) { const yi = newData.length - 1; next = { yearIdx: yi, monthIdx: tmp.defaultMonth(newData[yi]) }; }
      } else if (newData.length > prevData.length) {
        next = { yearIdx: newData.length - 1, monthIdx: 0 };
      } else {
        const keep = currentLabel ? newData.findIndex((y) => y.year === currentLabel) : -1;
        if (keep >= 0) next = { ...v, yearIdx: keep };
        else { const yi = Math.max(0, Math.min(v.yearIdx, newData.length - 1)); next = { yearIdx: yi, monthIdx: tmp.defaultMonth(newData[yi]) }; }
      }
      // First visit of a new account: create the current year once, so entries have a home.
      if (!docs.length && !autoYearTried.current) {
        autoYearTried.current = true;
        db.collection('years').add({ year: currentYearLabel(), currency: 'EUR', createdAt: new Date().toISOString() }).catch(() => {});
      }
      setData((d) => ({ ...d, years: docs }));
      setView(next);
    }, (err) => console.error(name + ' subscription error', err)));
    return () => offs.forEach((off) => off());
  }, []);

  // ---- the Entries tooltip closes on any redraw and on a click outside it ----
  useEffect(() => { setTip(null); }, [model, view, bd]);
  useEffect(() => {
    if (!tip) return;
    const onDoc = (ev) => {
      const t = document.getElementById('note-tip');
      if (t && t.contains(ev.target)) return;
      if (tip.anchor && tip.anchor.contains(ev.target)) return;
      setTip(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [tip]);

  // ---- saving ----
  const yearCreations = useRef(new Map());
  const waitForYear = async (label) => { for (let i = 0; i < 60 && !modelRef.current.DATA.some((y) => y.year === label); i++) await new Promise((r) => setTimeout(r, 75)); return modelRef.current.DATA.some((y) => y.year === label); };
  // January of the next year, from 25 December: the first entry dated there creates the year.
  const ensureYearForDate = (val) => {
    const m = modelRef.current;
    if (m.resolveDate(val)) return Promise.resolve(true);
    if (!m.isOpenNextMonthDate(val)) return Promise.resolve(false);
    const label = String(val).slice(0, 4);
    if (!yearCreations.current.has(label)) {
      const numeric = m.DATA.filter((y) => !isNaN(parseInt(y.year, 10))).sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));
      const currency = (numeric[0] && numeric[0].currency) || 'EUR';
      const p = db.collection('years').add({ year: label, currency, createdAt: new Date().toISOString(), taxonomy: copy(m.taxonomyForYear(label)) })
        .then(() => waitForYear(label)).catch(() => false).finally(() => yearCreations.current.delete(label));
      yearCreations.current.set(label, p);
    }
    return yearCreations.current.get(label);
  };
  const ensurePeriod = async (key) => {
    const d = `${key}-01`;
    if (!modelRef.current.resolveDate(d) && !(await ensureYearForDate(d))) return null;
    return modelRef.current.resolveDate(d);
  };
  const toastFor = (added) => {
    const n = added.length;
    const months = new Set(added.map((d) => `${d.year}-${d.monthIndex}`));
    const where = months.size === 1 ? ` to ${MONTH_ABBR[added[0].monthIndex]} ${added[0].year}` : '';
    if (n === 1 && added[0].description) return `"${added[0].description}" added${where}.`;
    return `${n} ${n === 1 ? 'entry' : 'entries'} added${where}.`;
  };
  const focusMonthOf = (added) => {
    const months = new Set(added.map((d) => `${d.year}-${d.monthIndex}`));
    if (months.size !== 1) return;
    const yi = modelRef.current.DATA.findIndex((y) => y.year === added[0].year);
    if (yi >= 0) setView({ yearIdx: yi, monthIdx: added[0].monthIndex });
  };
  const save = {
    // Books entries in the month and year `periodKey`. Manual: one entry, throws on failure. Review: saves each,
    // returns { failed: [index] }, or null when the year could not be created.
    async entries(periodKey, rows, isReview) {
      const res = await ensurePeriod(periodKey);
      if (!res) { if (isReview) return null; throw new Error(`could not create ${periodKey.slice(0, 4)}`); }
      const year = modelRef.current.DATA[res.yearIdx].year;
      const docs = rows.map((r) => ({ year, monthIndex: res.monthIndex, ...r, createdAt: new Date().toISOString() }));
      if (!isReview) {
        await db.collection('entries').add(docs[0]);
        focusMonthOf(docs); showToast(toastFor(docs), 'success');
        return { failed: [] };
      }
      const results = await Promise.allSettled(docs.map((d) => db.collection('entries').add(d)));
      const ok = [], failed = [];
      results.forEach((r, i) => (r.status === 'fulfilled' ? ok : failed).push(i));
      const added = ok.map((i) => docs[i]);
      if (added.length) { focusMonthOf(added); showToast(toastFor(added), 'success'); }
      return { failed };
    },
  };

  const tipActions = {
    deleteEntry: (id) => {
      setTip(null);
      const e = modelRef.current.ENTRIES.find((x) => x.id === id);
      const what = e && e.description ? `"${e.description}"` : 'this entry';
      confirm({
        title: `Are you sure you want to delete ${what}?`,
        description: 'This entry will be permanently deleted.',
        onConfirm: () => removeEntry(id, e),
      });
    },
    deleteBaseValue: (row) => {
      if (row.override) return;
      setTip(null);
      confirm({
        title: `Are you sure you want to delete ${row.item} from ${MONTH_ABBR[row.mi]} ${row.yearLabel}?`,
        description: row.isEstimate
          ? 'This estimate will no longer count for this month. You can restore it from the same list.'
          : 'This value will no longer count for this month. You can restore it from the same list.',
        onConfirm: () => removeBaseValue(row),
      });
    },
    restoreOverride: async (id) => {
      if (!id) return;
      setTip(null);
      try { await db.doc('overrides/' + id).delete(); showToast('Value restored.', 'success'); }
      catch { showToast('Could not restore the value.', 'fail'); }
    },
  };
  async function removeEntry(id, e) {
      try { await db.doc('entries/' + id).delete(); showToast(e && e.description ? `"${e.description}" removed.` : 'Entry removed.', 'success'); }
      catch { showToast('Could not remove the entry.', 'fail'); }
  }
  async function removeBaseValue(row) {
      try {
        await db.collection('overrides').add({ year: row.yearLabel, monthIndex: row.mi, type: row.type, group: row.group, category: row.category, item: row.item, createdAt: new Date().toISOString() });
        showToast(`${row.item} removed from ${MONTH_ABBR[row.mi]} ${row.yearLabel}.`, 'success');
      } catch { showToast(`Could not remove ${row.item}.`, 'fail'); }
  }

  // ---- years ----
  const hideYearToast = useCallback(() => { clearTimeout(yearToastTimer.current); setYearToast(null); }, []);
  const deleteYear = async (y) => {
    if (!y.dbId) return;
    const m = modelRef.current, label = y.year;
    const entrySnaps = m.ENTRIES.filter((e) => e.year === label).map((e) => ({ ...e }));
    const overrideSnaps = m.OVERRIDES.filter((o) => o.year === label).map((o) => ({ ...o }));
    const budgetSnaps = m.BUDGETS.filter((b) => b.year === label).map((b) => ({ ...b }));
    const extraDoc = data.years.find((e) => e.id === y.dbId) || {};
    const snap = { year: label, currency: y.currency, createdAt: extraDoc.createdAt || new Date().toISOString(), entrySnaps, overrideSnaps, budgetSnaps, taxonomy: extraDoc.taxonomy || null };
    await Promise.all([
      ...entrySnaps.map((e) => db.doc('entries/' + e.id).delete().catch(() => {})),
      ...overrideSnaps.map((o) => db.doc('overrides/' + o.id).delete().catch(() => {})),
      ...budgetSnaps.map((b) => db.doc('budgets/' + b.id).delete().catch(() => {})),
      db.doc('years/' + y.dbId).delete().catch(() => {}),
    ]);
    const undo = async () => {
      hideYearToast();
      await db.collection('years').add({ year: snap.year, currency: snap.currency, createdAt: snap.createdAt, ...(snap.taxonomy ? { taxonomy: snap.taxonomy } : {}) }).catch(() => {});
      for (const e of snap.entrySnaps) { const { id, ...rest } = e; await db.collection('entries').add(rest).catch(() => {}); }
      for (const o of snap.overrideSnaps) { const { id, ...rest } = o; await db.collection('overrides').add(rest).catch(() => {}); }
      for (const b of snap.budgetSnaps) { const { id, ...rest } = b; await db.collection('budgets').add(rest).catch(() => {}); }
    };
    clearTimeout(yearToastTimer.current);
    setYearToast({ message: `"${label}" deleted — ${entrySnaps.length} entr${entrySnaps.length === 1 ? 'y' : 'ies'} removed with it.`, undo });
    yearToastTimer.current = setTimeout(() => setYearToast(null), 8000);
  };
  const askDeleteYear = (y) => confirm({
    title: `Are you sure you want to delete ${y.year}?`,
    description: 'All the entries and data of this year will be permanently deleted.',
    onConfirm: () => deleteYear(y),
  });
  const createYear = async (rows) => {
    const { label, currency } = pendingYear;
    try {
      // A new year starts with the categories of the nearest existing year (copied, so later edits never leak).
      await db.collection('years').add({ year: label, currency, createdAt: new Date().toISOString(), taxonomy: copy(modelRef.current.taxonomyForYear(label)) });
      for (const r of rows) {
        const amount = Math.round(parseAmount(r.value) * 100) / 100; // typed in European format (1.163,59)
        const computed = parseFloat(r.computed) || 0;
        const group = r.group || null, category = r.category || null;
        if (amount > 0) await db.collection('budgets').add({ year: label, type: r.type, group, category, item: r.item, amount, createdAt: new Date().toISOString() }).catch(() => {});
        if (Math.abs(amount - computed) > 0.004) {
          await db.doc('budgetDefaults/' + budgetDefaultDocId(r.type, group, category, r.item)).set({ type: r.type, group, category, item: r.item, amount, updatedAt: new Date().toISOString() }).catch(() => {});
        }
      }
      setPendingYear(null);
      showToast(`${label} created.`, 'success');
    } catch (err) {
      showToast(`Could not create ${label}.`, 'fail');
      throw err;
    }
  };

  // "Adjust month's budget": one budget doc per item for that month (monthIndex set); it wins over the starting budget.
  const saveMonthBudget = async (rows) => {
    const { yearIdx: yi, monthIdx: mi } = monthBudget;
    const m = modelRef.current, yr = m.DATA[yi];
    const label = yr.year;
    const old = m.BUDGETS.filter((b) => b.year === label && b.monthIndex === mi);
    try {
      await Promise.all(old.map((b) => db.doc('budgets/' + b.id).delete().catch(() => {})));
      for (const r of rows) {
        const amount = Math.round(parseAmount(r.value) * 100) / 100;
        await db.collection('budgets').add({ year: label, monthIndex: mi, type: r.type, group: r.group || null, category: r.category || null, item: r.item, amount, createdAt: new Date().toISOString() });
      }
      setMonthBudget(null);
      showToast(`${MONTH_ABBR[mi]} ${label} budget saved.`, 'success');
    } catch (err) {
      showToast(`Could not save the ${MONTH_ABBR[mi]} ${label} budget.`, 'fail');
      throw err;
    }
  };

  const alerts = useMemo(() => model.budgetAlerts(), [model]);
  const openAlert = useCallback((a) => {
    const yi = modelRef.current.DATA.findIndex((d) => d.year === a.year);
    if (yi < 0) return;
    setView({ yearIdx: yi, monthIdx: a.mi });
    setBd({ type: a.group, group: a.group });
    const el = document.querySelector('.breakdown-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  // Coming from Account with ?alert=…: open it once the years are in.
  useEffect(() => {
    if (!pendingAlert.current) return;
    const [year, mi, group] = pendingAlert.current.split('|');
    if (!model.DATA.some((d) => d.year === year)) return;
    pendingAlert.current = null;
    openAlert({ year, mi: Number(mi), group });
  }, [model, openAlert]);

  const y = model.DATA[view.yearIdx] || model.DATA[model.DATA.length - 1];
  const yearIdx = model.DATA.indexOf(y);
  const monthIdx = view.monthIdx;
  const selectYear = (i) => setView({ yearIdx: i, monthIdx: model.defaultMonth(model.DATA[i]) });
  const selectMonth = (i) => setView((v) => ({ ...v, monthIdx: i }));
  const topTab = (bd.type === 'Income' || bd.type === 'Investments') ? bd.type : 'Expenses';

  if (!me) return null;
  return (
    <>
      <div className="app-top-gap" />
      <AppHeader><AccountNav me={me} profile={profile} alerts={alerts} onOpenAlert={openAlert} /></AppHeader>
      <div className={'wrap' + (addingYear ? ' is-adding-year' : '')}>
        <header className="top">
          <h1 className="app-title">{`Hey, ${profile.name}`}</h1>
          <div className="app-sub">Ready to see where you stand today? Track your spending and savings for the month.</div>
        </header>
        <YearNav model={model} yearIdx={yearIdx} monthIdx={monthIdx} onYear={selectYear} onMonth={selectMonth} canSave onAddingChange={setAddingYear}
          onAddYear={(label, currency) => setPendingYear({ label, currency })} onDeleteYear={askDeleteYear} />
        <AddPanel open={addPanel.open} preset={addPanel.preset} model={model} yearIdx={yearIdx} monthIdx={monthIdx}
          onClose={() => setAddPanel((p) => ({ ...p, open: false }))} save={save} />
        <BudgetPanel pending={pendingYear} model={model} onClose={() => setPendingYear(null)} onCreate={createYear} />
        <BudgetPanel month={monthBudget} model={model} onClose={() => setMonthBudget(null)} onSave={saveMonthBudget} />
        <div className="row1">
          <HeroLeft model={model} y={y} monthIdx={monthIdx} />
          <div className="hero-right">
            <TrackerCard model={model} y={y} monthIdx={monthIdx} breakdownType={bd.type} breakdownGroup={bd.group} tip={tip} setTip={setTip} actions={tipActions}
              addOpen={addPanel.open} onAdjustBudget={() => setMonthBudget({ yearIdx, monthIdx })}
              onTab={(type, group) => setBd((b) => ({ type, group: group || b.group }))}
              onAdd={() => setAddPanel({ open: true, preset: { type: topTab === 'Income' ? 'income' : topTab === 'Investments' ? 'investment' : 'expense', group: bd.group } })} />
            <ExpenseStrip model={model} y={y} monthIdx={monthIdx} />
            <TrendChart model={model} y={y} monthIdx={monthIdx} onMonth={selectMonth} />
          </div>
        </div>
        <YearOverYear model={model} onYear={selectYear} />
        <footer className="note" id="app-footer">Costs Tracker. Your entries are encrypted before they are stored. Documents you upload are read once to extract entries and are never saved.</footer>
      </div>
      <MobileBottomNav selection="home" image={profile.image}
        onAdd={() => setAddPanel({ open: true, preset: { type: topTab === 'Income' ? 'income' : topTab === 'Investments' ? 'investment' : 'expense', group: bd.group } })} />
      {toastEl}
      <Toast id="year-toast" type="neutral" visible={!!yearToast} onClose={hideYearToast}
        action={yearToast ? <Button size="tiny" variant="secondary" className="toast-undo" onClick={yearToast.undo}>Undo</Button> : null}>{yearToast ? yearToast.message : ''}</Toast>
      {confirmModal}
    </>
  );
}
