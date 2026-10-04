'use client';
import { useEffect, useRef, useState } from 'react';
import { ActionLink, Button, Dropdown, InfoTooltip, Input, MenuList, PanelHeader, RoundButton, useDismiss, useMobile } from '../ui/index.js';
import { KINDS, SubCategoryModal, TypeModal } from './TaxonomyModals.jsx';
import { Icon } from '../ui/Icon.jsx';
import { actions, edit, euro, plus, trash, x } from '../ui/icons.js';
import { EXP_GROUPS, MONTH_NAMES, fmtNum, parseAmount } from './model.js';

const GROUP_TABS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
const COMBOS = [{ type: 'income', group: null, label: 'Income' }, { type: 'investment', group: null, label: 'Save/Invest' }, ...EXP_GROUPS.map((g) => ({ type: 'expense', group: g, label: g }))];
let seq = 0;

// Panel - Year budget (Cost-tracker 232:5852).
// Starting budget ("{year} / Starting budget", `pending`): proposes a monthly figure per item from the trailing 12 months;
//   "Create year" writes the year, one budget doc per item, and remembers edited figures as future suggestions.
// Editing budget ("{Mon} {year} / Editing budget", `month` = { yearIdx, monthIdx }): the month's items with the figures
//   it shows now; "Save" stores them as that month's budget.
// `forMonth` marks the Editing-budget instance, so its ids stay its own while it is closed.
export function BudgetPanel({ pending, month, forMonth, model, onClose, onCreate, onSave }) {
  const isMonth = forMonth != null ? !!forMonth : !!month;
  const open = isMonth ? !!month : !!pending;
  const my = isMonth && month ? model.DATA[month.yearIdx] : null;
  const [topTab, setTopTab] = useState('expense');
  const [group, setGroup] = useState('Fixed');
  const [newGroup, setNewGroup] = useState('');
  const newGroupRef = useRef(null);
  const [typeModal, setTypeModal] = useState(false);
  const [typeCat, setTypeCat] = useState('');
  const [subModal, setSubModal] = useState(false);
  const mobile = useMobile();
  const [sections, setSections] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // Every section is built once per opening, so an edit in one survives switching tabs.
  useEffect(() => {
    if (!open) return;
    setTopTab('expense'); setGroup('Fixed'); setNewGroup(''); setStatus(null);
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
  const rowProps = { onValue: setValue, onRemove: removeRow, onEditing: setEditing, mobile };
  const addItem = (i, it) => patchSection(i, (x) => {
    const r = { key: ++seq, type: x.type, group: x.group, ...it, computed: 0, isCustomized: false, value: fmtNum(it.amount || 0), added: true };
    if (x.type !== 'expense') return { ...x, adding: false, empty: false, pre: [...x.pre, r] };
    const bi = x.blocks.findIndex((b) => b.category === it.category);
    const blocks = bi >= 0 ? x.blocks.map((b, k) => (k === bi ? { ...b, rows: [...b.rows, r] } : b)) : [...x.blocks, { category: it.category, rows: [r] }];
    return { ...x, adding: false, empty: false, blocks };
  });
  const allRows = () => sections.flatMap((s) => [...s.pre, ...s.rows, ...s.blocks.flatMap((b) => b.rows)]);
  // Groups (232:5853, Oct 3): "Create new group" adds an empty group to the shown sub-category; each group's menu renames
  // or deletes it (its types and their figures go with it). An empty group is not saved: only types carry a budget.
  const curIdx = () => sections.findIndex((x) => x.type === 'expense' && x.group === group);
  const createGroup = () => {
    const name = newGroup.trim();
    if (!name) { if (newGroupRef.current) newGroupRef.current.focus(); return; }
    const i = curIdx();
    patchSection(i, (x) => (x.blocks.some((b) => b.category.toLowerCase() === name.toLowerCase()) ? x : { ...x, empty: false, blocks: [...x.blocks, { category: name, rows: [] }] }));
    setNewGroup('');
  };
  const renameGroup = (from, to) => {
    const name = (to || '').trim();
    patchSection(curIdx(), (x) => (!name || x.blocks.some((b) => b.category !== from && b.category.toLowerCase() === name.toLowerCase()) ? x
      : { ...x, blocks: x.blocks.map((b) => (b.category === from ? { ...b, category: name, rows: b.rows.map((r) => ({ ...r, category: name })) } : b)) }));
  };
  const deleteGroup = (cat) => patchSection(curIdx(), (x) => ({ ...x, blocks: x.blocks.filter((b) => b.category !== cat) }));

  const create = async () => {
    setStatus(null);
    setBusy(true);
    try { await (isMonth ? onSave : onCreate)(allRows()); } catch (err) { setStatus({ err: true, text: 'Could not save: ' + (err && err.message ? err.message : 'unknown error') }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className={'add-panel-backdrop' + (open ? ' open' : '')} id="budget-panel-backdrop" onClick={onClose} />
      <div className={'add-panel budget-panel' + (open ? ' open' : '') + (topTab === 'expense' ? '' : ' is-default')} id={isMonth ? 'month-budget-panel' : 'budget-panel'} role="dialog" aria-modal="true" aria-labelledby={isMonth ? 'month-budget-title' : 'budget-panel-title'}>
        {isMonth
          ? <PanelHeader closeId="month-budget-close" titleId="month-budget-title" title={month ? `${MONTH_NAMES[month.monthIdx]} ${my ? my.year : ''} / Editing budget` : 'Editing budget'} hintId="month-budget-hint"
              hint="Need to make a change? Tweak your planned income and expenses to ensure your budget matches your goals for the month." onClose={onClose} />
          : <PanelHeader closeId="budget-close-btn" titleId="budget-panel-title" title={pending ? `${pending.label} / Starting budget` : 'Starting budget'} hintId="budget-panel-hint"
              hint={`Your starting budget is based on your past 12 months and will be applied to every month in ${pending ? pending.label : 'the new year'}. Any adjustments you make here will automatically become your default for future years.`} onClose={onClose} />}
        <div className="add-panel-content">
          {/* 232:5853 (Oct 2): Category | Sub-category, Group (Optional), "+ Add type"; then the types by group. */}
          <div className="add-grid budget-filters">
            <div className={'fld' + (topTab === 'expense' ? '' : ' budget-kind-only')}>
              <label className="fld-label" htmlFor={(isMonth ? 'month-budget' : 'budget') + '-kind-trigger'}>Category</label>
              <Dropdown id={(isMonth ? 'month-budget' : 'budget') + '-kind'} size="md" emptyOption={false} value={topTab} onChange={(v) => { setTopTab(v); setNewGroup(''); }} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
            </div>
            <div className="fld" id={isMonth ? 'month-budget-group-field' : 'budget-group-field'} hidden={topTab !== 'expense'}>
              <label className="fld-label" htmlFor={(isMonth ? 'month-budget' : 'budget') + '-sub-trigger'}>Sub-category</label>
              <Dropdown id={(isMonth ? 'month-budget' : 'budget') + '-sub'} size="md" emptyOption={false} value={group} onChange={(v) => { setGroup(v); setNewGroup(''); }} options={GROUP_TABS} />
            </div>
            {/* 232:5853 (Oct 3): "Create group (Optional)" input, then "+ Create new group" (Small; Medium on phones). */}
            {topTab === 'expense' && (
              <div className="fld span-2">
                <label className="fld-label" htmlFor={(isMonth ? 'month-budget' : 'budget') + '-new-group'}>Create group (Optional)</label>
                <Input id={(isMonth ? 'month-budget' : 'budget') + '-new-group'} ref={newGroupRef} value={newGroup} placeholder="e.g., Utilities, Transportation, Health"
                  onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createGroup(); } }} />
              </div>
            )}
            {/* 232:5852 (Oct 3): Income and Save/Invest show "+ Add sub-category" and an Info tooltip beside the Category;
                their "+ Add type" sits under the list. */}
            {topTab !== 'expense' && (
              <div className="budget-sub-cta">
                <ActionLink icon={plus} id={(isMonth ? 'month-budget' : 'budget') + '-add-sub'} onClick={() => setSubModal(true)}>Add sub-category</ActionLink>
                <InfoTooltip text="Sub-categories split a category into groups you track separately." />
              </div>
            )}
            {topTab === 'expense' && <div className="span-2"><ActionLink size={mobile ? 'medium' : undefined} icon={plus} id={(isMonth ? 'month-budget' : 'budget') + '-create-group'} onClick={createGroup}>Create new group</ActionLink></div>}
          </div>
          <SubCategoryModal open={subModal} kind={topTab} id={(isMonth ? 'month-budget' : 'budget') + '-sub-modal'} onClose={() => setSubModal(false)} onSave={() => setSubModal(false)} />
          <TypeModal open={typeModal} kind={topTab} group={topTab === 'expense' ? group : undefined} category={topTab === 'expense' ? typeCat : undefined} id={(isMonth ? 'month-budget' : 'budget') + '-type-modal'}
            groupsOf={() => (sections.find((x) => x.type === 'expense' && x.group === group) || { blocks: [] }).blocks.map((bk) => bk.category)}
            onClose={() => setTypeModal(false)}
            onSave={(t) => { const i = sections.findIndex((x) => x.type === topTab && (topTab !== 'expense' || x.group === group)); t.items.forEach((item) => addItem(i, { category: t.category, item, amount: 0 })); setTypeModal(false); }} />
          <div id={isMonth ? 'month-budget-sections' : 'budget-sections'} className="budget-sections">
            {sections.map((s, i) => (
              <div key={s.type + (s.group || '')} className="budget-type-section" data-type={s.type} data-group={s.group || ''}
                hidden={!(s.type === topTab && (topTab !== 'expense' || s.group === group))}>
                {/* 232:5852 (Sept 28): each group is its title with a 24px + Round button (secondary) that adds an item to it;
                    groups are 16 apart with a Divider between them. An empty section keeps the "+ New" link (the frames draw none). */}
                {s.type !== 'expense' && !s.empty && (
                  <div className="budget-group">
                    <div className="budget-items">{[...s.pre, ...s.rows].map((r) => <BudgetRow key={r.key} r={r} {...rowProps} />)}</div>
                  </div>
                )}
                {s.type !== 'expense' && <div><ActionLink size={mobile ? 'medium' : undefined} icon={plus} id={(isMonth ? 'month-budget' : 'budget') + '-add-type' + (s.type === 'income' ? '' : '-' + s.type)} onClick={() => { setTypeCat(''); setTypeModal(true); }}>Add type</ActionLink></div>}
                {s.empty && <div className="budget-empty">{isMonth ? 'Nothing planned here for this month. Use "+ Add type" above to add one.' : 'No history for this yet. Use "+ Add type" above, or create the year and add entries as they come in.'}</div>}
                {s.blocks.map((b, bi) => (
                  <BlockFrag key={b.category} divider={bi > 0}>
                    <div className="budget-group" data-category={b.category}>
                      <GroupHeader title={b.category} mobile={mobile} onAdd={() => { setTypeCat(b.category); setTypeModal(true); }} onRename={(to) => renameGroup(b.category, to)} onDelete={() => deleteGroup(b.category)} />
                      {b.rows.length
                        ? <div className="budget-items">{b.rows.map((r) => <BudgetRow key={r.key} r={r} {...rowProps} />)}</div>
                        : <div className="budget-items is-empty"><span className="budget-group-empty">No types added yet.</span></div>}
                      {/* Each group's "+ Add type" (232:5853, desktop). Phones (415:16066 / 656:10116, Oct 3): the Micro Secondary
                          "+" beside the group name instead; both open the Add type modal with the group picked. */}
                      {!mobile && <div><ActionLink icon={plus} className="budget-group-add" onClick={() => { setTypeCat(b.category); setTypeModal(true); }}>Add type</ActionLink></div>}
                    </div>
                  </BlockFrag>
                ))}
              </div>
            ))}
          </div>
        </div>
 <div className="add-actions">
          {/* 232:5851 / 415:16066 (Oct 3): Cancel (Tertiary) then Save (Primary, no icon), right-aligned 16 apart; phones:
              Save over Cancel, full width, 8 apart. */}
          <span className={'add-status' + (status && status.err ? ' err' : '')} id={isMonth ? 'month-budget-status' : 'budget-status'}>{status ? status.text : ''}</span>
          <Button variant="tertiary" className="budget-cancel" id={isMonth ? 'month-budget-cancel' : 'budget-cancel-btn'} onClick={onClose}>Cancel</Button>
          <Button className="budget-save" id={isMonth ? 'month-budget-save' : 'budget-create-btn'} disabled={busy} onClick={create}>{isMonth ? 'Save changes' : `Save ${pending ? pending.label : ''}`.trim()}</Button>
        </div>
      </div>
    </>
  );
}
const BlockFrag = ({ divider, children }) => <>{divider && <hr className="ds-divider budget-divider" />}{children}</>;
// A group's header (232:5853): its name (Heading/Large; Heading/Medium on phones) and a Micro Tertiary round button with
// the Actions icon, 8 apart; the menu (Dropdown-list, Drop-actions) holds "Change group name" and "Delete group".
// Renaming turns the name into a Tiny input: Enter or leaving it saves, Escape keeps the old name.
function GroupHeader({ title, onRename, onDelete, onAdd, mobile }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef(null);
  const input = useRef(null);
  useDismiss(open, ref, () => setOpen(false));
  useEffect(() => { if (renaming && input.current) { input.current.focus(); input.current.select(); } }, [renaming]);
  const done = (v) => { setRenaming(false); if (v != null) onRename(v); };
  return (
    <div className="budget-group-head">
      {renaming
        ? <label className="bd-input budget-group-rename"><input ref={input} type="text" defaultValue={title} aria-label={`New name for ${title}`}
            onBlur={(e) => done(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(e.currentTarget.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } }} /></label>
        : <div className="budget-group-title"><div className="budget-cat-title">{title}</div>
            {mobile && <RoundButton icon={plus} size="micro" variant="secondary" className="budget-group-plus" label={`Add a type to ${title}`} onClick={onAdd} />}</div>}
      <span className="br-actions" ref={ref}>
        <RoundButton icon={actions} size="micro" className="br-more budget-group-more" label={`Actions for ${title}`} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)} />
        {open && <MenuList className="br-menu group-menu" items={[
          { key: 'rename', label: 'Change group name', icon: edit, className: 'group-rename', onSelect: () => { setOpen(false); setRenaming(true); } },
          { key: 'delete', label: 'Delete group', icon: trash, className: 'group-delete', onSelect: () => { setOpen(false); onDelete(); } },
        ]} />}
      </span>
    </div>
  );
}

// The row's Action (232:5853): a Micro Tertiary round button with the Actions icon; its menu holds "Remove".
function RowActions({ item, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));
  return (
    <span className="br-actions" ref={ref}>
      <RoundButton icon={actions} size="micro" className="br-more" label={`Actions for ${item}`} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)} />
      {open && <MenuList className="br-menu" items={[{ key: 'remove', label: 'Remove', icon: trash, className: 'br-remove', onSelect: () => { setOpen(false); onRemove(); } }]} />}
    </span>
  );
}

// A budget row: breackdown-row (DS 124:3667), Entry off, Action on. Default: name, € and the figure as an Action link;
// Editing (the figure clicked): an Input, Size=Tiny, and 24px right padding. The Action is a Tiny Tertiary Round button
// with an X in action/destructive that removes the row.
function BudgetRow({ r, onValue, onRemove, onEditing, mobile }) {
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
      {/* Phones (415:16066): a Micro Tertiary round button with a 12px X removes the row; desktop keeps the Actions menu. */}
      {!r.editing && (mobile
        ? <RoundButton icon={x} size="micro" className="br-more br-x" label={`Remove ${r.item}`} onClick={() => onRemove(r.key)} />
        : <RowActions item={r.item} onRemove={() => onRemove(r.key)} />)}
    </div>
  );
}

// Month-budget rows grouped like buildBudgetSuggestions() returns them.
function monthSections(rows) {
  return COMBOS.map(({ type, group }) => ({ type, group, items: rows.filter((r) => r.type === type && (type !== 'expense' || r.group === group)).map((r) => ({ ...r, suggested: r.amount, computed: r.amount })) }));
}
