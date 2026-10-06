'use client';
// The creation modals of the board (Ongatu 397:4392: Category creation 563:4549, Sub-category creation 564:7231,
// Type creation 577:6584 / Type creation - Sub-category 563:2261). Shared by the onboarding setup and the Add entry panel.
//
// How the board maps onto the data (Oct 4: no restrictions, the board is the person's own mental model):
// Category = income | investment | expense (fixed, Oct 5);
// Sub-category = the entry's group (Expenses: Fixed, Variable… plus any; other categories: any, optional);
// Group (Optional, Expenses) = the taxonomy category (Habitation, Bank...); Type = the item.
// An expense type saved without a group goes under "Other".
import { useEffect, useId, useRef, useState } from 'react';
import { ActionLink, Divider, Dropdown, Input, Modal, illustrations, useDismiss, useMobile } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { chevronDown, plus, remove } from '../ui/icons.js';
import { InfoMessage, InfoTooltip } from '../ui/Selectors.jsx';
import { EXP_GROUPS, hasGroups } from './model.js';

export const KINDS = [
  { value: 'income', label: 'Income', noun: 'income' },
  { value: 'investment', label: 'Savings and investments', noun: 'savings' },
  { value: 'expense', label: 'Expenses', noun: 'expense' },
];
// A category's name.
export const kindLabel = (k) => (KINDS.find((x) => x.value === k) || {}).label || k;
export const UNGROUPED = 'Other';
const norm = (s) => String(s || '').trim().toLowerCase();

// Several values, one per row. Desktop (Type creation 577:6679 / 573:6715): every row ends with a Micro Tertiary round
// button with the 16px Remove icon in action/destructive, 8 after the input (off while only one row is left); rows 8 apart.
// Phones (661:6306 / 663:8893, Oct 3): one row = a full-width input, no remove; from the second row on, rows 2+ show the
// Remove 12 after the input and the first keeps that room empty (it can be cleared, not removed); rows 12 apart.
function Rows({ values, setValues, placeholder, label, idPrefix }) {
  const mobile = useMobile();
  const set = (i, v) => setValues(values.map((x, j) => (j === i ? v : x)));
  const many = values.length > 1;
  const rm = (i) => (
    <button type="button" className="round-btn micro fld-remove" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} disabled={values.length === 1}
      onClick={() => setValues(values.filter((_, j) => j !== i))}><Icon icon={remove} size={16} /></button>
  );
  return (
    <div className={'fld-rows' + (many ? ' is-many' : '')}>
      {values.map((v, i) => (
        <div className="fld-row" key={i}>
          <Input id={`${idPrefix}-${i}`} aria-label={`${label} ${i + 1}`} placeholder={placeholder} value={v} maxLength={60} autoComplete="off" onChange={(e) => set(i, e.target.value)} />
          {!mobile ? (many && rm(i)) : many && (i > 0 ? rm(i) : <span className="fld-remove-slot" aria-hidden="true" />)}
        </div>
      ))}
    </div>
  );
}

// A text field that suggests the existing values ("Select or type to create new..."), with the Dropdown-list under it
// (577:5997, Simple: the groups, full width; 573:6715, typing a new name: an Action list that hugs its rows and starts
// with '+ Create "Bank"'). Arrow keys move, Enter picks, Escape closes.
export function Combo({ id, value, onChange, onPick, onBlur, options, placeholder, listLabel = 'Show the groups', className }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));
  const q = String(value || '').trim();
  const shown = q ? options.filter((o) => norm(o).includes(norm(q))) : options;
  const create = !!q && !options.some((o) => norm(o) === norm(q));
  const items = [...(create ? [{ create: true, label: q }] : []), ...shown.map((o) => ({ label: o }))];
  const pick = (it) => { onChange(it.label); if (onPick) onPick(it.label, !!it.create); setOpen(false); setActive(-1); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  return (
    <div className={'fld-combo' + (className ? ' ' + className : '')} ref={ref}>
      <Input id={id} role="combobox" aria-expanded={open ? 'true' : 'false'} aria-controls={listId} aria-autocomplete="list" value={value} placeholder={placeholder} maxLength={60} autoComplete="off"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey} onBlur={onBlur} onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }} />
      <button type="button" className="fld-combo-chev" tabIndex={-1} aria-label={listLabel} onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}><Icon icon={chevronDown} size={12} /></button>
      {open && items.length > 0 && (
        <div className={'ds-dd-menu fld-combo-menu' + (create ? ' is-action ds-drop-action' : '')} role="listbox" id={listId}>
          <div className="ds-dd-items">
            {items.map((it, i) => (
              <div key={(it.create ? '+' : '') + it.label} role="option" aria-selected={norm(it.label) === norm(q) && !it.create ? 'true' : 'false'}
                className={'ds-dd-item' + (i === active ? ' is-active' : '') + (it.create ? ' has-icon fld-combo-create' : '')}
                onMouseDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}>
                {it.create && <Icon icon={plus} size="md" />}<span>{it.create ? `Create "${it.label}"` : it.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const cleanList = (vals) => { const out = []; vals.map((v) => v.trim()).filter(Boolean).forEach((v) => { if (!out.some((o) => norm(o) === norm(v))) out.push(v); }); return out; };

// Type creation. kind fixes the category. `groups` = the category's named sub-categories: when there are any, the
// sub-category is picked here (or fixed by `group`); Income and Savings may also leave it empty.
// Expenses also take a Group (Optional); groupsOf(sub) lists the existing ones.
// onSave({ group, category, items }).
export function TypeModal({ open, kind, kindName, group: fixedGroup, category: fixedCat, groups = EXP_GROUPS, groupsOf = () => [], onClose, onSave, id = 'type-modal' }) {
  const isExp = kind === 'expense';
  const grouped = hasGroups(kind);
  const subList = (groups || []).filter(Boolean);
  const optionalSub = !isExp;
  // Income and Savings start on None (their types usually have no sub-category); Expenses on
  // their first sub-category.
  const firstSub = fixedGroup !== undefined ? (fixedGroup || '') : ((kind === 'income' || kind === 'investment') ? '' : (subList[0] || ''));
  const [sub, setSub] = useState(firstSub);
  const [cat, setCat] = useState('');
  const [items, setItems] = useState(['']);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setSub(firstSub); setCat(fixedCat || ''); setItems(['']); setErr(''); } }, [open, fixedGroup, fixedCat]); // eslint-disable-line react-hooks/exhaustive-deps
  const kindInfo = KINDS.find((k) => k.value === kind);
  const noun = kindInfo ? kindInfo.noun : (kindName || 'new');
  const save = () => {
    const list = cleanList(items);
    if (!list.length) return setErr('Add at least one type.');
    onSave({ group: sub || null, category: grouped ? (cat.trim() || (isExp ? UNGROUPED : null)) : null, items: list });
  };
  const subOptions = [...(optionalSub ? [{ value: '__none', label: 'None' }] : []), ...subList.map((g) => ({ value: g, label: g }))];
  return (
    <Modal open={open} onClose={onClose} id={id} illustration={illustrations.networkNodes}
      title={kindInfo ? `Add ${noun === 'income' || noun === 'expense' ? 'an' : 'a'} ${noun} type` : `Add a ${kindName || 'category'} type`}
      description={isExp ? 'Define a specific expense to track, and optionally organize it into a group.' : kind === 'income' ? 'Define a specific source of income to track.' : kind === 'investment' ? 'Define a specific saving or investment to track.' : 'Define something specific to track in this category, and optionally organize it into a group.'}
      secondary={{ label: 'Cancel', onClick: onClose, id: `${id}-cancel` }} primary={{ label: 'Save', onClick: save, id: `${id}-save` }}>
      <div className="ds-modal-form">
        {fixedGroup === undefined && subList.length > 0 && (
          <>
            <div className="fld"><label className="fld-label" htmlFor={`${id}-sub-trigger`}>{optionalSub ? 'Sub-category (Optional)' : 'Sub-category'}</label>
              <Dropdown id={`${id}-sub`} size="md" emptyOption={false} value={sub || (optionalSub ? '__none' : '')} onChange={(v) => setSub(v === '__none' ? '' : v)} options={subOptions} /></div>
            <Divider />
          </>
        )}
        {grouped && (
          <div className="fld"><label className="fld-label" htmlFor={`${id}-group`}>Group (Optional)</label>
            <Combo id={`${id}-group`} value={cat} onChange={setCat} options={groupsOf(sub || null)} placeholder="Select or type to create new..." /></div>
        )}
        <div className="fld"><span className="fld-label">Type</span>
          <Rows values={items} setValues={setItems} label="Type" idPrefix={`${id}-item`} placeholder={isExp ? 'e.g., Electricity, Netflix, Uber' : kind === 'income' ? 'e.g., Salary, Freelance' : kind === 'investment' ? 'e.g., Stocks, Pension' : 'e.g., Monthly donation'} /></div>
        <ActionLink icon={plus} id={`${id}-more`} onClick={() => setItems([...items, ''])}>Add another type</ActionLink>
        {err && <InfoMessage message="danger" title={err} />}
      </div>
    </Modal>
  );
}

// Oct 5 (Felipe): no category creation; the three categories are fixed. Sub-categories and groups stay free.

// Sub-category creation for a category already on the board (shown read-only). Any names (Oct 4).
export function SubCategoryModal({ open, kind, kindName, existing = [], onClose, onSave, id = 'subcategory-modal' }) {
  const [subs, setSubs] = useState(['']);
  const [warn, setWarn] = useState(null);
  useEffect(() => { if (open) { setSubs(['']); setWarn(null); } }, [open]);
  const save = () => {
    const groups = cleanList(subs).filter((g) => !existing.some((x) => norm(x) === norm(g)));
    if (!groups.length) return setWarn({ title: cleanList(subs).length ? 'Those sub-categories are already on the board' : 'Add a sub-category name' });
    onSave({ groups });
  };
  return (
    <Modal open={open} onClose={onClose} id={id} illustration={illustrations.networkNodes} title="Create a sub-category"
      description={kind === 'income' ? 'Define different groups of sources of income to track.' : 'Split this category into groups you track separately.'}
      secondary={{ label: 'Cancel', onClick: onClose, id: `${id}-cancel` }} primary={{ label: 'Create sub-category', onClick: save, id: `${id}-save` }}>
      <div className="ds-modal-form">
        <div className="fld"><label className="fld-label" htmlFor={`${id}-cat`}>Category</label>
          <Input id={`${id}-cat`} value={kindName || kindLabel(kind)} disabled readOnly /></div>
        <div className="fld"><span className="fld-label">Sub-category</span>
          <Rows values={subs} setValues={setSubs} label="Sub-category" idPrefix={`${id}-sub`} placeholder={kind === 'expense' ? 'e.g., Fixed, Variable, Extra' : kind === 'investment' ? 'e.g., Stocks, Shares, Funds' : kind === 'income' ? 'e.g., Job, Side projects' : 'e.g., Monthly, One-off'} /></div>
        <div className="fld-row">
          <ActionLink icon={plus} id={`${id}-more`} onClick={() => setSubs([...subs, ''])}>Add sub-category</ActionLink>
          <InfoTooltip text="Sub-categories split a category into parts you track separately." />
        </div>
        {warn && <InfoMessage message="warning" title={warn.title}>{warn.text}</InfoMessage>}
      </div>
    </Modal>
  );
}

// Renaming a category or a sub-category (Oct 5; no Figma frame yet): the Modal with the Pencil illustration, one Input
// with the current name, Cancel + Rename. `existing` = the names it must not clash with. onSave(newName).
export function RenameModal({ open, title, label, value, existing = [], description, onClose, onSave, id = 'rename-modal' }) {
  const [name, setName] = useState(value || '');
  const [warn, setWarn] = useState(null);
  useEffect(() => { if (open) { setName(value || ''); setWarn(null); } }, [open, value]);
  const save = () => {
    const n = name.trim();
    if (!n) return setWarn('Give it a name');
    if (norm(n) === norm(value)) return onClose();
    if (existing.some((x) => norm(x) === norm(n))) return setWarn(`${n} is already on your board`);
    onSave(n);
  };
  return (
    <Modal open={open} onClose={onClose} id={id} illustration={illustrations.pencil} title={title} description={description}
      secondary={{ label: 'Cancel', onClick: onClose, id: `${id}-cancel` }} primary={{ label: 'Rename', onClick: save, id: `${id}-save` }}>
      <div className="ds-modal-form">
        <div className="fld"><label className="fld-label" htmlFor={`${id}-name`}>{label}</label>
          <Input id={`${id}-name`} value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} /></div>
        {warn && <InfoMessage message="warning" title={warn} />}
      </div>
    </Modal>
  );
}
