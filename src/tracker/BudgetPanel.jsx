'use client';
import { useEffect, useRef, useState } from 'react';
import { ActionLink, Button, Dropdown, MenuList, PanelHeader, RoundButton, Segments, useDismiss, useMobile } from '../ui/index.js';
import { Combo, EmptyField, KINDS, SubCategoryDeleteModal, SubCategoryEditModal, SubCategoryModal, TypeModal } from './TaxonomyModals.jsx';
import { useConfirm } from './ConfirmModal.jsx';
import { pencil } from '../ui/illustrations.js';
import { Icon } from '../ui/Icon.jsx';
import { actions, edit, euro, plus, trash } from '../ui/icons.js';
import { MONTH_NAMES, fmtNum, hasGroups, parseAmount } from './model.js';
import './budget.css';

const NONE = '__none'; // the Dropdown drops '' values, so "no sub-category" needs a value of its own
const ALL_GROUPS = 'All groups';
// 232:5852 / 703:16128: the Segments read Incomes / Save/Invest / Expenses.
const SEG_LABEL = { income: 'Incomes', investment: 'Save/Invest', expense: 'Expenses' };

const GROUP_TABS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
// One section per category / sub-category of the board (the board's own sub-categories too).
const combosFor = (model, label, mi) => model.combosOf(label, mi).map((c) => ({ type: c.type, group: c.group, label: c.group || c.kindLabel }));
let seq = 0;

// Panel - Year budget (Ongatu 232:5852; phones 703:16128) and Edit month's budget (phones 703:16763).
// Starting budget ("{year} / Starting budget", `pending`): proposes a monthly figure per item from the trailing 12 months;
//   "Save {year}" writes the year, one budget doc per item, and remembers edited figures as future suggestions.
// Editing budget ("{Mon} {year} / Editing budget", `month` = { yearIdx, monthIdx }): the month's items with the figures
//   it shows now; "Save changes" stores them as that month's budget.
// `forMonth` marks the Editing-budget instance, so its ids stay its own while it is closed.
// Oct 12 (232:5851 / 656:9776 / 232:5853): the top is Segments (the category), then Sub-category and Group (optional)
// side by side (stacked on phones): a Dropdown / combobox with "Edit sub-category" / "Edit group" under it, or, while
// there is nothing to pick, an Info message with the Nano "+ Add sub-category" / "+ Add group". 16 apart, 40 to the items.
export function BudgetPanel({ pending, month, forMonth, model, onClose, onCreate, onSave, onRename, onDeleteSub }) {
  const isMonth = forMonth != null ? !!forMonth : !!month;
  const open = isMonth ? !!month : !!pending;
  const my = isMonth && month ? model.DATA[month.yearIdx] : null;
  const P = isMonth ? 'month-budget' : 'budget';
  const [topTab, setTopTab] = useState('expense');
  const [group, setGroup] = useState('Fixed');
  const [sub, setSub] = useState(''); // the sub-category shown for Income and Savings ('' = none)
  const [groupSel, setGroupSel] = useState(''); // '' = every group of the shown sub-category
  const [groupText, setGroupText] = useState('');
  const [groupTyping, setGroupTyping] = useState(false); // "+ Add group" turned the info box into the combobox
  const baseLabel = isMonth ? (my ? my.year : null) : (model.DATA.length ? model.DATA[model.DATA.length - 1].year : null);
  const kinds = baseLabel ? model.kindsOf(baseLabel) : [];
  const kindName = (kinds.find((k) => k.type === topTab) || {}).label || (KINDS.find((k) => k.value === topTab) || {}).label || topTab;
  const isSel = (x) => x.type === topTab && (topTab === 'expense' ? x.group === group : (x.group || '') === sub);
  const [typeModal, setTypeModal] = useState(false);
  const [typeCat, setTypeCat] = useState('');
  const [subModal, setSubModal] = useState(false);
  const [editing, setEditingSub] = useState(null); // { from } — the sub-category being edited (Edit modal)
  const [deleting, setDeleting] = useState(null); // { name } — the sub-category being deleted (deletion modal)
  const [editGroup, setEditGroup] = useState(null); // { from } — the group being edited
  const [confirmModal, confirm] = useConfirm(isMonth ? 'month-rename-confirm' : 'budget-rename-confirm'); // rename and delete
  const mobile = useMobile();
  const [sections, setSections] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // Every section is built once per opening, so an edit in one survives switching tabs.
  useEffect(() => {
    if (!open) return;
    setTopTab('expense'); setGroup('Fixed'); setSub(''); setGroupSel(''); setGroupText(''); setGroupTyping(false); setStatus(null);
    const combos = combosFor(model, baseLabel, isMonth ? month.monthIdx : undefined);
    { const firstExp = combos.find((c) => c.type === 'expense' && c.group); if (firstExp && !combos.some((c) => c.type === 'expense' && c.group === 'Fixed')) setGroup(firstExp.group); }
    const sugg = isMonth ? monthSections(model.monthBudgetRows(my, month.monthIdx), combos) : model.buildBudgetSuggestions();
    setSections(combos.map(({ type, group: g, label }) => {
      const sec = sugg.find((s) => s.type === type && (s.group || null) === (g || null));
      const row = (it) => ({ key: ++seq, ...it, value: fmtNum(it.suggested != null ? it.suggested : 0), editing: false });
      const items = sec ? sec.items : [];
      const blocks = [];
      if (hasGroups(type)) {
        const byCat = new Map();
        items.forEach((it) => { const k = it.category || '(uncategorized)'; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(row(it)); });
        [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([category, rows]) => blocks.push({ category, rows }));
      }
      return { type, group: g, label, pre: [], rows: hasGroups(type) ? [] : items.map(row), blocks, empty: !items.length, adding: false };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patchSection = (i, fn) => setSections((ss) => ss.map((s, k) => (k === i ? fn(s) : s)));
  const mapRows = (fn) => setSections((ss) => ss.map((s) => ({ ...s, pre: fn(s.pre), rows: fn(s.rows), blocks: s.blocks.map((b) => ({ ...b, rows: fn(b.rows) })) })));
  const setValue = (key, value) => mapRows((rows) => rows.map((r) => (r.key === key ? { ...r, value } : r)));
  const removeRow = (key) => mapRows((rows) => rows.filter((r) => r.key !== key));
  const setEditing = (key, on) => mapRows((rows) => rows.map((r) => (r.key === key ? { ...r, editing: on } : r)));
  const rowProps = { onValue: setValue, onRemove: removeRow, onEditing: setEditing };
  const addItem = (i, it) => patchSection(i, (x) => {
    const r = { key: ++seq, type: x.type, group: x.group, ...it, computed: 0, isCustomized: false, value: fmtNum(it.amount || 0), added: true };
    if (!hasGroups(x.type)) return { ...x, adding: false, empty: false, pre: [...x.pre, r] };
    const bi = x.blocks.findIndex((b) => b.category === it.category);
    const blocks = bi >= 0 ? x.blocks.map((b, k) => (k === bi ? { ...b, rows: [...b.rows, r] } : b)) : [...x.blocks, { category: it.category, rows: [r] }];
    return { ...x, adding: false, empty: false, blocks };
  });
  const allRows = () => sections.flatMap((s) => [...s.pre, ...s.rows, ...s.blocks.flatMap((b) => b.rows)]);
  const curIdx = () => sections.findIndex(isSel);
  const cur = sections.find(isSel) || null;
  const groupNames = cur ? cur.blocks.map((b) => b.category) : [];
  const shownGroup = groupSel && groupNames.includes(groupSel) ? groupSel : '';
  // "+ Add sub-category" (every category): new empty sections, the first one shown.
  const addSubs = (groups) => {
    setSections((ss) => [...ss, ...groups.filter((g) => !ss.some((x) => x.type === topTab && x.group === g)).map((g) => ({ type: topTab, group: g, label: g, pre: [], rows: [], blocks: [], empty: true, adding: false }))]);
    if (groups[0]) { if (topTab === 'expense') setGroup(groups[0]); else setSub(groups[0]); setGroupSel(''); setGroupTyping(false); }
  };
  const curSubName = topTab === 'expense' ? group : (sub || null);
  const namedSubs = topTab === 'expense' ? [] : [...new Set(sections.filter((x) => x.type === topTab && x.group).map((x) => x.group))];
  const expGroups = [...new Set(sections.filter((x) => x.type === 'expense').map((x) => x.group))];
  const groupOptions = [...GROUP_TABS.filter((o) => expGroups.includes(o.value)), ...expGroups.filter((g) => !GROUP_TABS.some((o) => o.value === g)).map((g) => ({ value: g, label: g }))];
  const subsHere = topTab === 'expense' ? expGroups : namedSubs;
  // Rename (Oct 5, Editing budget only): the Edit modal, then a confirmation that says what spreads, then the write.
  const askRename = (to) => {
    const r = editing; setEditingSub(null);
    if (!r || !month) return;
    const when = `${MONTH_NAMES[month.monthIdx]} ${my ? my.year : ''}`.trim();
    confirm({
      title: `Rename "${r.from}" to "${to}"?`,
      description: `This applies to ${when} and every month after it, later years included. Earlier months keep "${r.from}".`,
      illustration: pencil, destructive: false, confirmLabel: 'Rename', busyLabel: 'Renaming…',
      onConfirm: async () => {
        await onRename({ type: topTab, from: r.from, to, year: my.year, mi: month.monthIdx });
        setSections((ss) => ss.map((x) => (x.type === topTab && x.group === r.from ? { ...x, group: to, label: to,
          pre: x.pre.map((q) => ({ ...q, group: to })), rows: x.rows.map((q) => ({ ...q, group: to })), blocks: x.blocks.map((b) => ({ ...b, rows: b.rows.map((q) => ({ ...q, group: to })) })) } : x)));
        if (topTab === 'expense') setGroup(to); else setSub(to);
      },
    });
  };
  // Delete the shown sub-category (Oct 5, Editing budget only; 922:13829 deletion modal, Oct 12): from this month on.
  // Expenses keeps at least one sub-category; a sub-category with entries from this month on is refused (TrackerApp
  // says why). "Move items to" re-parents its groups and items onto the picked sub-category in the panel first; they are
  // saved there with "Save changes".
  const canDeleteSub = isMonth && !!onDeleteSub && !!curSubName && !(topTab === 'expense' && expGroups.length <= 1);
  const askDeleteSub = () => {
    const name = curSubName;
    setEditingSub(null);
    if (!name || !month) return;
    const Y = parseInt(my.year, 10);
    const logged = model.ENTRIES.some((e) => e.type === topTab && (e.group || null) === name && (parseInt(e.year, 10) > Y || (e.year === my.year && e.monthIndex >= month.monthIdx)));
    if (logged) { onDeleteSub({ type: topTab, sub: name, year: my.year, mi: month.monthIdx }); return; }
    setDeleting({ name });
  };
  const doDeleteSub = async (target) => {
    const name = deleting && deleting.name;
    if (!name) return;
    const ok = await onDeleteSub({ type: topTab, sub: name, year: my.year, mi: month.monthIdx });
    setDeleting(null);
    if (!ok) return;
    setSections((ss) => {
      const from = ss.find((x) => x.type === topTab && x.group === name);
      let out = ss.filter((x) => !(x.type === topTab && x.group === name));
      if (target && from) {
        const move = (r) => ({ ...r, group: target, added: true });
        out = out.map((x) => {
          if (!(x.type === topTab && (x.group || '') === target)) return x;
          const blocks = x.blocks.map((b) => ({ ...b }));
          from.blocks.forEach((b) => { const k = blocks.findIndex((q) => q.category === b.category); if (k >= 0) blocks[k] = { ...blocks[k], rows: [...blocks[k].rows, ...b.rows.map(move)] }; else blocks.push({ category: b.category, rows: b.rows.map(move) }); });
          return { ...x, empty: false, pre: [...x.pre, ...from.pre.map(move)], rows: [...x.rows, ...from.rows.map(move)], blocks };
        });
      }
      return out;
    });
    if (topTab === 'expense') setGroup(target || expGroups.find((g) => g !== name) || ''); else setSub(target || '');
    setGroupSel('');
  };
  const sectionCounts = (name) => {
    const x = sections.find((q) => q.type === topTab && q.group === name);
    if (!x) return { groups: 0, items: 0 };
    return { groups: x.blocks.length, items: x.pre.length + x.rows.length + x.blocks.reduce((n, b) => n + b.rows.length, 0) };
  };
  // Groups (232:5853): typing a new name in Group (optional) adds an empty group to the shown sub-category and shows it;
  // picking one shows only that group. Each group's menu (or "Edit group") renames or deletes it (its items and their
  // figures go with it). An empty group is not saved: only items carry a budget.
  const pickGroup = (v, created) => {
    const name = String(v || '').trim();
    if (!name || name === ALL_GROUPS) { setGroupSel(''); setGroupText(''); return; }
    const existing = groupNames.find((g) => g.toLowerCase() === name.toLowerCase());
    if (!existing && created) patchSection(curIdx(), (x) => ({ ...x, empty: false, blocks: [...x.blocks, { category: name, rows: [] }] }));
    setGroupSel(existing || name); setGroupText(existing || name); setGroupTyping(false);
  };
  const renameGroup = (from, to) => {
    const name = (to || '').trim();
    if (!name || groupNames.some((g) => g !== from && g.toLowerCase() === name.toLowerCase())) return;
    patchSection(curIdx(), (x) => ({ ...x, blocks: x.blocks.map((b) => (b.category === from ? { ...b, category: name, rows: b.rows.map((r) => ({ ...r, category: name })) } : b)) }));
    if (groupSel === from) { setGroupSel(name); setGroupText(name); }
  };
  const deleteGroup = (cat) => {
    patchSection(curIdx(), (x) => ({ ...x, blocks: x.blocks.filter((b) => b.category !== cat) }));
    if (groupSel === cat) { setGroupSel(''); setGroupText(''); }
  };
  const askDeleteGroup = (cat) => {
    const n = ((cur && cur.blocks.find((b) => b.category === cat)) || { rows: [] }).rows.length;
    setEditGroup(null);
    confirm({ title: `Delete the "${cat}" group?`, description: n ? `Its ${n} item${n === 1 ? '' : 's'} and their budget go with it.` : 'It has no items yet.', confirmLabel: 'Delete', onConfirm: async () => deleteGroup(cat) });
  };
  const switchTab = (v) => { setTopTab(v); setSub(''); setGroupSel(''); setGroupText(''); setGroupTyping(false); };
  const switchSub = (fn) => { fn(); setGroupSel(''); setGroupText(''); setGroupTyping(false); };

  const create = async () => {
    setStatus(null);
    setBusy(true);
    try { await (isMonth ? onSave : onCreate)(allRows()); } catch (err) { setStatus({ err: true, text: 'Could not save: ' + (err && err.message ? err.message : 'unknown error') }); }
    finally { setBusy(false); }
  };

  const grouped = hasGroups(topTab);
  const kindOptions = (kinds.length ? kinds.map((k) => ({ value: k.type, label: SEG_LABEL[k.type] || k.label })) : KINDS.map((k) => ({ value: k.value, label: SEG_LABEL[k.value] || k.label })));
  const addItemLink = (category, cls, id) => (
    <div className="budget-add-item"><ActionLink size="medium" icon={plus} className={cls} id={id} onClick={() => { setTypeCat(category || ''); setTypeModal(true); }}>Add item</ActionLink></div>
  );
  // Sub-category: Expenses always has one to pick; Income and Savings show the info box until they have one.
  const subField = topTab === 'expense' || namedSubs.length ? (
    <div className="fld" id={`${P}-group-field`}>
      <label className="fld-label" htmlFor={`${P}-sub-trigger`}>{topTab === 'expense' ? 'Sub-category' : 'Sub-category (optional)'}</label>
      {topTab === 'expense'
        ? <Dropdown id={`${P}-sub`} size="md" emptyOption={false} value={group} onChange={(v) => switchSub(() => setGroup(v))} options={groupOptions} />
        : <Dropdown id={`${P}-sub`} size="md" emptyOption={false} value={sub || NONE} onChange={(v) => switchSub(() => setSub(v === NONE ? '' : v))} options={[{ value: NONE, label: 'None' }, ...namedSubs.map((g) => ({ value: g, label: g }))]} />}
      <div className="budget-field-links">
        {isMonth && onRename && <ActionLink icon={edit} id={`${P}-edit-sub`} disabled={!curSubName} onClick={() => setEditingSub({ from: curSubName })}>Edit sub-category</ActionLink>}
        <ActionLink icon={plus} id={`${P}-add-sub`} onClick={() => setSubModal(true)}>Add sub-category</ActionLink>
      </div>
    </div>
  ) : (
    <EmptyField id={`${P}-group-field`} label="Sub-category (optional)" text="No sub-categories created" actionLabel="Add sub-category" actionId={`${P}-add-sub`} onAdd={() => setSubModal(true)} />
  );
  const groupField = !grouped ? null : (groupNames.length || groupTyping) ? (
    <div className="fld">
      <label className="fld-label" htmlFor={`${P}-group`}>Group (optional)</label>
      <Combo id={`${P}-group`} value={groupText} onChange={setGroupText} options={[...(shownGroup ? [ALL_GROUPS] : []), ...groupNames]} placeholder="Select or type to create new group" autoFocus={groupTyping}
        onPick={pickGroup} onBlur={() => setTimeout(() => setGroupText(shownGroup), 150)} />
      <div className="budget-field-links">
        <ActionLink icon={edit} id={`${P}-edit-group`} disabled={!shownGroup} onClick={() => setEditGroup({ from: shownGroup })}>Edit group</ActionLink>
      </div>
    </div>
  ) : (
    <EmptyField label="Group (optional)" text="No groups created" actionLabel="Add group" actionId={`${P}-add-group`} onAdd={() => setGroupTyping(true)} />
  );

  return (
    <>
      <div className={'add-panel-backdrop' + (open ? ' open' : '')} id="budget-panel-backdrop" onClick={onClose} />
      <div className={'add-panel budget-panel' + (open ? ' open' : '') + (grouped ? '' : ' is-default')} id={isMonth ? 'month-budget-panel' : 'budget-panel'} role="dialog" aria-modal="true" aria-labelledby={isMonth ? 'month-budget-title' : 'budget-panel-title'}>
        {isMonth
          ? <PanelHeader closeId="month-budget-close" titleId="month-budget-title" title={month ? `${MONTH_NAMES[month.monthIdx]} ${my ? my.year : ''} / Editing budget` : 'Editing budget'} hintId="month-budget-hint"
              hint="Need to make a change? Tweak your planned income and expenses to ensure your budget matches your goals for the month." onClose={onClose} />
          : <PanelHeader closeId="budget-close-btn" titleId="budget-panel-title" title={pending ? `${pending.label} / Starting budget` : 'Starting budget'} hintId="budget-panel-hint"
              hint={mobile ? `This baseline budget uses your past 12 months of data and applies to all of ${pending ? pending.label : 'the new year'}. Adjustments made here will become your default for future years.`
                : `Your starting budget is based on your past 12 months and will be applied to every month in ${pending ? pending.label : 'the new year'}. Any adjustments you make here will automatically become your default for future years.`} onClose={onClose} />}
        <div className="add-panel-content">
          <div className="budget-top">
            <Segments id={`${P}-kind`} className="budget-kind-seg" value={topTab} onChange={switchTab} options={kindOptions} />
            <div className={'budget-selectors' + (grouped ? '' : ' is-single')}>
              {subField}
              {groupField}
            </div>
          </div>
          <SubCategoryEditModal open={!!editing} id={isMonth ? 'month-rename-modal' : 'budget-rename-modal'} kind={topTab} kindName={kindName} value={editing ? editing.from : ''}
            existing={subsHere.filter((g) => editing && g !== editing.from)} onClose={() => setEditingSub(null)} onSave={askRename}
            onDelete={canDeleteSub ? askDeleteSub : undefined} />
          <SubCategoryDeleteModal open={!!deleting} id={`${P}-delete-sub-modal`} kind={topTab} kindName={kindName} name={deleting ? deleting.name : ''}
            {...sectionCounts(deleting ? deleting.name : '')} targets={subsHere.filter((g) => deleting && g !== deleting.name)}
            note={month ? `It goes from ${MONTH_NAMES[month.monthIdx]} ${my ? my.year : ''} and every month after it. Earlier months keep it.` : undefined}
            onClose={() => setDeleting(null)} onConfirm={doDeleteSub} />
          <SubCategoryEditModal open={!!editGroup} id={`${P}-group-modal`} noun="group" kind={topTab} kindName={kindName} value={editGroup ? editGroup.from : ''}
            existing={groupNames.filter((g) => editGroup && g !== editGroup.from)} onClose={() => setEditGroup(null)}
            onSave={(to) => { renameGroup(editGroup.from, to); setEditGroup(null); }} onDelete={() => askDeleteGroup(editGroup.from)} />
          {confirmModal}
          <SubCategoryModal open={subModal} kind={topTab} kindName={kindName} existing={subsHere} id={`${P}-sub-modal`} onClose={() => setSubModal(false)} onSave={({ groups }) => { addSubs(groups); setSubModal(false); }} />
          <TypeModal open={typeModal} kind={topTab} kindName={kindName} group={topTab === 'expense' ? group : (sub || null)} category={grouped ? typeCat : undefined} id={`${P}-type-modal`}
            groupsOf={() => groupNames}
            onClose={() => setTypeModal(false)}
            onSave={(t) => { const i = curIdx(); t.items.forEach((item) => addItem(i, { category: t.category, item, amount: 0, kindName })); setTypeModal(false); }} />
          <div id={`${P}-sections`} className="budget-sections">
            {sections.map((s, i) => (
              <div key={s.type + (s.group || '')} className="budget-type-section" data-type={s.type} data-group={s.group || ''}
                hidden={!isSel(s)}>
                {/* 232:5851 (Default): one flat list of rows, "+ Add item" (16/20) 12 below. */}
                {!hasGroups(s.type) && !s.empty && (
                  <div className="budget-group">
                    <div className="budget-items">{[...s.pre, ...s.rows].map((r) => <BudgetRow key={r.key} r={r} {...rowProps} />)}</div>
                  </div>
                )}
                {s.empty && !s.blocks.length && <div className="budget-empty">{isMonth ? 'Nothing planned here for this month yet.' : 'No history for this yet. Add an item, or create the year and add entries as they come in.'}</div>}
                {!hasGroups(s.type) && addItemLink('', null, `${P}-add-type${s.type === 'income' ? '' : '-' + s.type}${s.group ? '-' + s.group.replace(/\W+/g, '-') : ''}`)}
                {/* 232:5853 (Sub-types): each group is its title with the Actions menu (phones: also a Micro "+"), its rows,
                    "+ Add item" (16/20); 16 / Divider / 16 between groups. */}
                {s.blocks.filter((b) => !isSel(s) || !shownGroup || b.category === shownGroup).map((b, bi) => (
                  <BlockFrag key={b.category} divider={bi > 0}>
                    <div className="budget-group" data-category={b.category}>
                      <GroupHeader title={b.category} mobile={mobile} onAdd={() => { setTypeCat(b.category); setTypeModal(true); }} onRename={(to) => renameGroup(b.category, to)} onDelete={() => deleteGroup(b.category)} />
                      {b.rows.length
                        ? <div className="budget-items">{b.rows.map((r) => <BudgetRow key={r.key} r={r} {...rowProps} />)}</div>
                        : <div className="budget-items is-empty"><span className="budget-group-empty">No items added yet.</span></div>}
                      {/* Phones (703:16128): the Micro "+" beside the group name instead. */}
                      {!mobile && addItemLink(b.category, 'budget-group-add')}
                    </div>
                  </BlockFrag>
                ))}
                {hasGroups(s.type) && !s.blocks.length && addItemLink('', 'budget-group-add', `${P}-add-type-${s.type}${s.group ? '-' + s.group.replace(/\W+/g, '-') : ''}`)}
              </div>
            ))}
          </div>
        </div>
        <div className="add-actions">
          {/* 232:5851 / 703:16128: Cancel (Tertiary) then Save (Primary, no icon), right-aligned 16 apart; phones:
              Save over Cancel, full width, 8 apart. */}
          <span className={'add-status' + (status && status.err ? ' err' : '')} id={isMonth ? 'month-budget-status' : 'budget-status'}>{status ? status.text : ''}</span>
          <Button variant="tertiary" className="budget-cancel" id={isMonth ? 'month-budget-cancel' : 'budget-cancel-btn'} onClick={onClose}>Cancel</Button>
          <Button className="budget-save" id={isMonth ? 'month-budget-save' : 'budget-create-btn'} disabled={busy} onClick={create}>{isMonth ? 'Save changes' : `Save ${pending ? pending.label : ''}`.trim()}</Button>
        </div>
      </div>
    </>
  );
}
export const BlockFrag = ({ divider, children }) => <>{divider && <hr className="ds-divider budget-divider" />}{children}</>;
// A group's header (232:5853): its name (Heading/Large; Heading/Medium on phones) and a Micro Tertiary round button with
// the Actions icon, 8 apart; the menu (Dropdown-list, Drop-actions) holds "Rename group" and "Delete group" (703:16128).
// Renaming turns the name into a Tiny input: Enter or leaving it saves, Escape keeps the old name.
export function GroupHeader({ title, onRename, onDelete, onAdd, mobile, renameLabel }) {
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
            {mobile && <RoundButton icon={plus} size="micro" variant="secondary" className="budget-group-plus" label={`Add an item to ${title}`} onClick={onAdd} />}</div>}
      <span className="br-actions" ref={ref}>
        <RoundButton icon={actions} size="micro" className="br-more budget-group-more" label={`Actions for ${title}`} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)} />
        {open && <MenuList className="br-menu group-menu" items={[
          { key: 'rename', label: renameLabel || 'Rename group', icon: edit, className: 'group-rename', onSelect: () => { setOpen(false); setRenaming(true); } },
          { key: 'delete', label: 'Delete group', icon: trash, className: 'group-delete', destructive: true, onSelect: () => { setOpen(false); onDelete(); } },
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
      <RoundButton icon={actions} size="micro" iconSize="md" className="br-more" label={`Actions for ${item}`} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)} />
      {open && <MenuList className="br-menu" items={[{ key: 'remove', label: 'Remove', icon: trash, className: 'br-remove', destructive: true, onSelect: () => { setOpen(false); onRemove(); } }]} />}
    </span>
  );
}

// A budget row: breackdown-row (DS 124:3667), Entry off, Action on. Default: name, € and the figure as an Action link;
// Editing (the figure clicked): an Input, Size=Tiny, and 24px right padding. The Action is a Tiny Tertiary Round button
// with the Actions icon whose menu removes the row.
export function BudgetRow({ r, onValue, onRemove, onEditing }) {
  const input = useRef(null);
  useEffect(() => { if (r.editing && input.current) { input.current.focus(); input.current.select(); } }, [r.editing]);
  const done = (v) => { onValue(r.key, fmtNum(parseAmount(v))); onEditing(r.key, false); };
  return (
    <div className={'bd-row budget-row' + (r.editing ? ' is-editing' : '')} data-type={r.type} data-group={r.group || ''} data-category={r.category || ''} data-item={r.item} data-computed={r.computed || 0}>
      <span className="bd-item-name br-name" title={r.item}>{r.item}</span>
      {r.isCustomized && <span className="br-tag" title="Set from an earlier customization — used as the default suggestion until changed again">●</span>}
      {r.editing
        ? <label className="bd-input br-edit">
            <input ref={input} type="text" inputMode="decimal" className="br-input" aria-label={`Monthly budget for ${r.item}`} defaultValue={r.value}
              onBlur={(e) => done(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(e.currentTarget.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEditing(r.key, false); } }} /><Icon icon={euro} size={12} /></label>
        : <span className="bd-value">
            <button type="button" className="bd-amount br-amount" aria-label={`Monthly budget for ${r.item}: ${r.value} €. Edit`} onClick={() => onEditing(r.key, true)}>{r.value}</button><Icon icon={euro} size={16} className="bd-euro" /></span>}
      {/* 703:16128 / 232:5853 (Oct 12): the Actions menu ("Remove") on phones too. */}
      {!r.editing && <RowActions item={r.item} onRemove={() => onRemove(r.key)} />}
    </div>
  );
}

// Month-budget rows grouped like buildBudgetSuggestions() returns them.
function monthSections(rows, combos) {
  return combos.map(({ type, group }) => ({ type, group, items: rows.filter((r) => r.type === type && (r.group || null) === (group || null)).map((r) => ({ ...r, suggested: r.amount, computed: r.amount })) }));
}
