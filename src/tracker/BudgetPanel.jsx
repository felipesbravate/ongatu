'use client';
import { useEffect, useRef, useState } from 'react';
import { ActionLink, Button, FieldGroup, Input, PanelHeader, RoundButton, Segments } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { checkmark, euro, plus, x } from '../ui/icons.js';
import { EXP_GROUPS, MONTH_ABBR, fmtNum, parseAmount } from './model.js';

const TYPES = [{ value: 'income', label: 'Incomes' }, { value: 'investment', label: 'Save/Invest' }, { value: 'expense', label: 'Expenses' }];
const GROUP_TABS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
const COMBOS = [{ type: 'income', group: null, label: 'Income' }, { type: 'investment', group: null, label: 'Save/Invest' }, ...EXP_GROUPS.map((g) => ({ type: 'expense', group: g, label: g }))];
let seq = 0;

// Panel - Year budget (Cost-tracker 232:5852).
// Starting budget ("{year} / Starting budget", `pending`): proposes a monthly figure per item from the trailing 12 months;
//   "Create year" writes the year, one budget doc per item, and remembers edited figures as future suggestions.
// Editing budget ("{Mon} {year} / Editing budget", `month` = { yearIdx, monthIdx }): the month's items with the figures
//   it shows now; "Save" stores them as that month's budget.
export function BudgetPanel({ pending, month, model, onClose, onCreate, onSave }) {
  const isMonth = !!month;
  const open = isMonth ? !!month : !!pending;
  const my = isMonth ? model.DATA[month.yearIdx] : null;
  const [topTab, setTopTab] = useState('expense');
  const [group, setGroup] = useState('Fixed');
  const [sections, setSections] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // Every section is built once per opening, so an edit in one survives switching tabs.
  useEffect(() => {
    if (!open) return;
    setTopTab('expense'); setGroup('Fixed'); setStatus(null);
    const sugg = isMonth ? monthSections(model.monthBudgetRows(my, month.monthIdx)) : model.buildBudgetSuggestions();
    setSections(COMBOS.map(({ type, group: g, label }) => {
      const sec = sugg.find((s) => s.type === type && (type !== 'expense' || s.group === g));
      const row = (it) => ({ key: ++seq, ...it, value: fmtNum(it.suggested != null ? it.suggested : 0), editing: false });
      const items = sec ? sec.items : [];
      const blocks = [];
      if (type === 'expense') {
        const byCat = new Map();
        items.forEach((it) => { const k = it.category || '(uncategorized)'; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(row(it)); });
        [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([category, rows]) => blocks.push({ category, rows }));
      }
      return { type, group: g, label, pre: [], rows: type === 'expense' ? [] : items.map(row), blocks, empty: !items.length, adding: false };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patchSection = (i, fn) => setSections((ss) => ss.map((s, k) => (k === i ? fn(s) : s)));
  const mapRows = (fn) => setSections((ss) => ss.map((s) => ({ ...s, pre: fn(s.pre), rows: fn(s.rows), blocks: s.blocks.map((b) => ({ ...b, rows: fn(b.rows) })) })));
  const setValue = (key, value) => mapRows((rows) => rows.map((r) => (r.key === key ? { ...r, value } : r)));
  const removeRow = (key) => mapRows((rows) => rows.filter((r) => r.key !== key));
  const setEditing = (key, editing) => mapRows((rows) => rows.map((r) => (r.key === key ? { ...r, editing } : r)));
  const rowProps = { onValue: setValue, onRemove: removeRow, onEditing: setEditing };
  const addItem = (i, it) => patchSection(i, (x) => {
    const r = { key: ++seq, type: x.type, group: x.group, ...it, computed: 0, isCustomized: false, value: fmtNum(it.amount) };
    if (x.type !== 'expense') return { ...x, adding: false, empty: false, pre: [...x.pre, r] };
    const bi = x.blocks.findIndex((b) => b.category === it.category);
    const blocks = bi >= 0 ? x.blocks.map((b, k) => (k === bi ? { ...b, rows: [...b.rows, r] } : b)) : [...x.blocks, { category: it.category, rows: [r] }];
    return { ...x, adding: false, empty: false, blocks };
  });
  const allRows = () => sections.flatMap((s) => [...s.pre, ...s.rows, ...s.blocks.flatMap((b) => b.rows)]);

  const create = async () => {
    setStatus(null);
    setBusy(true);
    try { await (isMonth ? onSave : onCreate)(allRows()); } catch (err) { setStatus({ err: true, text: 'Could not save: ' + (err && err.message ? err.message : 'unknown error') }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className={'add-panel-backdrop' + (open ? ' open' : '')} id="budget-panel-backdrop" onClick={onClose} />
      <div className={'add-panel budget-panel' + (open ? ' open' : '')} id={isMonth ? 'month-budget-panel' : 'budget-panel'} role="dialog" aria-modal="true" aria-labelledby={isMonth ? 'month-budget-title' : 'budget-panel-title'}>
        {isMonth
          ? <PanelHeader closeId="month-budget-close" titleId="month-budget-title" title={`${MONTH_ABBR[month.monthIdx]} ${my ? my.year : ''} / Editing budget`} hintId="month-budget-hint"
              hint="Need to make a change? Tweak your planned income and expenses to ensure your budget matches your goals for the month." onClose={onClose} />
          : <PanelHeader closeId="budget-close-btn" titleId="budget-panel-title" title={pending ? `${pending.label} / Starting budget` : 'Starting budget'} hintId="budget-panel-hint"
              hint="Suggested from the trailing 12 months of real history. The same figure is used for every month of the new year. Adjust anything before creating it; an edit here also becomes the default suggestion for future years." onClose={onClose} />}
        <div className="add-panel-content">
          <FieldGroup label="Type">
            <Segments id={isMonth ? 'month-budget-type-seg' : 'budget-type-seg'} options={TYPES} value={topTab} onChange={setTopTab} />
            <div id={isMonth ? 'month-budget-group-field' : 'budget-group-field'} hidden={topTab !== 'expense'}>
              <Segments sub id={isMonth ? 'month-budget-group-seg' : 'budget-group-seg'} aria-label="Expense type" options={GROUP_TABS} value={group} onChange={setGroup} />
            </div>
          </FieldGroup>
          <div id={isMonth ? 'month-budget-sections' : 'budget-sections'} className="budget-sections">
            {sections.map((s, i) => (
              <div key={s.type + (s.group || '')} className="budget-type-section" data-type={s.type} data-group={s.group || ''}
                hidden={!(s.type === topTab && (topTab !== 'expense' || s.group === group))}>
                {/* 232:5852 (Sept 28): each group is its title with a 24px + Round button (secondary) that adds an item to it;
                    groups are 16 apart with a Divider between them. An empty section keeps the "+ New" link (the frames draw none). */}
                {s.type !== 'expense' && !s.empty && (
                  <div className="budget-group">
                    <GroupHeader title={s.label} onAdd={() => patchSection(i, (x) => ({ ...x, adding: '' }))} />
                    {s.adding === '' && <AddItemRow type={s.type} label={s.label} onCancel={() => patchSection(i, (x) => ({ ...x, adding: false }))} onAdd={(it) => addItem(i, it)} />}
                    <div className="budget-items">{[...s.pre, ...s.rows].map((r) => <BudgetRow key={r.key} r={r} {...rowProps} />)}</div>
                  </div>
                )}
                {s.empty && (s.adding !== false
                  ? <AddItemRow type={s.type} label={s.label} onCancel={() => patchSection(i, (x) => ({ ...x, adding: false }))} onAdd={(it) => addItem(i, it)} />
                  : <ActionLink icon={plus} className="budget-add-link" onClick={() => patchSection(i, (x) => ({ ...x, adding: '' }))}><span>{s.type === 'expense' ? `New ${s.label.toLowerCase()} expense` : `New ${s.label}`}</span></ActionLink>)}
                {s.empty && <div className="budget-empty">{isMonth ? 'Nothing planned here for this month — use "+ New" above to add an item.' : 'No historical data yet for this section — use "+ New" above to add an item, or create the year and add entries as they come in.'}</div>}
                {s.blocks.map((b, bi) => (
                  <BlockFrag key={b.category} divider={bi > 0}>
                    <div className="budget-group">
                      <GroupHeader title={b.category} onAdd={() => patchSection(i, (x) => ({ ...x, adding: b.category }))} />
                      {s.adding === b.category && <AddItemRow type={s.type} label={b.category} category={b.category} onCancel={() => patchSection(i, (x) => ({ ...x, adding: false }))} onAdd={(it) => addItem(i, it)} />}
                      <div className="budget-items">{b.rows.map((r) => <BudgetRow key={r.key} r={r} {...rowProps} />)}</div>
                    </div>
                  </BlockFrag>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="add-actions">
          <Button size="small" id={isMonth ? 'month-budget-save' : 'budget-create-btn'} disabled={busy} onClick={create}>{isMonth ? 'Save' : 'Create year'}</Button>
          <Button size="small" variant="tertiary" id={isMonth ? 'month-budget-cancel' : 'budget-cancel-btn'} onClick={onClose}>Cancel</Button>
          <span className={'add-status' + (status && status.err ? ' err' : '')} id={isMonth ? 'month-budget-status' : 'budget-status'}>{status ? status.text : ''}</span>
        </div>
      </div>
    </>
  );
}
const BlockFrag = ({ divider, children }) => <>{divider && <hr className="ds-divider budget-divider" />}{children}</>;
const GroupHeader = ({ title, onAdd }) => (
  <div className="budget-group-head">
    <div className="budget-cat-title">{title}</div>
    <RoundButton icon={plus} size="tiny" variant="secondary" className="budget-group-add" label={`Add an item to ${title}`} onClick={onAdd} />
  </div>
);

// A budget row: breackdown-row (DS 124:3667), Entry off, Action on. Default: name, € and the figure as an Action link;
// Editing (the figure clicked): an Input, Size=Tiny, and 24px right padding. The Action is a Tiny Tertiary Round button
// with an X in action/destructive that removes the row.
function BudgetRow({ r, onValue, onRemove, onEditing }) {
  const input = useRef(null);
  useEffect(() => { if (r.editing && input.current) { input.current.focus(); input.current.select(); } }, [r.editing]);
  const done = (v) => { onValue(r.key, fmtNum(parseAmount(v))); onEditing(r.key, false); };
  return (
    <div className={'bd-row budget-row' + (r.editing ? ' is-editing' : '')} data-type={r.type} data-group={r.group || ''} data-category={r.category || ''} data-item={r.item} data-computed={r.computed || 0}>
      <span className="bd-item-name br-name" title={r.item}>{r.item}</span>
      {r.isCustomized && <span className="br-tag" title="Set from an earlier customization — used as the default suggestion until changed again">●</span>}
      {r.editing
        ? <label className="bd-input br-edit"><Icon icon={euro} size={12} />
            <input ref={input} type="text" inputMode="decimal" className="br-input" aria-label={`Monthly budget for ${r.item}`} defaultValue={r.value}
              onBlur={(e) => done(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(e.currentTarget.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEditing(r.key, false); } }} /></label>
        : <span className="bd-value"><Icon icon={euro} size={16} className="bd-euro" />
            <button type="button" className="bd-amount br-amount" aria-label={`Monthly budget for ${r.item}: ${r.value}. Edit`} onClick={() => onEditing(r.key, true)}>{r.value}</button></span>}
      {!r.editing && <button type="button" className="round-btn small br-remove" aria-label={`Remove ${r.item}`} onClick={() => onRemove(r.key)}><Icon icon={x} size={12} /></button>}
    </div>
  );
}

// Month-budget rows grouped like buildBudgetSuggestions() returns them.
function monthSections(rows) {
  return COMBOS.map(({ type, group }) => ({ type, group, items: rows.filter((r) => r.type === type && (type !== 'expense' || r.group === group)).map((r) => ({ ...r, suggested: r.amount, computed: r.amount })) }));
}

// Inline "+ New {label}" (the Add expense overlay 119:12764, as an inline row).
function AddItemRow({ type, label, category, onAdd, onCancel }) {
  const [cat, setCat] = useState(category || ''); const [name, setName] = useState(''); const [amt, setAmt] = useState('');
  const nameRef = useRef(null);
  const ok = () => {
    const item = name.trim();
    if (!item) { nameRef.current?.focus(); return; }
    onAdd({ category: type === 'expense' ? (cat.trim() || 'Other') : null, item, amount: Math.round(parseAmount(amt) * 100) / 100 });
  };
  return (
    <div className="budget-add-row">
      <div className="budget-add-fields">
        {category == null && <span className="budget-add-label">{label + (type === 'expense' ? ' expense' : '')}</span>}
        {type === 'expense' && category == null && <Input size="tiny" className="budget-add-cat" type="text" placeholder="Category" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} />}
        <Input size="tiny" className="budget-add-name" ref={nameRef} type="text" placeholder="Item name" aria-label="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input size="tiny" className="budget-add-amt" icon={euro} type="text" inputMode="decimal" placeholder="0,00" aria-label="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </div>
      <div className="budget-add-actions">
        <button type="button" className="round-btn tiny primary" aria-label="Add item" onClick={ok}><Icon icon={checkmark} size={12} /></button>
        <button type="button" className="round-btn tiny secondary" aria-label="Cancel" onClick={onCancel}><Icon icon={x} size={12} /></button>
      </div>
    </div>
  );
}
