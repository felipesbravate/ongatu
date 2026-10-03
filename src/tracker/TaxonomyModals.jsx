'use client';
// The creation modals of the board (Ongatu 397:4392: Category creation 563:4549, Sub-category creation 564:7231,
// Type creation 577:6584 / Type creation - Sub-category 563:2261). Shared by the onboarding setup and the Add entry panel.
//
// How the board maps onto the data: Category = income | investment | expense (the three the dashboard draws),
// Sub-category = the expense group (Fixed, Variable, Additional, Extra), Group (Optional) = the taxonomy category
// (Habitation, Bank...), Type = the item. A type saved without a group goes under "Other".
import { useEffect, useId, useState } from 'react';
import { ActionLink, Divider, Dropdown, Input, Modal, illustrations } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { chevronDown, plus, remove } from '../ui/icons.js';
import { InfoMessage, InfoTooltip } from '../ui/Selectors.jsx';
import { EXP_GROUPS } from './model.js';

export const KINDS = [
  { value: 'income', label: 'Income', noun: 'income' },
  { value: 'investment', label: 'Savings and investments', noun: 'savings' },
  { value: 'expense', label: 'Expenses', noun: 'expense' },
];
export const kindLabel = (k) => (KINDS.find((x) => x.value === k) || {}).label || k;
export const UNGROUPED = 'Other';
const norm = (s) => String(s || '').trim().toLowerCase();

function Rows({ values, setValues, placeholder, label, idPrefix }) {
  const set = (i, v) => setValues(values.map((x, j) => (j === i ? v : x)));
  return (
    <div className="fld-rows">
      {values.map((v, i) => (
        <div className="fld-row" key={i}>
          <Input id={`${idPrefix}-${i}`} aria-label={`${label} ${i + 1}`} placeholder={placeholder} value={v} maxLength={60} autoComplete="off" onChange={(e) => set(i, e.target.value)} />
          <button type="button" className="round-btn micro fld-remove" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} disabled={values.length === 1}
            onClick={() => setValues(values.filter((_, j) => j !== i))}><Icon icon={remove} size={12} /></button>
        </div>
      ))}
    </div>
  );
}

// A text field that suggests the existing values ("Select or type to create new...").
function Combo({ id, value, onChange, options, placeholder }) {
  const listId = useId();
  return (
    <div className="fld-combo">
      <Input id={id} list={listId} value={value} placeholder={placeholder} maxLength={60} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      <Icon icon={chevronDown} size={12} className="fld-combo-chev" />
    </div>
  );
}

const cleanList = (vals) => { const out = []; vals.map((v) => v.trim()).filter(Boolean).forEach((v) => { if (!out.some((o) => norm(o) === norm(v))) out.push(v); }); return out; };

// Type creation. kind fixes the category; for expenses `group` (the sub-category) may be fixed or picked here.
// groupsOf(sub) lists the existing groups of a sub-category. onSave({ group, category, items }).
export function TypeModal({ open, kind, group: fixedGroup, category: fixedCat, groups = EXP_GROUPS, groupsOf = () => [], onClose, onSave, id = 'type-modal' }) {
  const [sub, setSub] = useState(fixedGroup || groups[0]);
  const [cat, setCat] = useState('');
  const [items, setItems] = useState(['']);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setSub(fixedGroup || groups[0]); setCat(fixedCat || ''); setItems(['']); setErr(''); } }, [open, fixedGroup, fixedCat]); // eslint-disable-line react-hooks/exhaustive-deps
  const isExp = kind === 'expense';
  const noun = (KINDS.find((k) => k.value === kind) || {}).noun || '';
  const save = () => {
    const list = cleanList(items);
    if (!list.length) return setErr('Add at least one type.');
    onSave({ group: isExp ? sub : null, category: isExp ? (cat.trim() || UNGROUPED) : null, items: list });
  };
  return (
    <Modal open={open} onClose={onClose} id={id} illustration={illustrations.networkNodes}
      title={`Add ${noun === 'income' || noun === 'expense' ? 'an' : 'a'} ${noun} type`}
      description={isExp ? 'Define a specific expense to track, and optionally organize it into a group.' : `Define a specific ${noun === 'income' ? 'source of income' : 'saving or investment'} to track.`}
      secondary={{ label: 'Cancel', onClick: onClose, id: `${id}-cancel` }} primary={{ label: 'Save', onClick: save, id: `${id}-save` }}>
      <div className="ds-modal-form">
        {isExp && !fixedGroup && (
          <>
            <div className="fld"><label className="fld-label" htmlFor={`${id}-sub-trigger`}>Sub-category</label>
              <Dropdown id={`${id}-sub`} size="md" emptyOption={false} value={sub} onChange={setSub} options={groups.map((g) => ({ value: g, label: g }))} /></div>
            <Divider />
          </>
        )}
        {isExp && (
          <div className="fld"><label className="fld-label" htmlFor={`${id}-group`}>Group (Optional)</label>
            <Combo id={`${id}-group`} value={cat} onChange={setCat} options={groupsOf(sub)} placeholder="Select or type to create new..." /></div>
        )}
        <div className="fld"><span className="fld-label">Type</span>
          <Rows values={items} setValues={setItems} label="Type" idPrefix={`${id}-item`} placeholder={isExp ? 'e.g., Electricity, Netflix, Uber' : noun === 'income' ? 'e.g., Salary, Freelance' : 'e.g., Stocks, Pension'} /></div>
        <ActionLink size="medium" icon={plus} id={`${id}-more`} onClick={() => setItems([...items, ''])}>Add another type</ActionLink>
        {err && <InfoMessage message="danger" title={err} />}
      </div>
    </Modal>
  );
}

// Category creation. Ongatu draws Income, Savings and investments and Expenses; a category is one of those, and an
// Expenses sub-category is one of its four groups. Anything else is refused with a warning (custom categories need
// the dashboard to learn new groups first).
export function CategoryModal({ open, existing = [], onClose, onSave, id = 'category-modal' }) {
  const [name, setName] = useState('');
  const [subs, setSubs] = useState(['']);
  const [warn, setWarn] = useState(null);
  useEffect(() => { if (open) { setName(''); setSubs(['']); setWarn(null); } }, [open]);
  const save = () => {
    const n = norm(name);
    const kind = KINDS.find((k) => norm(k.label) === n || k.value === n || (k.value === 'investment' && /^(savings?|investments?)$/.test(n)) || (k.value === 'expense' && n === 'expense'));
    if (!kind) return setWarn({ title: 'Ongatu tracks Income, Savings and investments, and Expenses', text: 'Name one of these. Custom categories are coming.' });
    if (existing.includes(kind.value)) return setWarn({ title: `${kind.label} is already on your board` });
    const list = cleanList(subs);
    const groups = [];
    for (const s of list) {
      const g = EXP_GROUPS.find((x) => norm(x) === norm(s));
      if (kind.value !== 'expense' || !g) return setWarn({ title: `"${s}" can't be a sub-category yet`, text: kind.value === 'expense' ? 'Expenses have four sub-categories: Fixed, Variable, Additional and Extra.' : `${kind.label} has no sub-categories yet. Add its types directly.` });
      groups.push(g);
    }
    onSave({ kind: kind.value, groups });
  };
  return (
    <Modal open={open} onClose={onClose} id={id} illustration={illustrations.signalBars} title="Create a category"
      description="Organize where your money goes by defining high-level categories."
      secondary={{ label: 'Cancel', onClick: onClose, id: `${id}-cancel` }} primary={{ label: 'Create category', onClick: save, id: `${id}-save` }}>
      <div className="ds-modal-form">
        <div className="fld"><label className="fld-label" htmlFor={`${id}-name`}>Category</label>
          <Input id={`${id}-name`} value={name} maxLength={60} autoComplete="off" placeholder="e.g., Expenses" onChange={(e) => setName(e.target.value)} /></div>
        <div className="fld"><span className="fld-label">Sub-category</span>
          <Rows values={subs} setValues={setSubs} label="Sub-category" idPrefix={`${id}-sub`} placeholder="e.g., Fixed, Variable, Extra" /></div>
        <div className="fld-row">
          <ActionLink size="medium" icon={plus} id={`${id}-more`} onClick={() => setSubs([...subs, ''])}>Add sub-category</ActionLink>
          <InfoTooltip text="Sub-categories split a category, like Fixed and Variable expenses." />
        </div>
        {warn && <InfoMessage message="warning" title={warn.title}>{warn.text}</InfoMessage>}
        <p className="ds-modal-note">Looking to track income?<br />Add new types directly inside the default Income category.</p>
      </div>
    </Modal>
  );
}

// Sub-category creation, for a category already on the board (shown read-only).
export function SubCategoryModal({ open, kind, existing = [], onClose, onSave, id = 'subcategory-modal' }) {
  const [subs, setSubs] = useState(['']);
  const [warn, setWarn] = useState(null);
  useEffect(() => { if (open) { setSubs(['']); setWarn(null); } }, [open]);
  const save = () => {
    const groups = [];
    for (const s of cleanList(subs)) {
      const g = EXP_GROUPS.find((x) => norm(x) === norm(s));
      if (kind !== 'expense' || !g) return setWarn({ title: `"${s}" can't be a sub-category yet`, text: kind === 'expense' ? 'Expenses have four sub-categories: Fixed, Variable, Additional and Extra.' : `${kindLabel(kind)} has no sub-categories yet. Add its types directly.` });
      if (!existing.includes(g)) groups.push(g);
    }
    if (!groups.length) return setWarn({ title: 'Add a sub-category that is not on the board yet' });
    onSave({ groups });
  };
  return (
    <Modal open={open} onClose={onClose} id={id} illustration={illustrations.networkNodes} title="Create a sub-category"
      description={kind === 'income' ? 'Define different groups of sources of income to track.' : 'Split this category into groups you track separately.'}
      secondary={{ label: 'Cancel', onClick: onClose, id: `${id}-cancel` }} primary={{ label: 'Create sub-category', onClick: save, id: `${id}-save` }}>
      <div className="ds-modal-form">
        <div className="fld"><label className="fld-label" htmlFor={`${id}-cat`}>Category</label>
          <Input id={`${id}-cat`} value={kindLabel(kind)} disabled readOnly /></div>
        <div className="fld"><span className="fld-label">Sub-category</span>
          <Rows values={subs} setValues={setSubs} label="Sub-category" idPrefix={`${id}-sub`} placeholder={kind === 'expense' ? 'e.g., Fixed, Variable, Extra' : 'e.g., Stocks, Shares, Funds'} /></div>
        <div className="fld-row">
          <ActionLink size="medium" icon={plus} id={`${id}-more`} onClick={() => setSubs([...subs, ''])}>Add sub-category</ActionLink>
          <InfoTooltip text="Sub-categories split a category, like Fixed and Variable expenses." />
        </div>
        {warn && <InfoMessage message="warning" title={warn.title}>{warn.text}</InfoMessage>}
      </div>
    </Modal>
  );
}
