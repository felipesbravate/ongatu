'use client';
// Onboarding and setup (Ongatu 397:4392, Oct 2). After "Create account" and the code, a new account lands here:
//   02 Tour (3 cards, 399:4424 / 399:4485 / 564:7633) -> 03 Choose how to start (400:4509) -> 03a Set up your board,
//   from the starter template (401:4464) or empty (402:4539) -> 04 Welcome modal (404:4571) -> the dashboard.
// "Start tracking" writes the first year (its taxonomy = the board), a budget per type that has one, and
// settings/onboarding, so the dashboard never sends this account here again.
import { useEffect, useRef, useState } from 'react';
import '../ui/okara.css';
import { ActionLink, Button, CategorySelector, Divider, Dropdown, Logo, Modal, illustrations, useMobile } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { arrowStraightRight, edit, euro, plus, trash } from '../ui/icons.js';
import { Illustration } from '../ui/Modal.jsx';
import { Pager, StepProgress, Tag } from '../ui/Selectors.jsx';
import { db, getMe, leavePage } from '../tracker/api.js';
import { CATS, EXP_GROUPS, MONTH_NAMES, addGroupToTaxonomy, addSubToTaxonomy, addTypeToTaxonomy, budgetDefaultDocId, fmtNum, hasGroups, parseAmount } from '../tracker/model.js';
import { Combo, RenameModal, TypeModal, kindLabel } from '../tracker/TaxonomyModals.jsx';
import { BlockFrag, BudgetRow, GroupHeader } from '../tracker/BudgetPanel.jsx';
import { useConfirm } from '../tracker/ConfirmModal.jsx';

const STEPS = ['Account', 'Tour', 'Setup'];
const nowYear = new Date().getFullYear();

// The starter template: the generic taxonomy every new year falls back to (model.CATS).
function templateBoard() {
  const types = [];
  CATS.incomes.forEach((item) => types.push({ type: 'income', group: null, category: null, item, budget: 0 }));
  CATS.investments.forEach((item) => types.push({ type: 'investment', group: null, category: null, item, budget: 0 }));
  Object.entries(CATS.expenses).forEach(([group, cats]) => Object.entries(cats).forEach(([category, items]) => items.forEach((item) => types.push({ type: 'expense', group, category, item, budget: 0 }))));
  return { kinds: KINDS3.slice(), subs: { expense: EXP_GROUPS.slice() }, groups: {}, types };
}
// Oct 5 (Felipe): Income, Savings and investments and Expenses are the only categories, always there, never deleted or
// renamed. Sub-categories and groups are the user's: added, renamed and deleted freely.
// board = { kinds: [type], subs: { [type]: [sub-category] }, groups: { 'expense|<sub>': [empty groups] },
//           types: [{ type, group (sub-category), category (group), item, budget }] }
const KINDS3 = ['income', 'investment', 'expense'];
const emptyBoard = () => ({ kinds: KINDS3.slice(), subs: {}, groups: {}, types: [] });

export function taxonomyOfBoard(board) {
  const tx = { incomes: [], investments: [], expenses: {} };
  board.kinds.forEach((k) => (board.subs[k] || []).forEach((g) => addSubToTaxonomy(tx, k, g)));
  Object.entries(board.groups || {}).forEach(([key, names]) => { const [k, sub] = key.split('|'); if (k === 'expense') names.forEach((g) => addGroupToTaxonomy(tx, sub, g)); });
  board.types.forEach((t) => addTypeToTaxonomy(tx, t));
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
  { title: 'Built for how your brain works', text: 'Forget rigid budgeting templates. Create your own sub-categories, groups and types that match exactly how you think about your money, from daily coffee runs to long-term investments.' },
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
// Oct 6: changing card slides the next one in from the right (and the current one out to the left) inside the card;
// going back slides the other way. Reduced motion: no slide.
function Tour({ card, setCard, onDone }) {
  const last = useRef(card);
  const [out, setOut] = useState(null); // { i, dir } — the card sliding out
  useEffect(() => {
    if (last.current === card) return undefined;
    setOut({ i: last.current, dir: card > last.current ? 'next' : 'prev' });
    last.current = card;
    const t = setTimeout(() => setOut(null), 420);
    return () => clearTimeout(t);
  }, [card]);
  const slide = (i, cls, current) => (
    <div className={'ob-slide ' + cls} key={i + cls} aria-hidden={current ? undefined : 'true'}>
      <div className="ob-art"><TourArt i={i} /></div>
      <div className="ob-tour-text">
        <h2 className="ob-card-title" id={current ? 'ob-tour-title' : undefined}>{TOUR[i].title}</h2>
        <p className="ob-card-text">{TOUR[i].text}</p>
      </div>
    </div>
  );
  return (
    <section className="ob-card ob-tour" aria-labelledby="ob-tour-title">
      <div className="ob-tour-content">
        <div className="ob-tour-top">
          <ActionLink id="ob-skip" className="ob-skip" onClick={onDone}>Skip</ActionLink>
          <div className="ob-slides">
            {out && slide(out.i, 'is-out is-' + out.dir, false)}
            {slide(card, out ? 'is-in is-' + out.dir : 'is-still', true)}
          </div>
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
          <span className="ob-option-text"><span className="ob-option-title">Build your own board</span><span className="ob-option-desc">Start from Income, Savings and Expenses, and add your own types one at a time.</span></span>
          <span className="ds-action-link medium ob-option-link">Organise your own<Icon icon={arrowStraightRight} size={12} /></span>
        </button>
      </div>
    </section>
  );
}

// ---------- 03a Set up your board ----------
// 401:4464 (starter template) / 749:10871 (start empty), Oct 6: Categories = the three fixed categories (categories
// 827:2047); under them Sub-category and Group (Optional) fields; then the shown sub-category's groups (Heading/Large
// with its Actions menu: Rename group / Delete group), each with its types (breackdown rows: name, € budget, Actions)
// and "+ Add type", Dividers between groups; "No types added yet." for an empty group. Nothing on the board yet: the
// Empty state illustration with "No income added yet". Summary on the right (280).
const CAT_INFO = {
  income: { cta: 'Add income', title: 'Income', description: 'Money entering your accounts from salaries, freelance work, or other revenue streams.', empty: 'No income added yet', emptyText: 'Define a specific income to track, and optionally organize it into sub-categories.' },
  investment: { cta: 'Add savings/investment', title: 'Savings and investments', description: 'Money set aside for future goals, emergencies, or assets meant to build wealth.', empty: 'No savings or investments added yet', emptyText: 'Define what you put aside, and optionally organize it into sub-categories.' },
  expense: { cta: 'Add expense', title: 'Expenses', description: 'Money leaving your accounts to pay for living costs, bills, and everyday purchases.', empty: 'No expenses added yet', emptyText: 'Define a specific expense to track, and organize it into sub-categories and groups.' },
};
const NO_SUB = 'No sub-category';
const ALL_GROUPS = 'All groups';
const gkey = (k, sub) => k + '|' + (sub || '');

// A combobox that picks (or creates, by typing) one value; the text goes back to the picked value when left.
function PickField({ id, label, value, options, placeholder, onPick, listLabel }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  return (
    <div className="fld">
      <label className="fld-label" htmlFor={id}>{label}</label>
      <Combo id={id} value={text} onChange={setText} options={options} placeholder={placeholder} listLabel={listLabel}
        onPick={(v, created) => { const name = String(v || '').trim(); if (name) onPick(name, created); else setText(value || ''); }}
        onBlur={() => setTimeout(() => setText(value || ''), 150)} />
    </div>
  );
}

function Setup({ mode, onStart, busy, error }) {
  const [board, setBoard] = useState(() => (mode === 'template' ? templateBoard() : emptyBoard()));
  const [sel, setSel] = useState('income');
  const [subSel, setSubSel] = useState(() => ({ income: '', investment: '', expense: mode === 'template' ? EXP_GROUPS[0] : '' }));
  const [groupSel, setGroupSel] = useState(''); // '' = every group of the shown sub-category
  const [modal, setModal] = useState(null); // { kind: 'type', category } | null
  const [renaming, setRenaming] = useState(null); // { kind, from } — a sub-category
  const [confirmModal, confirm] = useConfirm();
  const mobile = useMobile();
  const [year, setYear] = useState(String(nowYear));
  const [month, setMonth] = useState(String(new Date().getMonth()));

  const label = (k) => kindLabel(k);
  const subsOf = (k) => board.subs[k] || [];
  const typesOf = (k) => board.types.filter((t) => t.type === k);
  const sub = subsOf(sel).includes(subSel[sel]) ? subSel[sel] : (sel === 'expense' ? (subsOf('expense')[0] || '') : '');
  const grouped = hasGroups(sel);
  const viewTypes = board.types.filter((t) => t.type === sel && (t.group || '') === (sub || ''));
  const declared = board.groups[gkey(sel, sub)] || [];
  const groupNames = [...new Set([...declared, ...viewTypes.map((t) => t.category || '').filter(Boolean)])];
  const shownGroups = grouped ? (groupSel && groupNames.includes(groupSel) ? [groupSel] : groupNames) : [];
  const loose = grouped ? viewTypes.filter((t) => !t.category) : viewTypes;
  const typeCount = (n) => `${n} type${n === 1 ? '' : 's'}`;

  const pickKind = (k) => { setSel(k); setGroupSel(''); };
  const pickSub = (name, created) => {
    if (name === NO_SUB && sel !== 'expense') { setSubSel((s) => ({ ...s, [sel]: '' })); setGroupSel(''); return; }
    const existing = subsOf(sel).find((g) => g.toLowerCase() === name.toLowerCase());
    if (!existing && created) setBoard((b) => ({ ...b, subs: { ...b.subs, [sel]: [...(b.subs[sel] || []), name] } }));
    setSubSel((s) => ({ ...s, [sel]: existing || name })); setGroupSel('');
  };
  const pickGroup = (name, created) => {
    if (name === ALL_GROUPS) { setGroupSel(''); return; }
    const existing = groupNames.find((g) => g.toLowerCase() === name.toLowerCase());
    if (!existing && created) setBoard((b) => ({ ...b, groups: { ...b.groups, [gkey(sel, sub)]: [...(b.groups[gkey(sel, sub)] || []), name] } }));
    setGroupSel(existing || name);
  };
  // Oct 5: rename a sub-category while setting up. Nothing is saved yet, so the change is immediate.
  const applyRename = (to) => {
    const r = renaming; setRenaming(null); if (!r) return;
    setBoard((b) => {
      const groups = {}; Object.entries(b.groups).forEach(([k, v]) => { groups[k === gkey(r.kind, r.from) ? gkey(r.kind, to) : k] = v; });
      return { ...b, groups, subs: { ...b.subs, [r.kind]: (b.subs[r.kind] || []).map((g) => (g === r.from ? to : g)) }, types: b.types.map((t) => (t.type === r.kind && t.group === r.from ? { ...t, group: to } : t)) };
    });
    setSubSel((s) => ({ ...s, [r.kind]: to }));
  };
  const deleteSub = (k, g) => {
    const n = board.types.filter((t) => t.type === k && t.group === g).length;
    confirm({
      title: `Are you sure you want to delete ${g}?`,
      description: n ? `This removes ${g} and its ${typeCount(n)} from your board. You can add it again later.` : 'You can add it again later.',
      onConfirm: async () => {
        setBoard((b) => { const groups = { ...b.groups }; delete groups[gkey(k, g)]; return { ...b, groups, subs: { ...b.subs, [k]: (b.subs[k] || []).filter((x) => x !== g) }, types: b.types.filter((t) => !(t.type === k && t.group === g)) }; });
        setSubSel((s) => ({ ...s, [k]: '' })); setGroupSel('');
      },
    });
  };
  const renameGroup = (from, to) => {
    const name = String(to || '').trim();
    if (!name || name === from || groupNames.some((g) => g !== from && g.toLowerCase() === name.toLowerCase())) return;
    const key = gkey(sel, sub);
    setBoard((b) => ({ ...b, groups: { ...b.groups, [key]: (b.groups[key] || []).map((g) => (g === from ? name : g)) },
      types: b.types.map((t) => (t.type === sel && (t.group || '') === (sub || '') && t.category === from ? { ...t, category: name } : t)) }));
    if (groupSel === from) setGroupSel(name);
  };
  const deleteGroup = (c) => {
    const n = viewTypes.filter((t) => t.category === c).length;
    confirm({
      title: `Are you sure you want to delete ${c}?`,
      description: n ? `This removes the group and its ${typeCount(n)} from your board.` : 'This removes the group from your board.',
      onConfirm: async () => {
        const key = gkey(sel, sub);
        setBoard((b) => ({ ...b, groups: { ...b.groups, [key]: (b.groups[key] || []).filter((g) => g !== c) },
          types: b.types.filter((t) => !(t.type === sel && (t.group || '') === (sub || '') && t.category === c)) }));
        if (groupSel === c) setGroupSel('');
      },
    });
  };
  const patchType = (t, fn) => setBoard((b) => ({ ...b, types: b.types.map((x) => (x === t ? fn(x) : x)) }));
  const removeType = (t) => setBoard((b) => ({ ...b, types: b.types.filter((x) => x !== t) }));
  const addTypes = ({ group, category, items }) => {
    setBoard((b) => {
      const exists = (it) => b.types.some((x) => x.type === sel && x.item.toLowerCase() === it.toLowerCase() && (x.group || null) === (group || null));
      const subs = group && !(b.subs[sel] || []).includes(group) ? { ...b.subs, [sel]: [...(b.subs[sel] || []), group] } : b.subs;
      return { ...b, subs, types: [...b.types, ...items.filter((it) => !exists(it)).map((item) => ({ type: sel, group: group || null, category: category || null, item, budget: 0 }))] };
    });
    if ((group || '') !== (sub || '')) setSubSel((s) => ({ ...s, [sel]: group || '' }));
  };

  // A board type as a budget row (the Editing budget's row, 232:5853): the figure is the monthly budget.
  const [editing, setEditing] = useState(null);
  const rowOf = (t, i) => ({ key: i, item: t.item, value: fmtNum(t.budget), editing: editing === t, type: t.type, group: t.group, category: t.category });
  const rowsFor = (list) => (
    <div className="budget-items">
      {list.map((t, i) => (
        <BudgetRow key={(t.category || '') + '|' + t.item} r={rowOf(t, i)} mobile={mobile}
          onValue={(_, v) => patchType(t, (x) => ({ ...x, budget: parseAmount(v) }))}
          onEditing={(_, on) => setEditing(on ? t : null)} onRemove={() => removeType(t)} />
      ))}
    </div>
  );
  const addTypeLink = (category, cls, id) => (
    <div><ActionLink size={mobile ? 'medium' : undefined} icon={plus} className={cls} id={id} onClick={() => setModal({ kind: 'type', category: category || '' })}>Add type</ActionLink></div>
  );
  const isEmpty = !viewTypes.length && !shownGroups.length;
  const needSub = sel === 'expense' && !sub;
  const info = CAT_INFO[sel];
  const years = Array.from({ length: 6 }, (_, i) => String(nowYear - i));
  const months = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m, selectedLabel: m.slice(0, 3) })).filter((o) => Number(year) < nowYear || Number(o.value) <= new Date().getMonth());
  const subOptions = [...(sel === 'expense' ? [] : [NO_SUB]), ...subsOf(sel)];

  return (
    <section className="ob-card ob-setup ob-board" aria-labelledby="ob-setup-title">
      <div className="ob-card-head">
        <h2 className="ob-card-title" id="ob-setup-title">Set up your board</h2>
        <p className="ob-card-text">{mode === 'template' ? 'Keep what fits and add your own. Nothing is locked in.' : 'Start with a category, then add your own types. Organize them only if you need to.'}</p>
      </div>
      <div className="ob-setup-cols">
        <div className="ob-col ob-col-board">
          <h3 className="ob-col-title">Categories</h3>
          <div className="ob-board-top">
            <CategorySelector id="ob-cat" value={sel} onChange={pickKind} options={KINDS3.map((k) => ({ value: k, title: CAT_INFO[k].title, description: CAT_INFO[k].description }))} />
            <div className={'ob-board-fields' + (grouped ? '' : ' is-single')}>
              <PickField id="ob-sub" label={sel === 'expense' ? 'Sub-category' : 'Sub-category (Optional)'} value={sub || ''} options={subOptions}
                placeholder="Select sub-category" listLabel="Show the sub-categories" onPick={pickSub} />
              {grouped && (
                <PickField id="ob-group" label="Group (Optional)" value={groupSel} options={[...(groupSel ? [ALL_GROUPS] : []), ...groupNames]}
                  placeholder={groupNames.length ? 'Select or type to create a group' : 'Type to create a group'} listLabel="Show the groups" onPick={pickGroup} />
              )}
            </div>
            {/* Oct 6 (not in the frames): the shown sub-category's Rename and Delete. */}
            {sub && (
              <div className="ob-sel-actions">
                <ActionLink size="tiny" icon={edit} id="ob-rename-sub" onClick={() => setRenaming({ kind: sel, from: sub })}>Rename sub-category</ActionLink>
                <ActionLink size="tiny" icon={trash} id="ob-delete-sub" onClick={() => deleteSub(sel, sub)}>Delete sub-category</ActionLink>
              </div>
            )}
          </div>
          {isEmpty ? (
            <div className="ob-board-empty">
              {illustrations.emptyState && <Illustration art={illustrations.emptyState} width={136} />}
              <div className="ob-board-empty-text">
                <h4>{needSub ? 'Start with a sub-category' : info.empty}</h4>
                <p>{needSub ? 'Type a name in Sub-category above, like Fixed or Variable. Then add your types.' : info.emptyText}</p>
              </div>
              {/* 749:10871 (Oct 6): a Small Primary button with a 16px Plus; the label follows the category. */}
              {!needSub && <Button size="small" icon={plus} id="ob-add-type" className="ob-add-type" onClick={() => setModal({ kind: 'type', category: groupSel || '' })}>{info.cta}</Button>}
            </div>
          ) : (
            <div className="budget-sections ob-board-groups">
              {loose.length > 0 && (
                <div className="budget-group ob-board-loose">
                  {rowsFor(loose)}
                  {addTypeLink('', 'ob-add-type', 'ob-add-type')}
                </div>
              )}
              {shownGroups.map((c, i) => {
                const list = viewTypes.filter((t) => t.category === c);
                return (
                  <BlockFrag key={c} divider={i > 0 || loose.length > 0}>
                    <div className="budget-group" data-category={c}>
                      <GroupHeader title={c} mobile={mobile} renameLabel="Rename group" onAdd={() => setModal({ kind: 'type', category: c })} onRename={(to) => renameGroup(c, to)} onDelete={() => deleteGroup(c)} />
                      {list.length ? rowsFor(list) : <div className="budget-items is-empty"><span className="budget-group-empty">No types added yet.</span></div>}
                      {!mobile && addTypeLink(c, 'budget-group-add')}
                    </div>
                  </BlockFrag>
                );
              })}
            </div>
          )}
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
              <div className="ob-summary-list">
                {board.kinds.map((k) => (
                  <div key={k} className="ob-sum-cat">
                    <div className="ob-sum-row"><span className="ob-sum-name">{label(k)}</span><span className="ob-sum-count">{typeCount(typesOf(k).length)}</span></div>
                    {subsOf(k).map((g) => { const n = typesOf(k).filter((t) => t.group === g).length; return <div key={g} className="ob-sum-row ob-sum-sub"><span>{g}</span><span className="ob-sum-count">{n} item{n === 1 ? '' : 's'}</span></div>; })}
                  </div>
                ))}
              </div>
            </div>
            <div className="ob-summary-cta">
              <p className="ob-summary-note">You can add, rename or delete sub-categories later.</p>
              {error && <p className="ob-error" role="alert">{error}</p>}
              <Button id="ob-start" className="ob-full" disabled={busy || board.types.length === 0} onClick={() => onStart(board, { year, month: Number(month) })}>Start tracking</Button>
            </div>
          </div>
        </div>
      </div>
      <TypeModal open={!!modal} kind={sel} kindName={label(sel)} group={sub || null} category={grouped ? (modal ? modal.category : '') : undefined}
        groups={subsOf(sel)} groupsOf={() => groupNames} onClose={() => setModal(null)}
        onSave={(t) => { addTypes(t); setModal(null); }} />
      <RenameModal open={!!renaming} id="ob-rename-modal" title="Rename sub-category" label="Sub-category" value={renaming ? renaming.from : ''}
        existing={renaming ? subsOf(renaming.kind).filter((n) => n !== renaming.from) : []}
        onClose={() => setRenaming(null)} onSave={applyRename} />
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
