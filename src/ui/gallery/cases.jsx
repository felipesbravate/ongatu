'use client';
// Component cases for the gallery (/dev/components). Cases with `legacy` are parity checks: the same
// component, with the same data, as it renders in the legacy tracker in that capture state
// (tests/visual/capture.py seed data, clock frozen on 23 Sep 2026). tests/ui/parity.py compares the
// DOM and the pixels. Cases without `legacy` only show states the dashboard can't reach on its own.
import { useState } from 'react';
import {
  ActionLink, BreakdownRow, Button, Card, Divider, Dropdown, EntriesTooltip, EntryCounter, ExpenseCard, Field, FieldGroup,
  KpiCard, Label, Meter, MonthSelector, PanelHeader, RoundButton, Segments, Toast, TooltipEntryItem, YearAddButton, YearTab,
  Avatar, MenuList, Notification, NotificationItem, ProgressBar, UserMenu, UserNav, Modal, Illustration, illustrations,
  Logo, Toggle, Checkbox, AppHeader, Input, SideMenu, MenuItemCounter,
} from '../index.js';
import * as iconLibrary from '../icons.js';
import { Icon } from '../Icon.jsx';
import { actions, arrowStraightDown, arrowStraightUp, bell, edit, lock, minus, plus, reload, signOut, upload, user, x } from '../icons.js';

const TOP = [{ value: 'Income', label: 'Income' }, { value: 'Investments', label: 'Savings/Investments' }, { value: 'Expenses', label: 'Expenses' }];
const GROUPS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const good = 'var(--good)';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PERIODS = ['2026', '2025', '2024'].map((y) => ({ group: y, options: MONTH_NAMES.map((m, i) => ({ value: `${y}-${String(i + 1).padStart(2, '0')}`, label: m, selectedLabel: `${m} ${y}` })) }));
const FIXED_CATS = ['Bank', 'Education', 'Habitation', 'Insurances', 'Other'].map((c) => ({ value: c, label: c }));
const ENTRY_TYPES = [{ value: 'income', label: 'Income' }, { value: 'investment', label: 'Savings/Investment' }, { value: 'expense', label: 'Expenses' }];
// A position:fixed layer (Toast, Entries tooltip) stays inside a transformed box.
const Contain = ({ height, width, children }) => <div style={{ position: 'relative', height, width, transform: 'translateZ(0)' }}>{children}</div>;

function Controlled({ initial, children }) { const [v, setV] = useState(initial); return children(v, setV); }

function UpdatedControls() {
  const [amount, setAmount] = useState(49.9);
  const [draft, setDraft] = useState('49.90');
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState('');
  const commit = () => { const n = Number(draft.replace(',', '.')); if (draft.trim() && Number.isFinite(n)) { setAmount(n); setEditing(false); } };
  return <Card title="Updated controls">
    <div style={{ display: 'grid', gap: 16 }}>
      <Logo variant="full" height={40} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {['medium','small','tiny','micro'].map(size => <Button key={size} size={size} icon={plus}>{size}</Button>)}
      </div>
      <Field label="Category" htmlFor="audit-category-trigger"><Dropdown id="audit-category" size="sm" value={category} onChange={setCategory} icon={plus} options={[{value:'services',label:'Services',icon:plus},{value:'other',label:'Other',icon:edit}]} /></Field>
      <Input size="small" icon={lock} placeholder="Small input" aria-label="Small input" />
      <Input size="tiny" icon={lock} disabled placeholder="Disabled input" aria-label="Disabled input" />
      <div style={{ display:'flex',gap:8 }}><MenuItemCounter>10</MenuItemCounter><MenuItemCounter unread>3</MenuItemCounter></div>
      <Meter name="Services" amount={amount} max={100} currency="EUR" />
      <BreakdownRow name="Medium" amount={amount} currency="EUR" counter={<EntryCounter>2</EntryCounter>}
        onAmount={() => { setDraft(String(amount)); setEditing(true); }} amountLabel="Edit Medium amount" editing={editing} editValue={draft}
        onEditChange={setDraft} onCommit={commit} onCancel={() => setEditing(false)}
        actions={editing ? <RoundButton size="micro" icon={x} label="Cancel editing" onClick={() => setEditing(false)} /> : null} />
      {editing && <ActionLink onClick={commit}>Save amount</ActionLink>}
    </div>
  </Card>;
}

export const CASES = [
  { id: 'okara-october-update', render: () => <UpdatedControls /> },
  { id: 'segments-motion', render: () => <Controlled initial="income">{(v, s) => <Segments aria-label="Tracker category" options={[{ value: 'income', label: 'Incomes' }, { value: 'save', label: 'Save/Invest' }, { value: 'expense', label: 'Expenses' }]} value={v} onChange={s} />}</Controlled> },
  { id: 'sub-segments-motion', render: () => <Controlled initial="1">{(v, s) => <Segments sub aria-label="Sub-category" options={Array.from({ length: 6 }, (_, i) => ({ value: String(i + 1), label: 'Label' }))} value={v} onChange={s} />}</Controlled> },
  // ---- parity with the legacy dashboard ----
  { id: 'segments', legacy: { state: 'dashboard', selector: '#breakdown-top-seg' },
    render: () => <Controlled initial="Expenses">{(v, s) => <Segments id="breakdown-top-seg" options={TOP} value={v} onChange={s} />}</Controlled> },
  { id: 'sub-segments', legacy: { state: 'dashboard', selector: '#breakdown-group-seg' },
    render: () => <Controlled initial="Fixed">{(v, s) => <Segments sub id="breakdown-group-seg" aria-label="Expense type" options={GROUPS} value={v} onChange={s} />}</Controlled> },
  { id: 'year-add-button', legacy: { state: 'dashboard', selector: '#year-add-toggle' }, render: () => <YearAddButton id="year-add-toggle" /> },
  { id: 'year-tabs', legacy: { state: 'dashboard', selector: '#years' },
    render: () => (
      <div className="year-tabs" id="years" role="tablist" aria-label="Year">
        <YearTab label="2026" selected onDelete={() => {}} /><YearTab label="2025" /><YearTab label="2024" />
      </div>) },
  { id: 'month-selector', legacy: { state: 'dashboard', selector: '#months' },
    render: () => (
      <div className="months" id="months" role="tablist" aria-label="Month">
        {MONTHS.map((m, i) => <MonthSelector key={m} label={m} selected={i === 8} state={i > 8 ? 'estimated' : undefined} />)}
      </div>) },
  { id: 'kpi-cards', legacy: { state: 'dashboard', selector: '#mini-kpis' },
    render: () => (
      <div className="mini-grid" id="mini-kpis">
        <KpiCard label="Income" dotColor="var(--kpi-income)" value={3729.82} currency="EUR" />
        <KpiCard label="Expenses" dotColor="var(--kpi-expense)" value={1573.62} currency="EUR" />
        <KpiCard label="Savings/Investments" dotColor="var(--kpi-invest)" value={0} currency="EUR" detail="0% rate - €0 saved of €3.730 income" />
      </div>) },
  { id: 'expense-cards', legacy: { state: 'dashboard', selector: '#ticker-strip' },
    render: () => (
      <div className="ticker-strip" id="ticker-strip">
        <ExpenseCard name="Fixed" initial="F" badgeColor="var(--badge-fixed)" value={1090.13} currency="EUR" delta={{ icon: arrowStraightDown, text: '€308 vs last month', color: good }} />
        <ExpenseCard name="Variable" initial="V" badgeColor="var(--group-variable)" value={483.49} currency="EUR" delta={{ icon: arrowStraightDown, text: '€355 vs last month', color: good }} />
        <ExpenseCard name="Extra" initial="E" badgeColor="var(--group-extra)" value={0} currency="EUR" delta={{ icon: minus, text: 'same as last month', color: 'var(--text-secondary)' }} />
        <ExpenseCard name="Additional" initial="A" badgeColor="var(--group-additional)" value={0} currency="EUR" delta={{ icon: arrowStraightDown, text: '€656 vs last month', color: good }} />
      </div>) },
  { id: 'meter', legacy: { state: 'dashboard', selector: '#meters .meter-row' },
    render: () => <Meter name="Habitation" amount={1090.13} max={1090.13} currency="EUR" color="var(--group-fixed)" /> },
  { id: 'breakdown-rows', legacy: { state: 'dashboard', selector: '#itemslist' },
    render: () => (
      <div id="itemslist" className="bd-list">
        <div className="bd-block">
          <div className="bd-block-title">Habitation</div>
          <BreakdownRow name="Rent or mortgage" amount={1049.64} currency="EUR" counter={<EntryCounter>1</EntryCounter>} />
          <BreakdownRow name="Internet" amount={40.49} currency="EUR" counter={<EntryCounter>1</EntryCounter>} />
        </div>
      </div>) },
  { id: 'labels', legacy: { state: 'dashboard', selector: '#insight-tags' },
    render: () => <div className="insight-tags" id="insight-tags"><Label>Fixed</Label><Label>September</Label><Label>2026</Label></div> },
  { id: 'label-delta', legacy: { state: 'dashboard', selector: '#hero-delta' },
    render: () => <Label type="negative" icon={minus} id="hero-delta" aria-label="-17.1% since Jan">17.1% since Jan</Label> },
  { id: 'button-with-icon', legacy: { state: 'dashboard', selector: '#tracker-add-btn' },
    render: () => <Button id="tracker-add-btn" icon={plus}>Add expense</Button> },

  // ---- parity with the Add entry panel, its menus, the Entries tooltip and the Toast ----
  { id: 'panel-header', context: [{ id: 'add-panel', style: { transform: 'translateX(0)', willChange: 'transform', background: 'var(--surface)' } }], legacy: { state: 'panel', selector: '#add-panel .add-panel-header' },
    render: () => <PanelHeader closeId="entry-close-btn" titleId="add-panel-title" title="Add an entry" hint="Upload receipts or statements or enter the information by hand." /> },
  { id: 'type-controller', context: [{ id: 'add-panel', style: { transform: 'translateX(0)', willChange: 'transform', background: 'var(--surface)' } }, { className: 'ap-manual' }], legacy: { state: 'panel', selector: '#ap-manual .ap-type' },
    render: () => (
      <Controlled initial={['expense', 'Fixed']}>{([t, g], s) => (
        <FieldGroup label="Type" className="ap-type">
          <Segments id="entry-type-seg" options={ENTRY_TYPES} value={t} onChange={(v) => s([v, g])} />
          <div id="entry-group-field"><Segments sub id="entry-group-seg" aria-label="Expense type" options={GROUPS} value={g} onChange={(v) => s([t, v])} /></div>
        </FieldGroup>)}</Controlled>) },
  { id: 'field-dropdown-empty', context: [{ id: 'add-panel', style: { transform: 'translateX(0)', willChange: 'transform', background: 'var(--surface)' } }, { className: 'ap-manual' }], legacy: { state: 'panel', selector: '#entry-category-field' },
    render: () => <Controlled initial="">{(v, s) => <Field id="entry-category-field" label="Category" htmlFor="entry-cat-trigger"><Dropdown id="entry-cat" size="md" value={v} onChange={s} options={FIXED_CATS} /></Field>}</Controlled> },
  { id: 'field-dropdown-grouped', context: [{ id: 'add-panel', style: { transform: 'translateX(0)', willChange: 'transform', background: 'var(--surface)' } }, { className: 'ap-manual' }], legacy: { state: 'panel', selector: '#ap-manual .field-period' },
    render: () => <Controlled initial="2026-09">{(v, s) => <Field className="span-2 field-period" label="Month and year" htmlFor="entry-period-trigger"><Dropdown id="entry-period" size="md" value={v} onChange={s} options={PERIODS} emptyOption={false} /></Field>}</Controlled> },
  { id: 'panel-actions', context: [{ id: 'add-panel', style: { transform: 'translateX(0)', willChange: 'transform', background: 'var(--surface)' } }, { className: 'ap-manual' }], legacy: { state: 'panel', selector: '#ap-manual .add-actions' },
    render: () => (
      <div className="add-actions">
        <Button id="entry-submit">Add</Button><Button variant="tertiary" id="entry-cancel">Cancel</Button><span className="add-status" id="entry-status" role="status" />
      </div>) },
  { id: 'dropdown-menu', legacy: { state: 'category-menu', selector: '.ds-dd-menu' }, open: '.ds-dd-trigger', compare: '.ds-dd-menu',
    render: () => <div style={{ width: 275.5 }}><Controlled initial="">{(v, s) => <Dropdown id="entry-cat" size="md" value={v} onChange={s} options={FIXED_CATS} />}</Controlled></div> },
  { id: 'dropdown-menu-grouped', legacy: { state: 'period-menu', selector: '.ds-dd-menu' }, open: '.ds-dd-trigger', compare: '.ds-dd-menu',
    render: () => <div style={{ width: 200 }}><Controlled initial="2026-09">{(v, s) => <Dropdown id="entry-period" size="md" value={v} onChange={s} options={PERIODS} emptyOption={false} />}</Controlled></div> },
  { id: 'entries-tooltip-open', legacy: { state: 'entries-tooltip', selector: '#note-tip' }, compare: '#note-tip',
    render: () => (
      <Contain height={130}>
        <EntriesTooltip visible style={{ left: 0, top: 0 }}>
          <TooltipEntryItem name="From your spreadsheet" amount={86.4} currency="EUR" onRemove={() => {}} removeTitle="Delete this value" />
          <TooltipEntryItem sub name="Lunch with team" amount={52.1} currency="EUR" />
          <TooltipEntryItem sub name="Pizza night" date="Sep 5" amount={34.3} currency="EUR" />
        </EntriesTooltip>
      </Contain>) },
  { id: 'toast-success', legacy: { state: 'toast', selector: '#ds-toast' }, compare: '.ds-toast',
    render: () => <Contain height={180} width={1000}><Toast type="success" visible onClose={() => {}}>"Side project" added to Sep 2026.</Toast></Contain> },

  // ---- states the dashboard doesn't show on its own ----
  { id: 'buttons', render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', gap: 16, alignItems: 'center', justifyItems: 'start' }}>
      <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="tertiary">Tertiary</Button>
      <Button size="small">Small</Button><Button size="small" variant="secondary">Small</Button><Button size="small" variant="tertiary">Small</Button>
      <Button size="tiny">Tiny</Button><Button size="tiny" variant="secondary">Tiny</Button><Button disabled>Disabled</Button>
    </div>) },
  { id: 'round-buttons-basic', render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <RoundButton icon={x} label="Close" /><RoundButton icon={x} size="micro" label="Remove" />
    </div>) },
  { id: 'month-states', render: () => (
    <div className="months" style={{ paddingLeft: 0 }}>
      <MonthSelector label="Jan" /><MonthSelector label="Feb" selected /><MonthSelector label="Mar" state="empty" /><MonthSelector label="Apr" state="estimated" /><MonthSelector label="May" state="estimated" selected />
    </div>) },
  { id: 'label-types', render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Label>Neutral</Label><Label type="positive" icon={plus}>12.4% since Jan</Label><Label type="negative" icon={minus}>3.1% since Jan</Label><Label type="warning" icon={plus}>Warning</Label>
    </div>) },
  { id: 'entry-counters', render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <EntryCounter>2</EntryCounter><EntryCounter open>2</EntryCounter><EntryCounter variant="estimate">≈</EntryCounter><EntryCounter variant="removed">×</EntryCounter>
    </div>) },
  { id: 'entries-tooltip', render: () => (
    <Contain height={150}>
      <EntriesTooltip visible style={{ left: 0, top: 0 }} footnote="~ estimated (split evenly) — the sheet didn't record this one's exact amount">
        <TooltipEntryItem name="From your spreadsheet" amount={86.4} currency="EUR" onRemove={() => {}} removeTitle="Delete this value" />
        <TooltipEntryItem sub name="Lunch with team" amount={52.1} currency="EUR" />
        <TooltipEntryItem sub name="Pizza night" date="Sep 5" amount={34.3} currency="EUR" estimate prefix="~" />
      </EntriesTooltip>
    </Contain>) },
  { id: 'rows-states', render: () => (
    <div style={{ width: 360 }}>
      <BreakdownRow name="Groceries" amount={412.5} currency="EUR" />
      <BreakdownRow name="Taxi" amount={35} currency="EUR" state="estimate" counter={<EntryCounter variant="estimate">≈</EntryCounter>} />
      <BreakdownRow name="Pharmacy" amount={28} currency="EUR" state="removed" counter={<EntryCounter variant="removed">×</EntryCounter>} />
      <BreakdownRow name="Salary (SEK year)" amount={43680} currency="SEK" />
      <div style={{ height: 16 }} />
      <Meter name="Food" amount={580} max={1000} currency="EUR" color="var(--group-variable)" />
      <Meter name="Transport" amount={75} max={1000} currency="EUR" color="var(--group-variable)" state="estimate" />
      <Meter name="Health" amount={28} max={1000} currency="EUR" color="var(--group-variable)" state="removed" />
    </div>) },
  { id: 'card', render: () => <Card title="Expense allocation" hint="Share of this month's spend" style={{ width: 360 }}><Divider style={{ marginTop: 16 }} /></Card> },
  { id: 'toasts', render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      {/* the Toast is position:fixed; a transformed box becomes its containing block, so it stays in the gallery */}
      {['success', 'fail', 'neutral'].map((t) => <Contain key={t} height={180} width={320}><Toast type={t} visible onClose={() => {}}>{`"Side project" added to Sep 2026.`}</Toast></Contain>)}
    </div>) },
  { id: 'action-link', render: () => <div style={{ display: 'flex', gap: 16 }}><ActionLink icon={reload}>Restore</ActionLink><ActionLink>Click to upload</ActionLink><ActionLink disabled>Disabled</ActionLink></div> },
  { id: 'dropdowns', render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 200px 200px', gap: 16 }}>
      <Controlled initial="">{(v, s) => <Field label="Category" htmlFor="g-cat-trigger"><Dropdown id="g-cat" size="md" value={v} onChange={s}
        options={['Habitation', 'Bank', 'Insurances'].map((c) => ({ value: c, label: c }))} /></Field>}</Controlled>
      <Controlled initial="2026-08">{(v, s) => <Field label="Month and year" htmlFor="g-period-trigger"><Dropdown id="g-period" size="md" value={v} onChange={s}
        options={[{ group: '2026', options: [{ value: '2026-08', label: 'August 2026' }, { value: '2026-09', label: 'September 2026' }] }, { group: '2025', options: [{ value: '2025-12', label: 'December 2025' }] }]} /></Field>}</Controlled>
      <Field label="Disabled" htmlFor="g-off-trigger"><Dropdown id="g-off" size="md" value="" disabled options={[{ value: 'a', label: 'A' }]} /></Field>
    </div>) },
  { id: 'field-group', render: () => (
    <Controlled initial="expense">{(v, s) => (
      <FieldGroup label="Type">
        <Segments options={[{ value: 'income', label: 'Income' }, { value: 'investment', label: 'Savings/Investment' }, { value: 'expense', label: 'Expenses' }]} value={v} onChange={s} />
      </FieldGroup>)}</Controlled>) },
  // ---- Sept 24 pull ----
  { id: 'round-buttons', render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <RoundButton icon={plus} variant="primary" label="Primary" /><RoundButton icon={plus} variant="secondary" label="Secondary" />
      <RoundButton icon={actions} label="Tertiary" /><RoundButton icon={actions} active label="Active" /><RoundButton icon={x} variant="secondary" active label="Secondary active" />
      <RoundButton icon={bell} size="small" label="Small" /><RoundButton icon={x} size="tiny" label="Tiny" /><RoundButton icon={x} size="micro" variant="primary" label="Micro" />
      <RoundButton icon={plus} disabled label="Inactive" />
    </div>) },
  { id: 'action-link-medium', render: () => <ActionLink size="medium" icon={upload}>Click to upload</ActionLink> },
  { id: 'kpi-indicator', render: () => <div style={{ width: 230 }}><KpiCard label="Savings/Investments" dotColor="var(--kpi-invest)" value={500} currency="EUR" detail="€40 vs last month" indicator={arrowStraightUp} /></div> },
  { id: 'avatar', render: () => <Avatar name="Felipe" /> },
  { id: 'menu-list', render: () => <div style={{ position: 'relative', height: 60 }}><MenuList items={[{ key: 'b', label: "Adjust month's budget", icon: edit }]} style={{ position: 'static' }} /></div> },
  { id: 'user-nav', render: () => (
    <Controlled initial={null}>{(v, s) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end', height: 260, width: 520 }}>
        <UserNav>
          <Notification unread open={v === 'n'} onToggle={() => s(v === 'n' ? null : 'n')} onClose={() => s(null)}>
            <NotificationItem date="Sep 23" time="15:11" action={{ label: 'Approve', onClick: () => {} }}>ann@example.com is waiting for your approval.</NotificationItem>
            <NotificationItem date="Sep 22" time="09:02">Your notification text is here.</NotificationItem>
          </Notification>
          <UserMenu name="Felipe" open={v === 'u'} onToggle={() => s(v === 'u' ? null : 'u')} onClose={() => s(null)}
            items={[{ key: 'a', label: 'Account' }, { key: 'd', label: 'Admin' }, { key: 's', label: 'Sign out', icon: signOut }]} />
        </UserNav>
      </div>)}</Controlled>) },
  { id: 'progress-bar', render: () => <div style={{ display: 'grid', gap: 16, width: 404 }}>{[0, 0.25, 0.5, 0.75, 1].map((p) => <ProgressBar key={p} value={p} />)}</div> },
  { id: 'modal', render: () => (
    <Controlled initial={false}>{(v, s) => (
      <div>
        <Button variant="secondary" id="g-modal-open" onClick={() => s(true)}>Open modal</Button>
        <Modal id="g-modal" open={v} onClose={() => s(false)} illustration={illustrations.hashtag} title="Title" description="Description"
          secondary={{ label: 'Button label', onClick: () => s(false) }} primary={{ label: 'Button label', onClick: () => s(false) }} />
      </div>)}</Controlled>) },
  { id: 'modal-destructive', render: () => (
    <Controlled initial={false}>{(v, s) => (
      <div>
        <Button variant="secondary" id="g-modal-del-open" onClick={() => s(true)}>Open delete modal</Button>
        <Modal id="g-modal-del" open={v} onClose={() => s(false)} illustration={illustrations.trashCan} title="Are you sure you want to delete 2026?"
          description="All the entries and data of this year will be permanently deleted."
          secondary={{ label: 'Cancel', onClick: () => s(false) }} primary={{ label: 'Delete', destructive: true, onClick: () => s(false) }} />
      </div>)}</Controlled>) },
  { id: 'icons', render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, width: 'min(100%, 960px)', color: 'var(--text-secondary)' }}>
      {Object.values(iconLibrary).map(icon => <div key={icon.name} style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 11 }}>{icon.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{Object.keys(icon.sizes).map(size => <Icon key={size} icon={icon} size={Number(size)} />)}</div>
      </div>)}
    </div>) },
  // Okara Illustrations: every drawing of the Figma Illustrations file, 64 wide, with its code name.
  { id: 'illustrations', render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 96px)', gap: 16 }}>
      {illustrations.all.map((a) => (
        <div key={a.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
          <div style={{ height: 96, display: 'flex', alignItems: 'center' }}><Illustration art={a} /></div>{a.name}
        </div>))}
    </div>) },
  { id: 'logo', render: () => <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}><Logo variant="full" height={48} /><Logo variant="symbol" height={48} /></div> },
  { id: 'toggle', render: () => <Controlled initial={false}>{(v, s) => <div style={{ display: 'flex', gap: 16 }}><Toggle label="Off" on={false} /><Toggle label="On" on /><Toggle id="g-toggle" label="Try" on={v} onChange={s} /></div>}</Controlled> },
  { id: 'checkbox', render: () => <Controlled initial={false}>{(v, s) => <Checkbox id="g-check" checked={v} onChange={s}>I confirm that I want to do this.</Checkbox>}</Controlled> },
  { id: 'input', render: () => (
    <div style={{ display: 'grid', gap: 12, width: 352 }}>
      <Input placeholder="Label" /><Input defaultValue="Felipe" /><Input icon={lock} value="felipe@example.com" disabled readOnly />
    </div>) },
  { id: 'app-header', render: () => <div style={{ width: 1318, margin: '0 -40px' }}><AppHeader><UserNav><Notification unread /><UserMenu name="Felipe" items={[]} /></UserNav></AppHeader></div> },
  { id: 'side-menu', render: () => (
    <Controlled initial="a">{(v, s) => (
      <div style={{ display: 'flex', gap: 40 }}>
        <SideMenu label="Menu" value={v} onSelect={s} items={[{ key: 'a', label: 'Edit profile' }, { key: 'b', label: 'Security' }, { key: 'c', label: 'Data and privacy' }]} />
        <SideMenu label="With icons" value={v} onSelect={s} items={[{ key: 'a', label: 'Profile', icon: user }, { key: 'b', label: 'Security', icon: lock }, { key: 'c', label: 'Upload', icon: upload }]} />
      </div>)}</Controlled>) },
];
