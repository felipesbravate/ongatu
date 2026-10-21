'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionLink, BalanceHero, Button, Expander, MenuList, RoundButton, useDismiss, useMobile, EntriesTooltip, EntryCounter, ExpenseCard, KpiCard, TrendLine, TONE_COLOR, Label, currencySymbol, CURRENCY_CODES, Meter, BreakdownRow, Segments, TooltipEntryItem, fmtFigure, fmtMoney, fmtMoneyShort } from '../ui/index.js';
import { actions as actionsIcon, euro, arrowStraightDown, arrowStraightUp, edit, minus, plus, reload } from '../ui/icons.js';
import { EXP_GROUPS, GROUP_COLOR, MONTH_ABBR, MONTH_NAMES } from './model.js';

// Oct 4: the board's own Expenses sub-categories join the four default groups in the
// allocation, the glance line and the expense cards. Colours beyond the defaults cycle through the data palette.
const EXTRA_COLORS = ['var(--data-lime)', 'var(--data-blue)', 'var(--data-orange)', 'var(--data-light-blue)', 'var(--data-pink)', 'var(--data-purple)'];
export function spendParts(model, y, c) {
  // The month's Expenses sub-categories in board order (the four defaults keep their colours).
  const parts = [];
  let n = 0;
  Object.keys(c.byGroup).forEach((g) => {
    if (EXP_GROUPS.includes(g)) parts.push({ key: g, label: g, value: c.byGroup[g] || 0, color: g === 'Extra' ? 'var(--alloc-extra)' : GROUP_COLOR[g], badge: g === 'Fixed' ? 'var(--badge-fixed)' : GROUP_COLOR[g] });
    else { const col = EXTRA_COLORS[n++ % EXTRA_COLORS.length]; parts.push({ key: g, label: g, value: c.byGroup[g] || 0, color: col, badge: col }); }
  });
  return parts;
}
const partValue = (c, key) => c.byGroup[key] || 0;
import { Icon } from '../ui/Icon.jsx';
import { addedBy } from './boards.js';
import { cardIndicators } from './indicators.js';
import { Money } from '../ui/Money.jsx';
import { latestEntry } from './latest-entry.js';

const tok = (name) => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim());

// ---------------- left column ----------------
export function HeroLeft({ model, y, monthIdx }) {
  const cur = y.currency;
  const c = model.computeMonth(y, monthIdx);
  const prev = monthIdx > 0 ? model.computeMonth(y, monthIdx - 1) : null;
  // Oct 9: each card's details line compares the month with the right reference (src/tracker/indicators.js).
  const ind = cardIndicators(model, y, monthIdx);
  const tiles = [
    { label: 'Incomes', value: c.income, color: 'var(--kpi-income)', trend: ind.income },
    { label: 'Expenses', value: c.expenseTotal, color: 'var(--kpi-expense)', trend: ind.expense },
    { label: 'Savings/Investments', value: c.invest, color: 'var(--kpi-invest)', trend: ind.invest },
  ];
  // Phones (Ongatu 342:7993, Sept 28): "Incomes", "Savings & Investments", and the rate as "↑ 8% rate of monthly Incomes".
  const mobile = useMobile();
  // Oct 2: phones (342:7993) show the same tiles and "↑ details" as desktop.
  // Expense allocation
  const total = Math.max(1, c.expenseTotal);
  // At a glance
  const parts = spendParts(model, y, c);
  let topGroup = EXP_GROUPS[0], topVal = -1;
  parts.forEach((p) => { if (p.value > topVal) { topVal = p.value; topGroup = p.label; } });
  const sharePct = c.expenseTotal > 0 ? (topVal / c.expenseTotal * 100) : 0;
  const expChange = prev ? c.expenseTotal - prev.expenseTotal : null;
  return (
    <div className="hero-left">
      {/* Balance hero (Okara 1161:1557; Ongatu 1028:49106 desktop, 1013:33046 phones, Oct 16) in place of the balance card. */}
      <BalanceHero id="balance-card" className="balance-hero" label={`${MONTH_NAMES[monthIdx]} balance`} labelId="balance-label" valueId="balance-value"
        value={c.balance} currency={cur} trend={ind.balance} trendId="balance-delta">
        <span className="estimate-pill" id="balance-estimate-pill" hidden={!c.isEstimateMonth}>Projected — no data yet</span>
      </BalanceHero>
      <div className="mini-grid" id="mini-kpis">
        {tiles.map((t) => <KpiCard key={t.label} label={t.label} dotColor={t.color} value={t.value} currency={cur} trend={t.trend} euroSize={16} />)}
      </div>
      <div className="card alloc-card">
        <h2>Expense allocation</h2>
        <div className="hint" id="alloc-hint">Share of this month's spend</div>
        <div className="alloc-bars" id="alloc-bars">
          {parts.map((p) => {
            const pct = Math.max(0, p.value / total * 100);
            return (
              <div className="alloc-col" key={p.key}>
                <div className="alloc-pct">{pct.toFixed(0)}%</div>
                <div className="alloc-bar" style={{ height: `${Math.max(6, pct * 0.8).toFixed(1)}px`, background: p.color }} />
                <div className="alloc-name">{p.label}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card glance-card">
        <h2>This month, at a glance</h2>
        {/* Same text runs as the legacy page (one text node between the bold parts), so the lines wrap identically. */}
        <div className="insight-text" id="insight-text">
          <b>{topGroup}</b>{' was the largest expense group this month at '}<b>{fmtMoney(topVal, cur)}</b>
          {expChange !== null
            ? <>{` (${sharePct.toFixed(0)}% of spend). Total expenses ${expChange <= 0 ? 'fell' : 'rose'} `}<b>{fmtMoneyShort(Math.abs(expChange), cur)}</b>{` vs ${y.months[monthIdx - 1]}.`}</>
            : ` (${sharePct.toFixed(0)}% of spend).`}
        </div>
        <div className="insight-tags" id="insight-tags">
          {[topGroup, y.months[monthIdx], y.year].map((t) => <Label key={t}>{t}</Label>)}
        </div>
      </div>
    </div>
  );
}

// ---------------- Tracker card ----------------
// Ongatu 211:18753 and 342:7993 (Sept 28): Incomes | Save/Invest | Expenses on every screen size.
const TOP_TABS = [{ value: 'Income', label: 'Incomes' }, { value: 'Investments', label: 'Save/Invest' }, { value: 'Expenses', label: 'Expenses' }];
// Phones (342:7993) shorten the tab and the allocation names.
// Phones (Ongatu 342:7993, Sept 28): Incomes | Save/Invest | Expenses.
const TOP_TABS_MOBILE = TOP_TABS;
const GROUP_ORDER = ['Fixed', 'Variable', 'Additional', 'Extra'];
const topTabFor = (type) => ((type === 'Income' || type === 'Investments') ? type : 'Expenses');

// Tabs: Incomes | Save/Invest | Expenses. The sub-tabs list Expenses' sub-categories (the four defaults first, then the
// board's own).
export function TrackerCard({ model, y, monthIdx, breakdownType, breakdownGroup, onTab, onAdd, onAddItem, addOpen, tip, setTip, actions, onAdjustBudget }) {
  const cur = y.currency;
  const expSubs = model.subsOf('expense', y.year, monthIdx).filter(Boolean);
  // A deleted Expenses sub-category (Oct 5) falls back to the first one the month has.
  const effType = (breakdownType === 'Income' || breakdownType === 'Investments' || !expSubs.length || expSubs.includes(breakdownType)) ? breakdownType : (GROUP_ORDER.find((g) => expSubs.includes(g)) || expSubs[0]);
  const bd = model.buildBreakdown(y, monthIdx, effType);
  const eligible = model.isFutureMonth(y, monthIdx);
  const topTab = topTabFor(effType);
  const mobile = useMobile();
  const groupTabs = [...GROUP_ORDER.filter((g) => expSubs.includes(g)), ...expSubs.filter((g) => !GROUP_ORDER.includes(g))].map((g) => ({ value: g, label: g }));
  const topTabs = TOP_TABS;
  const lastEntry = latestEntry(model.ENTRIES, {
    year: y.year, monthIndex: monthIdx,
    type: topTab === 'Income' ? 'income' : topTab === 'Investments' ? 'investment' : 'expense',
    // Oct 9 (Felipe): Expenses shows one sub-category at a time (Fixed first), so the line follows the one shown.
    group: topTab === 'Expenses' ? effType : null,
  });
  const color = GROUP_COLOR[effType] || 'var(--invest)';
  // What a row's "Add entry" adds to: the tab's kind, sub-category and the row's group.
  const rowTarget = (block, it) => (effType === 'Income' || effType === 'Investments'
    ? { type: effType === 'Income' ? 'income' : 'investment', group: block.group || null, cat: null, item: it.item }
    : { type: 'expense', group: effType, cat: block.category, item: it.item });
  // Always the user's order (the year's categories), never re-sorted by amount: bars and the list below match.
  const rows = bd.rows;
  const maxV = Math.max(1, ...rows.map((r) => r.amount));

  const counter = (row) => {
    const total = (row.noteEntries ? row.noteEntries.length : 0) + (row.entries ? row.entries.length : 0);
    const hasBase = row.isEstimate || row.deleted || Math.abs(row.baseAmount || 0) > 0.004;
    if (!total && !hasBase) return null;
    const key = `${row.yearLabel}|${row.mi}|${row.type}|${row.group}|${row.category}|${row.item}`;
    const open = tip && tip.key === key;
    return (
      <EntryCounter variant={row.deleted ? 'removed' : !total && row.isEstimate ? 'icon' : row.isEstimate ? 'estimate' : undefined} open={open}
        onClick={(ev) => { ev.stopPropagation(); setTip(open ? null : { key, row, cur, anchor: ev.currentTarget }); }}>
        {total || (row.deleted ? '×' : (row.isEstimate ? '≈' : '•'))}
      </EntryCounter>
    );
  };
  const toggleTip = (row, anchor) => {
    const key = `${row.yearLabel}|${row.mi}|${row.type}|${row.group}|${row.category}|${row.item}`;
    setTip(tip && tip.key === key ? null : { key, row, cur, anchor });
  };
  const state = (r) => (r.isEstimate ? 'estimate' : r.deleted ? 'removed' : undefined);
  // Phones (Tracker_Card_mobile 442:5153): the card stops at 555px with the Expander (DS 475:743) over its bottom;
  // "See all" opens the whole list; open, it reads "See less" (not drawn in Figma; kept, Felipe Sept 29).
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);
  const [tall, setTall] = useState(false);
  // The card's natural height, measured the same way whether it is clipped or not: the bottom of its last in-flow child
  // plus its bottom padding. (Oct 9: scrollHeight drops the bottom padding of a clipped box in Safari/WebKit, so a card
  // 557-580px tall flipped between collapsed and open forever: React error #185 on iPhones.)
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!mobile || !el) { setTall(false); return; }
    let bottom = 0;
    for (const c of el.children) {
      const pos = getComputedStyle(c).position;
      if (pos === 'absolute' || pos === 'fixed' || c.classList.contains('ds-expander')) continue;
      bottom = Math.max(bottom, c.offsetTop + c.offsetHeight);
    }
    const natural = bottom + (parseFloat(getComputedStyle(el).paddingBottom) || 0);
    setTall(natural > 555 + 1);
  });
  useEffect(() => { setExpanded(false); }, [breakdownType, monthIdx, y.year]);
  const collapsed = mobile && tall && !expanded;
  // Amount meter (211:18753, Oct 12): a 16px € beside the figure on desktop; phones (898:9152) a 20px one.
  const meterEuro = 16; // Oct 16: Amount meter 1023:38971 is a 16px € after the figure on phones too

  return (
    // Oct 16 (Ongatu 1028:49175 / 1013:33505): "Tracker" (Heading/XL) and its Actions (Medium round button) sit above
    // the card; the card starts with the Latest line, then the segments. The month stays in a visually hidden hint.
    <section className="tracker-section" aria-labelledby="tracker-title">
    <div className="tracker-head">
      <h2 className="tracker-title" id="tracker-title">Tracker</h2>
      {onAdjustBudget && model.canAdjustMonthBudget(y, monthIdx) && <TrackerMenu onAdjustBudget={onAdjustBudget} monthName={MONTH_NAMES[monthIdx]} />}
    </div>
    <div className={'card breakdown-card' + (collapsed ? ' is-collapsed' : '')} ref={cardRef}>
      <div className="visually-hidden" id="cat-hint">{`${y.months[monthIdx]} ${y.year}${eligible ? ' · projected' : ''}`}</div>
      <div className="bd-content">
        <div className="bd-controllers">
          {/* Oct 16 (1028:49182 / 1013:33086): the Latest line sits under the segments (and the Add button), full width. */}
          <div className="bd-interaction">
          <div className="bd-tabs-stack">
            <Segments id="breakdown-top-seg" options={topTabs} value={topTab}
              onChange={(v) => { v === 'Expenses' ? onTab(breakdownGroup, null) : onTab(v, null); }} />
            <Segments sub id="breakdown-group-seg" aria-label="Expense type" options={groupTabs} value={topTab === 'Expenses' ? effType : breakdownGroup} hidden={topTab !== 'Expenses'} onChange={(v) => onTab(v, v)} />
          </div>
          <Button id="tracker-add-btn" icon={plus} aria-pressed={addOpen ? 'true' : 'false'} onClick={onAdd}>
            {topTab === 'Income' ? 'Add income' : topTab === 'Investments' ? 'Add savings/investment' : 'Add expense'}
          </Button>
          </div>
          {lastEntry && <LatestEntry entry={lastEntry} currency={cur} mobile={mobile} />}
        </div>
        <div id="meters">
          {!bd.rows.length ? <div className="hint">Nothing recorded yet.</div>
            : bd.flat ? rows.map((r) => <Meter key={r.item} name={r.item} amount={r.amount} max={maxV} currency={cur} color={color} state={r.isEstimate ? 'estimate' : r.deleted ? 'removed' : undefined} counter={counter(r)} euroSize={meterEuro} />)
            : rows.map((r) => <Meter key={r.category} name={r.category} amount={r.amount} max={maxV} currency={cur} color={color} euroSize={meterEuro} />)}
        </div>
        <div id="itemslist" className="bd-list">
          {!bd.flat && bd.rows.length > 0 && rows.map((r, i) => (
            <FragmentDivider key={r.category} divider={i > 0}>
              <div className="bd-block">
                <div className="bd-block-title">{r.category}</div>
                {r.items.map((it) => (
                  <BreakdownRow key={it.item} name={it.item} amount={it.amount} currency={cur} state={state(it)} counter={counter(it)} euroSize={16}
                    amountLabel={`${it.item}: ${fmtMoney(it.amount, cur)}. ${counter(it) ? 'Show entries' : 'Add an entry'}`}
                    onAmount={(ev) => { ev.stopPropagation(); if (counter(it)) toggleTip(it, ev.currentTarget); else if (onAddItem) onAddItem(rowTarget(r, it)); }}
                    actions={<RowMenu item={it.item} onAdd={onAddItem ? () => onAddItem(rowTarget(r, it)) : null}
                      onAdjustBudget={onAdjustBudget && model.canAdjustMonthBudget(y, monthIdx) ? onAdjustBudget : null} />} />
                ))}
              </div>
            </FragmentDivider>
          ))}
        </div>
      </div>
      {mobile && tall && (
        <Expander open={expanded} onToggle={() => setExpanded((e) => !e)} controls="itemslist" id="tracker-expander" />
      )}
      <ItemTip tip={tip} actions={actions} />
    </div>
    </section>
  );
}
// The Tracker's Actions (Round button, Medium, Tertiary; Active while open) and its menu (Dropdown-list, Simple),
// right-aligned 8px under the button (Cost-tracker 2:2).
function TrackerMenu({ onAdjustBudget, monthName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return (
    <div className="bd-menu" ref={ref}>
      <RoundButton icon={actionsIcon} size="medium" id="tracker-menu-btn" label="Tracker actions" active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)} />
      {open && <MenuList id="tracker-menu" items={[{ key: 'budget', id: 'adjust-budget', label: monthName ? `Edit ${monthName}'s budget` : "Edit this month's budget", icon: edit, onSelect: () => { setOpen(false); onAdjustBudget(); } }]} />}
    </div>
  );
}
// A Tracker row's Actions (breackdown-row 124:3667): Micro Tertiary round button (Actions icon), Active while open; its
// menu is a Dropdown-list/Actions (663:935): the item's name as the description, then "Add entry" (the Add entry panel
// with this type picked) and, for months that can still be planned, "Adjust month's budget".
function RowMenu({ item, onAdd, onAdjustBudget }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const items = [
    onAdd && { key: 'add', label: 'Add entry', icon: plus, className: 'row-add', onSelect: () => { setOpen(false); onAdd(); } },
    onAdjustBudget && { key: 'budget', label: "Adjust month's budget", icon: edit, className: 'row-budget', onSelect: () => { setOpen(false); onAdjustBudget(); } },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <span className="br-actions" ref={ref}>
      <RoundButton icon={actionsIcon} size="micro" className="br-more" label={`Actions for ${item}`} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} />
      {open && <MenuList className="br-menu row-menu" description={item} items={items} />}
    </span>
  );
}
const FragmentDivider = ({ divider, children }) => <>{divider && <hr className="ds-divider" />}{children}</>;

// The Entries tooltip (Entry counter, Pressed): opens beside the counter, 4px away and centred on it; flips left
// when there's no room, and stays inside the window.
function ItemTip({ tip, actions }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!tip || !el) { setPos(null); return; }
    el.style.left = '0px'; el.style.top = '0px';
    const b = tip.anchor.getBoundingClientRect(), t = el.getBoundingClientRect(), gap = 4, margin = 8;
    let left = b.right + gap;
    if (left + t.width > window.innerWidth - margin) left = Math.max(margin, b.left - gap - t.width);
    let top = b.top + b.height / 2 - t.height / 2;
    top = Math.max(margin, Math.min(top, window.innerHeight - margin - t.height));
    setPos({ left: left + 'px', top: top + 'px' });
  }, [tip]);
  // Closing fades the tooltip out where it was, with what it showed: without its position it fell back into the page
  // flow (over the Tracker title) and faded there, the flash in Felipe's recording.
  const last = useRef(null);
  if (!tip) return <EntriesTooltip tipRef={ref} style={last.current ? last.current.style : undefined} footnote={last.current && last.current.foot} budget={last.current ? last.current.budget : null} budgetLabel={last.current ? last.current.budgetLabel : undefined} currency={last.current && last.current.cur}>{last.current && last.current.lines}</EntriesTooltip>;
  const { row, cur } = tip;
  const lines = [];
  if (row.deleted) {
    lines.push(<TooltipEntryItem key="base" name={row.isEstimate ? 'Estimate removed for this month' : 'Value removed for this month'}
      extra={<ActionLink icon={reload} className="tip-restore" onClick={(e) => { e.stopPropagation(); actions.restoreOverride(row.override ? row.override.id : ''); }}>Restore</ActionLink>} />);
  } else if (row.isEstimate && row.estimateSource === 'budget' && row.budget != null) {
    // Nothing recorded yet and a budget set: the header already shows it, so no line and no explanation.
  } else if (row.isEstimate) {
    let label, basis;
    if (row.estimateSource === 'sheet') { label = 'Pre-filled in the spreadsheet'; basis = 'not recorded yet'; }
    else if (row.estimateSource === 'budget') { label = 'Starting budget'; basis = 'not recorded yet'; }
    else { const n = row.estimateSamples || 0; label = 'Projected'; basis = n ? `avg of last ${n} real month${n === 1 ? '' : 's'}` : 'no history yet'; }
    lines.push(<TooltipEntryItem key="base" name={label} date={`(${basis})`} amount={row.amount} currency={cur} estimate prefix="≈" onRemove={() => actions.deleteBaseValue(row)} removeTitle="Delete this estimate" />);
  } else if (Math.abs(row.baseAmount || 0) > 0.004) {
    lines.push(<TooltipEntryItem key="base" name="From the spreadsheet" amount={row.baseAmount} currency={cur} onRemove={() => actions.deleteBaseValue(row)} removeTitle="Delete this value" />);
  }
  (row.importedCells || []).forEach((e) => lines.push(<TooltipEntryItem key={'c' + e.id} name="From your spreadsheet" amount={e.amount} currency={cur} onRemove={() => actions.deleteEntry(e.id)} removeTitle="Delete this value" />));
  const anyEstimateNote = (row.noteEntries || []).some((n) => n.isEstimate);
  (row.noteEntries || []).forEach((n, i) => lines.push(<TooltipEntryItem key={'n' + i} sub name={n.text} date={n.date || ''} amount={n.amount} currency={cur} estimate={n.isEstimate} prefix={n.isEstimate ? '~' : ''} />));
  // Show dated entries oldest first without changing the shared row's entry order.
  const chronologicalEntries = (row.entries || []).slice().sort((a, b) =>
    String(a.date || a.createdAt || '').slice(0, 10).localeCompare(String(b.date || b.createdAt || '').slice(0, 10))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  // Oct 11: on a shared board, entries other members added say who (e.g. "Sep 19 · Ana").
  chronologicalEntries.forEach((e) => lines.push(<TooltipEntryItem key={'e' + e.id} name={e.description || 'Manual entry'} date={[formatEntryDate(e.date), addedBy(e)].filter(Boolean).join(' · ')} amount={e.amount} currency={cur} onRemove={() => actions.deleteEntry(e.id)} removeTitle="Delete" />));
  const foot = anyEstimateNote ? "~ estimated (split evenly) — the sheet didn't record this one's exact amount"
    : (row.isEstimate && !row.deleted && !(row.estimateSource === 'budget' && row.budget != null)) ? '≈ projected from recent months — nothing recorded yet. Add a real entry to replace it, or delete it.' : null;
  const budgetLabel = row.type === 'income' ? 'Estimated' : 'Budget set';
  if (pos) last.current = { style: pos, lines, foot, budget: row.budget, budgetLabel, cur };
  return <EntriesTooltip tipRef={ref} visible={!!pos} style={pos || { left: '0px', top: '0px' }} footnote={foot} budget={row.budget} budgetLabel={budgetLabel} currency={cur}>{lines}</EntriesTooltip>;
}
// "Latest" line. Desktop (581:19517 / 787:14891): "Latest: route, date", Dot (10), then € and the figure in mono
// (Value/Medium), 8 apart, all link/disable. Phones (898:9193, Oct 12): "Last update: route", Dot (12), the date, then a
// 16px € and the figure as an Action link (14/16 sans, link/default), 4 apart.
function LatestEntry({ entry, currency, mobile }) {
  const route = [entry.item, entry.description].map((part) => part?.trim()).filter(Boolean).join('/') || 'Entry';
  const date = formatEntryDate(String(entry.date || entry.createdAt || '').slice(0, 10));
  const neg = entry.amount < 0;
  if (mobile) {
    return (
      <div className="tracker-last-entry is-phone" role="status">
        <span className="tle-text" title={`Last update: ${route}${date ? ` • ${date}` : ''}`}><span className="tle-route">{`Last update: ${route}`}</span></span>
        {date && <><span className="tle-dot" aria-hidden="true"><i /></span><span className="tle-date">{date}</span></>}
        <span className="tle-value">
          {currency === 'EUR'
            ? <><span className="tle-num">{(neg ? '-' : '') + fmtFigure(Math.abs(entry.amount))}</span><Icon icon={euro} size={12} className="tle-euro" /></>
            : <span className="tle-num">{`${fmtFigure(entry.amount)} ${currencySymbol(currency)}`}</span>}
        </span>
      </div>
    );
  }
  return (
    <div className="tracker-last-entry" role="status">
      {/* Oct 9: one line, whatever the length: the route shortens with an ellipsis; the date, Dot and figure stay. */}
      <span className="tle-text" title={`Latest: ${route}${date ? `, ${date}` : ''}`}><span className="tle-route">{`Latest: ${route}`}</span>{date && <span className="tle-date">{`, ${date}`}</span>}</span>
      <span className="tle-dot" aria-hidden="true"><i /></span>
      {currency === 'EUR'
        ? <><span className="tle-num">{(neg ? '-' : '') + fmtFigure(Math.abs(entry.amount))}</span><span className="tle-num">€</span></>
        : <span className="tle-num">{`${fmtFigure(entry.amount)} ${currencySymbol(currency)}`}</span>}
    </div>
  );
}
function formatEntryDate(iso) {
  const m = iso && iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10), day = parseInt(m[3], 10);
  return (month >= 1 && month <= 12 && day >= 1 && day <= 31) ? `${MONTH_ABBR[month - 1]} ${day}` : null;
}

// ---------------- Expense cards ----------------
export function ExpenseStrip({ model, y, monthIdx }) {
  const cur = y.currency;
  const c = model.computeMonth(y, monthIdx);
  const ind = cardIndicators(model, y, monthIdx);
  const DIR = { up: arrowStraightUp, down: arrowStraightDown, flat: minus };
  return (
    <div className="ticker-strip" id="ticker-strip">
      {spendParts(model, y, c).map(({ key: g, label, badge }) => {
        // Same rule as the Expenses card; a finished month reads "vs last month" (Ongatu 901:11367).
        const t = ind.group(g, 'last month');
        const delta = { icon: DIR[t.dir] || null, text: t.text, color: TONE_COLOR[t.tone], flat: t.dir === 'flat' };
        return <ExpenseCard key={g} name={label} initial={label[0]} badgeColor={badge} value={partValue(c, g)} currency={cur} delta={delta} />;
      })}
    </div>
  );
}

// ---------------- charts ----------------
function useTip() {
  const [tip, setTip] = useState(null);
  return [tip, setTip];
}
function tipPos(svgEl, svgX, svgY) {
  const rect = svgEl.getBoundingClientRect(); const vb = svgEl.viewBox.baseVal;
  return { left: (svgX * rect.width / vb.width) + 'px', top: (svgY * rect.height / vb.height) + 'px' };
}

// Income · Expenses · Savings (Cost-tracker trend chart: 774x220, rules at 20/77/133/190).
export function TrendChart({ model, y, monthIdx, onMonth }) {
  const cur = y.currency;
  const svgRef = useRef(null);
  const [tip, setTip] = useTip();
  // Oct 18 (211:18753 chart, 898:9152 phones): five rules from the top of the chart to its bottom, 165 high on desktop
  // (41 apart), 197 on phones (49 apart); the lines span the card on desktop and sit 16 in on phones, 2px strokes.
  // The svg fills the card's width at that fixed height (strokes do not scale).
  const mobile = useMobile();
  const W = mobile ? 310 : 766, H = mobile ? 197 : 165, padL = mobile ? 16 : 2, padR = padL, padT = mobile ? 49 : 29, padB = mobile ? 13 : 1;
  const rules = 5;
  const totals = { incomes: [], expenses: [], investments: [] };
  for (let i = 0; i < 12; i++) { const c = model.computeMonth(y, i); totals.incomes.push(c.income); totals.expenses.push(c.expenseTotal); totals.investments.push(c.invest); }
  const maxV = Math.max(1, ...totals.incomes, ...totals.expenses, ...totals.investments) * 1.15;
  const x = (i) => padL + i * ((W - padL - padR) / 11);
  const yScale = (v) => H - padB - (v / maxV) * (H - padT - padB);
  const populated = []; for (let i = 0; i < 12; i++) if (model.monthHasData(y, i)) populated.push(i);
  const firstPop = populated.length ? populated[0] : 0, lastPop = populated.length ? populated[populated.length - 1] : 0;
  const firstV = totals.incomes[firstPop] || 0, lastV = totals.incomes[lastPop] || 0;
  const pct = firstV !== 0 ? ((lastV - firstV) / Math.abs(firstV) * 100) : 0;
  const up = pct >= 0, since = y.months[firstPop].slice(0, 3);
  const color = { incomes: tok('--chart-income'), expenses: tok('--chart-expense'), investments: tok('--chart-invest') };
  const path = (vals) => vals.map((v, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + yScale(v).toFixed(1)).join(' ');
  const cw = (W - padL - padR) / 11;
  // Every size (211:18753, phones 898:9152, Oct 18): the three lines, the change Label and the three-item legend; no axis
  // letters, pins, point markers or month line.
  return (
    <div className={'card hero-chart' + (mobile ? ' is-compact' : '')}>
      <div className="hc-top">
        <div>
          <div className="hc-label">Incomes · Expenses · Savings</div>
        </div>
        {/* The title and the change Label (581:19554); phones (898:9152, Oct 18) put the Label 8 under the title. */}
        <Label type={up ? 'positive' : 'negative'} icon={up ? arrowStraightUp : arrowStraightDown} id="hero-delta" aria-label={`${up ? '+' : '-'}${Math.abs(pct).toFixed(1)}% since ${since}`}>
          {`${Math.abs(pct).toFixed(1)}% since ${since}`}
        </Label>
      </div>
      <div className="chart-wrap">
        <svg id="trend-chart" ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}>
          {Array.from({ length: rules }, (_, g) => { const gy = 0.5 + g * ((H - 1) / (rules - 1)); return <line key={'g' + g} className="gridline" x1="0" x2={W} y1={gy} y2={gy} vectorEffect="non-scaling-stroke" />; })}
          <path d={path(totals.expenses)} fill="none" stroke={color.expenses} strokeWidth="2" strokeOpacity="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path(totals.investments)} fill="none" stroke={color.investments} strokeWidth="2" strokeOpacity="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path(totals.incomes)} fill="none" stroke={color.incomes} strokeWidth="2" strokeOpacity="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={'r' + i} data-mi={i} x={x(i) - cw / 2} y={padT} width={cw} height={H - padT - padB} fill="transparent" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTip({ i, ...tipPos(svgRef.current, x(i), yScale(totals.incomes[i])) })} onMouseLeave={() => setTip((t) => t && { ...t, hide: true })}
              onClick={() => onMonth(i)} />
          ))}
        </svg>
        <div className="tooltip-chart" id="trend-tip" style={tip ? { left: tip.left, top: tip.top, opacity: tip.hide ? 0 : 1 } : undefined}>
          {tip && <><b>{y.months[tip.i]}</b><br />{`Income ${fmtMoney(totals.incomes[tip.i], cur)}`}<br />{`Expenses ${fmtMoney(totals.expenses[tip.i], cur)}`}<br />{`Savings ${fmtMoney(totals.investments[tip.i], cur)}`}</>}
        </div>
      </div>
      <div className="legend">
        <span><span className="swatch" style={{ background: 'var(--chart-income)' }} />Incomes</span>
        <span><span className="swatch" style={{ background: 'var(--chart-expense)' }} />Expenses</span>
        <span><span className="swatch" style={{ background: 'var(--chart-invest)' }} />Savings</span>
      </div>
    </div>
  );
}

// Year over year: annual totals per currency, so different currencies are never summed.
// Oct 18 (211:18753 desktop, 898:9152 phones): the section sits in the right column under the trend chart (phones: last);
// the title (Heading/XL) and its line (Body/Default/Regular), then one card per currency, stacked.
export function YearOverYear({ model, onYear }) {
  return (
    <section className="yoy-section" aria-labelledby="yoy-heading">
      <div className="yoy-head">
        <h2 className="yoy-heading" id="yoy-heading">Year over year</h2>
        <p className="yoy-sub">Annual totals, shown separately by currency, so different currencies are never summed together.</p>
      </div>
      <div className="yoy">
        {/* Oct 21: one card per currency the board's years use (SEK first as before, then the others). */}
        {['SEK', ...CURRENCY_CODES.filter((c) => c !== 'SEK')].filter((c) => model.DATA.some((y) => y.currency === c)).map((c) => <YoYCard key={c} model={model} cur={c} onYear={onYear} />)}
      </div>
    </section>
  );
}
// A card (211:18753 "chart"): the title, the chart (five rules; each year two bars 4 apart on the bottom rule, its label
// under it) and the Incomes / Expenses legend.
function YoYCard({ model, cur, onYear }) {
  const years = model.DATA.filter((y) => y.currency === cur);
  const wrapRef = useRef(null);
  const [tip, setTip] = useTip();
  const id = 'yoy-' + String(cur).toLowerCase(); // yoy-sek, yoy-eur (ids the tests use), yoy-gbp, yoy-brl
  const lbl = years.map((y) => y.year).sort();
  const title = lbl.length ? (lbl.length > 1 ? lbl[0] + '–' + lbl[lbl.length - 1] : lbl[0]) + ' · ' + cur : cur;
  const n = years.length;
  const inc = years.map(model.yearIncome), exp = years.map(model.yearExpense);
  const maxV = Math.max(1, ...inc, ...exp) * 1.1;
  const pct = (v) => `${Math.max(0, v / maxV * 100).toFixed(2)}%`;
  const show = (i, el) => {
    const w = wrapRef.current; if (!w || !el) return;
    const wr = w.getBoundingClientRect(), br = el.getBoundingClientRect();
    setTip({ i, left: (br.left + br.width / 2 - wr.left) + 'px', top: (br.top - wr.top) + 'px' });
  };
  const hide = () => setTip((t) => t && { ...t, hide: true });
  return (
    <div className="card yoy-card" hidden={n === 0}>
      <h2 id={id + '-title'}>{title}</h2>
      <div className="chart-wrap yoy-chart" ref={wrapRef}>
        <div className="yoy-rules" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className={'yoy-years' + (n > 3 ? ' is-dense' : '')} id={id} role="group" aria-labelledby={id + '-title'}>
          {years.map((y, i) => (
            <div className="yoy-year" key={y.year}>
              <div className="yoy-bars">
                {[['income', inc[i], 'Income'], ['expense', exp[i], 'Expenses']].map(([k, v, name]) => (
                  <span key={k} className={'yoy-bar is-' + k} data-i={i} style={{ height: pct(v) }} role="button" tabIndex={-1}
                    aria-label={`${y.year} ${name} ${fmtMoney(v, y.currency)}`}
                    onMouseEnter={(e) => show(i, e.currentTarget)} onMouseLeave={hide} onClick={() => onYear(model.DATA.indexOf(y))} />
                ))}
              </div>
              <span className="yoy-label">{y.year}</span>
            </div>
          ))}
        </div>
        <div className="tooltip-chart" id={id + '-tip'} style={tip ? { left: tip.left, top: tip.top, opacity: tip.hide ? 0 : 1 } : undefined}>
          {tip && years[tip.i] && <><b>{years[tip.i].year}</b><br />{`Income ${fmtMoney(inc[tip.i], years[tip.i].currency)}`}<br />{`Expenses ${fmtMoney(exp[tip.i], years[tip.i].currency)}`}</>}
        </div>
      </div>
      <div className="legend">
        <span><span className="swatch" style={{ background: 'var(--income)' }} />Incomes</span>
        <span><span className="swatch" style={{ background: 'var(--expense)' }} />Expenses</span>
      </div>
    </div>
  );
}
