'use client';
// Onboarding and setup (Ongatu 397:4392, Oct 2). After "Create account" and the code, a new account lands here:
//   02 Tour (3 cards, 399:4424 / 399:4485 / 564:7633) -> 03 Choose how to start (400:4509) -> 03a Set up your board,
//   from the starter template (401:4464) or empty (402:4539) -> 04 Welcome modal (404:4571) -> the dashboard.
// "Start tracking" writes the first year (its taxonomy = the board), a budget per type that has one, and
// settings/onboarding, so the dashboard never sends this account here again.
import { useEffect, useRef, useState } from 'react';
import '../ui/okara.css';
import { ActionLink, Button, Divider, Dropdown, Logo, Modal, illustrations, useMobile } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { arrowStraightRight, euro, plus, x } from '../ui/icons.js';
import { Illustration } from '../ui/Modal.jsx';
import { ListSelector, Pager, StepProgress, Tag } from '../ui/Selectors.jsx';
import { db, getMe, leavePage } from '../tracker/api.js';
import { CATS, EXP_GROUPS, MONTH_NAMES, addSubToTaxonomy, addTypeToTaxonomy, budgetDefaultDocId, ensureCustom, fmtNum, hasGroups, isCustomType, parseAmount } from '../tracker/model.js';
import { CategoryModal, KINDS, SubCategoryModal, TypeModal, kindLabel } from '../tracker/TaxonomyModals.jsx';
import { useConfirm } from '../tracker/ConfirmModal.jsx';

const STEPS = ['Account', 'Tour', 'Setup'];
const nowYear = new Date().getFullYear();

// The starter template: the generic taxonomy every new year falls back to (model.CATS).
function templateBoard() {
  const types = [];
  CATS.incomes.forEach((item) => types.push({ type: 'income', group: null, category: null, item, budget: 0 }));
  CATS.investments.forEach((item) => types.push({ type: 'investment', group: null, category: null, item, budget: 0 }));
  Object.entries(CATS.expenses).forEach(([group, cats]) => Object.entries(cats).forEach(([category, items]) => items.forEach((item) => types.push({ type: 'expense', group, category, item, budget: 0 }))));
  return { kinds: ['income', 'investment', 'expense'], names: {}, subs: { expense: EXP_GROUPS.slice() }, types };
}
// board = { kinds: [type], names: { customType: name }, subs: { [type]: [sub-category] }, types: [{ type, group, category, item, budget }] }
const emptyBoard = () => ({ kinds: ['income'], names: {}, subs: {}, types: [] });

export function taxonomyOfBoard(board) {
  const tx = { incomes: [], investments: [], expenses: {} };
  board.kinds.forEach((k) => { if (isCustomType(k)) ensureCustom(tx, k, board.names[k]); (board.subs[k] || []).forEach((g) => addSubToTaxonomy(tx, k, g, board.names[k])); });
  board.types.forEach((t) => addTypeToTaxonomy(tx, t, board.names[t.type]));
  return tx;
}

function Header({ name }) {
  return (
    <header className="ob-header">
      <Logo variant="symbol" height={44} />
      <h1 className="ob-title">Welcome{name ? `, ${name}` : ''}</h1>
      <p className="ob-sub">Let&apos;s get started.</p>
    </header>
  );
}

// ---------- 02 Tour ----------
const TOUR = [
  { title: 'Every cent in one place', text: 'Track your income, expenses, and savings month by month. See exactly where you stand in seconds.' },
  { title: 'Your data is safe and stays yours', text: 'Your data is fully encrypted and accessible only by you. AI is strictly used to categorize your receipts, nothing else. Export or erase your account whenever you want.' },
  { title: 'Built for how your brain works', text: 'Forget rigid budgeting templates. Create custom categories and types that match exactly how you think about your money, from daily coffee runs to long-term investments.' },
];
function MiniDashboard() {
  const rows = [['Income', '3.900,00', 'var(--data-purple)', 72], ['Expenses', '1.160,00', 'var(--data-pink)', 44], ['Savings', '1.500,00', 'var(--data-light-blue)', 55]];
  return (
    <div className="ob-mini" aria-hidden="true">
      <div className="ob-mini-head"><span>Balance</span><span className="ob-mini-bal">€1.240,00</span></div>
      <div className="ob-mini-rows">
        {rows.map(([n, v, c, w]) => (
          <div key={n} className="ob-mini-meter">
            <div className="ob-mini-info"><span>{n}</span><span className="ob-mini-val"><Icon icon={euro} size={12} />{v}</span></div>
            <div className="ob-mini-bar"><div style={{ width: w + '%', background: c }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
function TourArt({ i }) {
  if (i === 0) return <MiniDashboard />;
  if (i === 1) return (
    <div className="ob-art-col">
      <Illustration art={illustrations.padlock} width={69} />
      <div className="ob-tags"><Tag type="positive" className="ob-tag">Fully encrypted</Tag><Tag type="positive" className="ob-tag">A key just for you</Tag><Tag type="positive" className="ob-tag">Export or erase</Tag></div>
    </div>
  );
  return <Illustration art={illustrations.head} width={177} />;
}
function Tour({ card, setCard, onDone }) {
  const t = TOUR[card];
  return (
    <section className="ob-card ob-tour" aria-labelledby="ob-tour-title">
      <div className="ob-tour-content">
        <div className="ob-tour-top">
          <ActionLink id="ob-skip" className="ob-skip" onClick={onDone}>Skip</ActionLink>
          <div className="ob-art"><TourArt i={card} /></div>
        </div>
        <div className="ob-tour-text">
          <h2 className="ob-card-title" id="ob-tour-title">{t.title}</h2>
          <p className="ob-card-text">{t.text}</p>
        </div>
        <Pager count={TOUR.length} current={card} onGo={setCard} />
      </div>
      <Button id="ob-next" className={card < TOUR.length - 1 ? 'ob-full' : 'ob-wide'} onClick={() => (card < TOUR.length - 1 ? setCard(card + 1) : onDone())}>{card < TOUR.length - 1 ? 'Next' : 'Go to setup'}</Button>
    </section>
  );
}

// ---------- 03 Choose how to start ----------
function Choose({ onPick }) {
  return (
    <section className="ob-card ob-choose" aria-labelledby="ob-choose-title">
      <div className="ob-card-head">
        <h2 className="ob-card-title" id="ob-choose-title">How do you want to start?</h2>
        <p className="ob-card-text">Pick one to get going. You can edit categories and add past months anytime.</p>
      </div>
      <div className="ob-options">
        <button type="button" className="ob-option" id="ob-template" onClick={() => onPick('template')}>
          <span className="ob-option-art"><Illustration art={illustrations.laptop} width={75} /></span>
          <span className="ob-option-text"><span className="ob-option-title">Start from a template</span><span className="ob-option-desc">Ready-made categories for income, bills and savings. Keep what fits.</span></span>
          <span className="ds-action-link medium ob-option-link">Start with the template<Icon icon={arrowStraightRight} size={12} /></span>
        </button>
        <button type="button" className="ob-option" id="ob-empty" onClick={() => onPick('empty')}>
          <span className="ob-option-art"><Illustration art={illustrations.pencil} width={60} /></span>
          <span className="ob-option-text"><span className="ob-option-title">Build your own board</span><span className="ob-option-desc">Create your own tracking categories from zero, one at a time.</span></span>
          <span className="ds-action-link medium ob-option-link">Organise your own<Icon icon={arrowStraightRight} size={12} /></span>
        </button>
      </div>
    </section>
  );
}

// ---------- 03a Set up your board ----------
function BudgetCell({ t, onBudget }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span className="ds-input tiny ob-budget-input"><Icon icon={euro} size={12} />
        <input autoFocus inputMode="decimal" aria-label={`Monthly budget for ${t.item}`} defaultValue={fmtNum(t.budget)}
          onBlur={(e) => { onBudget(parseAmount(e.target.value)); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setEditing(false); }} /></span>
    );
  }
  return (
    <button type="button" className="ds-action-link ob-budget" aria-label={`Monthly budget for ${t.item}: ${fmtNum(t.budget)}. Edit`} onClick={() => setEditing(true)}>
      <Icon icon={euro} size={16} /><span className="ob-budget-val">{fmtNum(t.budget)}</span>
    </button>
  );
}
function TypeRow({ t, onBudget, onRemove }) {
  return (
    <div className="bd-row ob-type-row" data-item={t.item}>
      <span className="bd-item-name">{t.item}</span>
      <BudgetCell t={t} onBudget={onBudget} />
      <button type="button" className="round-btn micro" aria-label={`Remove ${t.item}`} onClick={onRemove}><Icon icon={x} size="md" /></button>
    </div>
  );
}

function Setup({ mode, onStart, busy, error }) {
  const [board, setBoard] = useState(() => (mode === 'template' ? templateBoard() : emptyBoard()));
  const [sel, setSel] = useState('income');
  const [modal, setModal] = useState(null); // 'category' | 'sub' | 'type'
  const [confirmModal, confirm] = useConfirm();
  const mobile = useMobile();
  // Oct 4: a category without the "Default" tag can be deleted (its X, 401:4464 / 719:18723), after the confirm modal.
  // Its types go too; Expenses also takes its sub-categories. Income (Default) always stays.
  const deleteKind = (k) => {
    const n = board.types.filter((t) => t.type === k).length;
    const ns = (board.subs[k] || []).length;
    const parts = [ns ? `its ${ns} sub-categor${ns === 1 ? 'y' : 'ies'}` : null, n ? `${n} type${n === 1 ? '' : 's'}` : null].filter(Boolean);
    confirm({
      title: `Are you sure you want to delete ${label(k)}?`,
      description: parts.length ? `This removes ${parts.join(' and ')} from your board. You can add the category again later.` : 'You can add the category again later.',
      onConfirm: async () => {
        setBoard((b) => { const subs = { ...b.subs }; delete subs[k]; const names = { ...b.names }; delete names[k]; return { ...b, kinds: b.kinds.filter((x) => x !== k), names, subs, types: b.types.filter((t) => t.type !== k) }; });
        if (sel === k) setSel('income');
      },
    });
  };
  const [year, setYear] = useState(String(nowYear));
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const typesOf = (k) => board.types.filter((t) => t.type === k);
  const label = (k) => kindLabel(k, board.names);
  const subsOf = (k) => board.subs[k] || [];
  const patchType = (t, fn) => setBoard((b) => ({ ...b, types: b.types.map((x) => (x === t ? fn(x) : x)) }));
  const removeType = (t) => setBoard((b) => ({ ...b, types: b.types.filter((x) => x !== t) }));
  const addTypes = ({ group, category, items }) => setBoard((b) => {
    const exists = (it) => b.types.some((x) => x.type === sel && x.item.toLowerCase() === it.toLowerCase() && (x.group || null) === (group || null));
    return { ...b, types: [...b.types, ...items.filter((it) => !exists(it)).map((item) => ({ type: sel, group, category, item, budget: 0 }))] };
  });
  const groupsOf = (g) => [...new Set(board.types.filter((t) => t.type === sel && (t.group || null) === (g || null) && t.category).map((t) => t.category))];
  const descOf = (k) => {
    const n = subsOf(k).length;
    return n ? `${n} sub-categor${n === 1 ? 'y' : 'ies'}` : 'No sub-categories';
  };
  const selTypes = typesOf(sel);
  const years = Array.from({ length: 6 }, (_, i) => String(nowYear - i));
  const months = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m, selectedLabel: m.slice(0, 3) })).filter((o) => Number(year) < nowYear || Number(o.value) <= new Date().getMonth());

  return (
    <section className="ob-card ob-setup" aria-labelledby="ob-setup-title">
      <div className="ob-card-head">
        <h2 className="ob-card-title" id="ob-setup-title">Set up your board</h2>
        <p className="ob-card-text">Keep what fits and add your own. Nothing is locked in.</p>
      </div>
      <div className="ob-setup-cols">
        <div className="ob-col ob-col-cats">
          <h3 className="ob-col-title">Category</h3>
          <div className="ob-col-content">
            <div className="ob-list">
              {board.kinds.map((k) => (
                <ListSelector key={k} id={`ob-cat-${k}`} title={label(k)} label={k === 'income' ? 'Default' : null} description={sel === k ? null : descOf(k)} selected={sel === k} onSelect={() => setSel(k)}
                  onDelete={k === 'income' ? undefined : () => deleteKind(k)} deleteLabel={`Delete ${label(k)}`}
                  action={<ActionLink size="tiny" icon={plus} id="ob-add-sub" onClick={() => setModal('sub')}>Add sub-category</ActionLink>} />
              ))}
            </div>
            {/* 401:4464 / 402:4539 (desktop): "+ Add category" Tiny Secondary button, always there (the modal says when a
                category is already on the board); phones (719:18723): an Action link. */}
            {mobile ? <div><ActionLink icon={plus} id="ob-add-cat" onClick={() => setModal('category')}>Add category</ActionLink></div>
              : <Button variant="secondary" size="tiny" icon={plus} id="ob-add-cat" onClick={() => setModal('category')}>Add category</Button>}
          </div>
        </div>
        <div className="ob-col ob-col-types">
          <div className="ob-col-head"><h3 className="ob-col-title">Type</h3>{selTypes.length > 0 && <span className="ob-col-aside">Budget</span>}</div>
          <div className="ob-col-content">
            {selTypes.length === 0 && <p className="ob-empty">{sel === 'expense' && !subsOf('expense').length ? 'Add a sub-category first, like Fixed or Variable.' : 'Add your first type.'}</p>}
            {/* 401:4464 (Oct 4): Sub-category (Heading 16/20), then its groups indented 16: the group name (14/14) over
                its types (breackdown rows, 24 high). Sub-categories 24 apart. Types without a sub-category come first,
                without a title; a category without sub-categories simply lists its types. */}
            {(() => {
              const named = subsOf(sel);
              const row = (t) => <TypeRow key={(t.group || '') + (t.category || '') + t.item} t={t} onBudget={(v) => patchType(t, (x) => ({ ...x, budget: v }))} onRemove={() => removeType(t)} />;
              const byCat = (list) => {
                if (!hasGroups(sel)) return <div className="ob-types">{list.map(row)}</div>;
                const cats = [...new Set(list.map((t) => t.category || ''))];
                return cats.map((c) => (
                  <div className="ob-type-cat" key={c || '-'} data-category={c}>
                    {c && <h5 className="ob-type-cat-title">{c}</h5>}
                    <div className="ob-types">{list.filter((t) => (t.category || '') === c).map(row)}</div>
                  </div>
                ));
              };
              const loose = selTypes.filter((t) => !t.group || !named.includes(t.group));
              return (
                <>
                  {loose.length > 0 && (named.length ? <div className="ob-type-group ob-type-loose"><div className="ob-type-list">{byCat(loose)}</div></div> : byCat(loose))}
                  {named.filter((g) => selTypes.some((t) => t.group === g)).map((g) => (
                    <div className="ob-type-group" key={g}>
                      <h4 className="ob-type-group-title">{g}</h4>
                      <div className="ob-type-list">{byCat(selTypes.filter((t) => t.group === g))}</div>
                    </div>
                  ))}
                </>
              );
            })()}
            {mobile ? <div><ActionLink icon={plus} id="ob-add-type" disabled={sel === 'expense' && !subsOf('expense').length} onClick={() => setModal('type')}>Add type</ActionLink></div> : <Button variant="secondary" size="tiny" icon={plus} id="ob-add-type" disabled={sel === 'expense' && !subsOf('expense').length} onClick={() => setModal('type')}>Add Type</Button>}
          </div>
        </div>
        <div className="ob-col ob-col-summary">
          <h3 className="ob-col-title">Summary</h3>
          <div className="ob-summary">
            <div className="ob-summary-content">
              <div className="ob-from">
                <span className="fld-label">Start tracking from</span>
                <div className="ob-from-row">
                  <Dropdown id="ob-year" size="tiny" emptyOption={false} value={year} onChange={(v) => { setYear(v); if (Number(v) === nowYear && Number(month) > new Date().getMonth()) setMonth(String(new Date().getMonth())); }} options={years.map((y) => ({ value: y, label: y }))} ariaLabel="Year" />
                  <Dropdown id="ob-month" size="tiny" emptyOption={false} value={month} onChange={setMonth} options={months} ariaLabel="Month" />
                </div>
              </div>
              <Divider />
              {board.types.length === 0
                ? <p className="ob-summary-empty">Nothing added yet.</p>
                : (
                  <div className="ob-summary-list">
                    {board.kinds.map((k) => (
                      <div key={k} className="ob-sum-cat">
                        <div className="ob-sum-row"><span className="ob-sum-name">{label(k)}</span><span className="ob-sum-count">{typesOf(k).length} type{typesOf(k).length === 1 ? '' : 's'}</span></div>
                        {subsOf(k).map((g) => { const n = typesOf(k).filter((t) => t.group === g).length; return <div key={g} className="ob-sum-row ob-sum-sub"><span>{g}</span><span className="ob-sum-count">{n} item{n === 1 ? '' : 's'}</span></div>; })}
                      </div>
                    ))}
                  </div>
                )}
            </div>
            <div className="ob-summary-cta">
              <p className="ob-summary-note">You can rename or add categories later.</p>
              {error && <p className="ob-error" role="alert">{error}</p>}
              <Button id="ob-start" className="ob-full" disabled={busy || board.types.length === 0} onClick={() => onStart(board, { year, month: Number(month) })}>Start tracking</Button>
            </div>
          </div>
        </div>
      </div>
      {/* Oct 4: any category and sub-category name; built-in categories keep their order, custom ones follow. */}
      <CategoryModal open={modal === 'category'} existing={board.kinds} names={board.names} onClose={() => setModal(null)}
        onSave={({ kind, name, groups }) => {
          setBoard((b) => {
            const builtins = KINDS.map((k) => k.value).filter((v) => b.kinds.includes(v) || v === kind);
            const customs = [...b.kinds.filter(isCustomType), ...(isCustomType(kind) ? [kind] : [])];
            const subs = { ...b.subs, [kind]: [...new Set([...(b.subs[kind] || []), ...groups])] };
            return { ...b, kinds: [...builtins, ...customs], names: isCustomType(kind) ? { ...b.names, [kind]: name } : b.names, subs };
          });
          setSel(kind); setModal(null);
        }} />
      <SubCategoryModal open={modal === 'sub'} kind={sel} kindName={label(sel)} existing={subsOf(sel)} onClose={() => setModal(null)}
        onSave={({ groups }) => { setBoard((b) => ({ ...b, subs: { ...b.subs, [sel]: [...(b.subs[sel] || []), ...groups] } })); setModal(null); }} />
      <TypeModal open={modal === 'type'} kind={sel} kindName={label(sel)} groups={subsOf(sel)} groupsOf={groupsOf} onClose={() => setModal(null)}
        onSave={(t) => { addTypes(t); setModal(null); }} />
      {confirmModal}
    </section>
  );
}

export default function OnboardingApp() {
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [step, setStep] = useState('tour');
  const [card, setCard] = useState(0);
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // /welcome?preview=1: walk the whole flow on any account without saving anything (for testing the design).
  const preview = typeof window !== 'undefined' && new URLSearchParams(location.search).get('preview') === '1';
  const doneRef = useRef(false);
  const setDone = (v) => { doneRef.current = v; };

  useEffect(() => {
    getMe().then((m) => {
      if (m.status === 'pending') { location.href = '/pending'; return; }
      if (m.status === 'blocked') { location.href = '/blocked'; return; }
      setMe(m);
      setName(String(m.name || '').trim().split(/\s+/)[0] || '');
    }).catch(() => {});
    // An account that already has years (or finished this once) goes to its dashboard.
    const offY = db.collection('years').onSnapshot((snap) => { if (snap.docs.length && !doneRef.current && !preview) leavePage('/'); });
    const offS = db.collection('settings').onSnapshot((snap) => {
      const p = snap.docs.find((d) => d.id === 'profile'); if (p && p.data().firstName) setName(p.data().firstName);
    });
    return () => { offY(); offS(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = step === 'tour' ? (card + 1) / (TOUR.length + 1) : step === 'choose' ? 1 / 3 : 2 / 3;
  const current = step === 'tour' ? 1 : 2;

  const start = async (board, { year, month }) => {
    if (preview) { setStep('welcome'); return; }
    setBusy(true); setError(null); setDone(true);
    try {
      const now = new Date().toISOString();
      await db.collection('years').add({ year, currency: 'EUR', createdAt: now, taxonomy: taxonomyOfBoard(board) });
      for (const t of board.types) {
        const amount = Math.round((t.budget || 0) * 100) / 100;
        if (!(amount > 0)) continue;
        const group = t.group || null, category = t.category || null;
        await db.collection('budgets').add({ year, type: t.type, group, category, item: t.item, amount, createdAt: now });
        await db.doc('budgetDefaults/' + budgetDefaultDocId(t.type, group, category, t.item)).set({ type: t.type, group, category, item: t.item, amount, updatedAt: now });
      }
      await db.doc('settings/onboarding').set({ done: true, startYear: year, startMonth: month, template: mode, at: now });
      setStep('welcome');
    } catch (e) {
      setDone(false);
      setError('Could not save your board: ' + (e && e.message ? e.message : 'unknown error'));
    } finally { setBusy(false); }
  };

  const showSteps = step !== 'welcome';
  return (
    <main className={'ob-page' + (step === 'setup' || step === 'welcome' ? ' is-wide' : step === 'choose' ? ' is-mid' : '')}>
      {me && (
        <div className="ob-content">
          <Header name={name} />
          {showSteps && <StepProgress steps={STEPS.map((label) => ({ label, progress }))} current={current} />}
          {step === 'tour' && <Tour card={card} setCard={setCard} onDone={() => setStep('choose')} />}
          {step === 'choose' && <Choose onPick={(m) => { setMode(m); setStep('setup'); }} />}
          {(step === 'setup' || step === 'welcome') && mode && <Setup mode={mode} onStart={start} busy={busy} error={error} />}
        </div>
      )}
      <Modal open={step === 'welcome'} id="ob-welcome" illustration={illustrations.success} illustrationWidth={160} onClose={() => leavePage('/')}
        title={`You're all set${name ? `, ${name}` : ''}!`} description="Your board is ready. Start tracking your finances and hitting your goals."
        primary={{ label: 'Go to your board', onClick: () => leavePage('/'), id: 'ob-go' }} />
    </main>
  );
}
