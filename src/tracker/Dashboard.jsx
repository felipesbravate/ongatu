'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionLink, Button, MenuList, RoundButton, useDismiss, useMobile, EntriesTooltip, EntryCounter, ExpenseCard, KpiCard, Label, Meter, BreakdownRow, Segments, TooltipEntryItem, fmtMoney, fmtMoneyShort } from '../ui/index.js';
import { actions as actionsIcon, arrowStraightDown, arrowStraightUp, chevronDown, edit, minus, plus, reload } from '../ui/icons.js';
import { EXP_GROUPS, GROUP_COLOR, MONTH_ABBR } from './model.js';

const tok = (name) => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim());

// ---------------- left column ----------------
export function HeroLeft({ model, y, monthIdx }) {
  const cur = y.currency;
  const c = model.computeMonth(y, monthIdx);
  const prev = monthIdx > 0 ? model.computeMonth(y, monthIdx - 1) : null;
  const d = prev ? c.balance - prev.balance : 0;
  const tiles = [
    // Ongatu 211:18753 (Sept 28): "Incomes", and a static "↑ details" line under Incomes and Expenses (no action, per Felipe).
    { label: 'Incomes', value: c.income, color: 'var(--kpi-income)', indicator: arrowStraightUp, detail: 'details' },
    { label: 'Expenses', value: c.expenseTotal, color: 'var(--kpi-expense)', indicator: arrowStraightUp, detail: 'details' },
    // The Savings rate card folded into this tile (Cost-tracker 2:2, Sept 22).
    { label: 'Savings/Investments', value: c.invest, color: 'var(--kpi-invest)',
      detail: c.income > 0 ? `${Math.round(Math.max(0, Math.min(1, c.invest / c.income)) * 100)}% rate - ${fmtMoneyShort(c.invest, cur)} saved of ${fmtMoneyShort(c.income, cur)} Incomes` : 'No income recorded' },
  ];
  // Phones (Ongatu 342:7993, Sept 28): "Incomes", "Savings & Investments", and the rate as "↑ 8% rate of monthly Incomes".
  const mobile = useMobile();
  if (mobile) {
    tiles[2] = { ...tiles[2], label: 'Savings & Investments', indicator: c.income > 0 ? arrowStraightUp : null,
      detail: c.income > 0 ? `${Math.round(Math.max(0, Math.min(1, c.invest / c.income)) * 100)}% rate of monthly Incomes` : 'No income recorded' };
  }
  // Expense allocation
  const total = Math.max(1, c.expenseTotal);
  // At a glance
  let topGroup = EXP_GROUPS[0], topVal = -1;
  EXP_GROUPS.forEach((g) => { if (c.byGroup[g] > topVal) { topVal = c.byGroup[g]; topGroup = g; } });
  const sharePct = c.expenseTotal > 0 ? (topVal / c.expenseTotal * 100) : 0;
  const expChange = prev ? c.expenseTotal - prev.expenseTotal : null;
  return (
    <div className="hero-left">
      <div className="card balance-card">
        <div className="label">Balance this month</div>
        <div className="value" id="balance-value">{fmtMoney(c.balance, cur)}</div>
        <span className="pill-delta" id="balance-delta" style={prev ? { color: d >= 0 ? 'var(--good)' : 'var(--critical)' } : undefined}>
          {prev ? `${d >= 0 ? '↑' : '↓'} ${fmtMoneyShort(Math.abs(d), cur)} vs last month` : ''}
        </span>
        <span className="estimate-pill" id="balance-estimate-pill" hidden={!c.isEstimateMonth}>Projected — no data yet</span>
      </div>
      <div className="mini-grid" id="mini-kpis">
        {tiles.map((t) => <KpiCard key={t.label} label={t.label} dotColor={t.color} value={t.value} currency={cur} detail={t.detail} indicator={t.indicator} euroSize={16} />)}
      </div>
      <div className="card alloc-card">
        <h2>Expense allocation</h2>
        <div className="hint" id="alloc-hint">Share of this month's spend</div>
        <div className="alloc-bars" id="alloc-bars">
          {EXP_GROUPS.map((g) => {
            const pct = Math.max(0, c.byGroup[g] / total * 100);
            return (
              <div className="alloc-col" key={g}>
                <div className="alloc-pct">{pct.toFixed(0)}%</div>
                <div className="alloc-bar" style={{ height: `${Math.max(6, pct * 0.8).toFixed(1)}px`, background: g === 'Extra' ? 'var(--alloc-extra)' : GROUP_COLOR[g] }} />
                <div className="alloc-name">{mobile ? SHORT_GROUP[g] : g}</div>
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
const SHORT_GROUP = { Fixed: 'Fixed', Variable: 'Var', Extra: 'Extra', Additional: 'Add' };
const GROUP_TABS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
const topTabFor = (type) => ((type === 'Income' || type === 'Investments') ? type : 'Expenses');

export function TrackerCard({ model, y, monthIdx, breakdownType, breakdownGroup, onTab, onAdd, addOpen, tip, setTip, actions, onAdjustBudget }) {
  const cur = y.currency;
  const bd = model.buildBreakdown(y, monthIdx, breakdownType);
  const eligible = model.isFutureMonth(y, monthIdx);
  const topTab = topTabFor(breakdownType);
  const mobile = useMobile();
  const color = GROUP_COLOR[breakdownType];
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
  const state = (r) => (r.isEstimate ? 'estimate' : r.deleted ? 'removed' : undefined);
  // Phones (Tracker_Card_mobile 442:5153): the card stops at 555px with the Expander (DS 475:743) over its bottom;
  // "See all" opens the whole list. Expanded state and "See less" are not in the design (Claude's choice, to confirm).
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);
  const [tall, setTall] = useState(false);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!mobile || !el) { setTall(false); return; }
    setTall(el.scrollHeight > 555 + 1);
  });
  useEffect(() => { setExpanded(false); }, [breakdownType, monthIdx, y.year]);
  const collapsed = mobile && tall && !expanded;

  return (
    <div className={'card breakdown-card' + (collapsed ? ' is-collapsed' : '')} ref={cardRef}>
      <div className="bd-header">
        <div className="bd-title">
          <h2>Tracker</h2>
          <div className="hint" id="cat-hint">{`${y.months[monthIdx]} ${y.year}${eligible ? ' · projected' : ''}`}</div>
        </div>
        {onAdjustBudget && model.canAdjustMonthBudget(y, monthIdx) && <TrackerMenu onAdjustBudget={onAdjustBudget} />}
      </div>
      <div className="bd-content">
        <div className="bd-controllers">
          <div className="bd-tabs-stack">
            <Segments id="breakdown-top-seg" options={mobile ? TOP_TABS_MOBILE : TOP_TABS} value={topTab} onChange={(v) => onTab(v === 'Expenses' ? breakdownGroup : v, null)} />
            <Segments sub id="breakdown-group-seg" aria-label="Expense type" options={GROUP_TABS} value={breakdownGroup} hidden={topTab !== 'Expenses'} onChange={(v) => onTab(v, v)} />
          </div>
          <Button id="tracker-add-btn" icon={plus} aria-pressed={addOpen ? 'true' : 'false'} onClick={onAdd}>
            {topTab === 'Income' ? 'Add income' : topTab === 'Investments' ? 'Add savings/investment' : 'Add expense'}
          </Button>
        </div>
        <div id="meters">
          {!bd.rows.length ? <div className="hint">Nothing recorded yet.</div>
            : bd.flat ? rows.map((r) => <Meter key={r.item} name={r.item} amount={r.amount} max={maxV} currency={cur} color={color} state={r.isEstimate ? 'estimate' : r.deleted ? 'removed' : undefined} counter={counter(r)} euroSize={20} />)
            : rows.map((r) => <Meter key={r.category} name={r.category} amount={r.amount} max={maxV} currency={cur} color={color} euroSize={20} />)}
        </div>
        <div id="itemslist" className="bd-list">
          {!bd.flat && bd.rows.length > 0 && rows.map((r, i) => (
            <FragmentDivider key={r.category} divider={i > 0}>
              <div className="bd-block">
                <div className="bd-block-title">{r.category}</div>
                {r.items.map((it) => (
                  <BreakdownRow key={it.item} name={it.item} amount={it.amount} currency={cur} state={state(it)} counter={counter(it)} euroSize={16} />
                ))}
              </div>
            </FragmentDivider>
          ))}
        </div>
      </div>
      {mobile && tall && (
        <div className={'ds-expander' + (expanded ? ' is-open' : '')}>
          <Button variant="tertiary" icon={chevronDown} aria-expanded={expanded ? 'true' : 'false'} aria-controls="itemslist" id="tracker-expander" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'See less' : 'See all'}
          </Button>
        </div>
      )}
      <ItemTip tip={tip} actions={actions} />
    </div>
  );
}
// The Tracker's Actions (Round button, Medium, Tertiary; Active while open) and its menu (Dropdown-list, Simple),
// right-aligned 8px under the button (Cost-tracker 2:2).
function TrackerMenu({ onAdjustBudget }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return (
    <div className="bd-menu" ref={ref}>
      <RoundButton icon={actionsIcon} id="tracker-menu-btn" label="Tracker actions" active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)} />
      {open && <MenuList id="tracker-menu" items={[{ key: 'budget', id: 'adjust-budget', label: "Adjust month's budget", icon: edit, onSelect: () => { setOpen(false); onAdjustBudget(); } }]} />}
    </div>
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
  (row.entries || []).forEach((e) => lines.push(<TooltipEntryItem key={'e' + e.id} name={e.description || 'Manual entry'} date={formatEntryDate(e.date) || ''} amount={e.amount} currency={cur} onRemove={() => actions.deleteEntry(e.id)} removeTitle="Delete" />));
  const foot = anyEstimateNote ? "~ estimated (split evenly) — the sheet didn't record this one's exact amount"
    : (row.isEstimate && !row.deleted && !(row.estimateSource === 'budget' && row.budget != null)) ? '≈ projected from recent months — nothing recorded yet. Add a real entry to replace it, or delete it.' : null;
  const budgetLabel = row.type === 'income' ? 'Estimated' : 'Budget set';
  if (pos) last.current = { style: pos, lines, foot, budget: row.budget, budgetLabel, cur };
  return <EntriesTooltip tipRef={ref} visible={!!pos} style={pos || { left: '0px', top: '0px' }} footnote={foot} budget={row.budget} budgetLabel={budgetLabel} currency={cur}>{lines}</EntriesTooltip>;
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
  const prev = monthIdx > 0 ? model.computeMonth(y, monthIdx - 1) : null;
  return (
    <div className="ticker-strip" id="ticker-strip">
      {EXP_GROUPS.map((g) => {
        const v = c.byGroup[g];
        const d = prev ? v - prev.byGroup[g] : null;
        const delta = d === null ? null
          : Math.abs(d) < 0.005 ? { icon: minus, text: 'same as last month', color: 'var(--text-secondary)' }
          : { icon: d < 0 ? arrowStraightDown : arrowStraightUp, text: `${fmtMoneyShort(Math.abs(d), cur)} vs last month`, color: d < 0 ? 'var(--good)' : 'var(--critical)' };
        return <ExpenseCard key={g} name={g} initial={g[0]} badgeColor={g === 'Fixed' ? 'var(--badge-fixed)' : GROUP_COLOR[g]} value={v} currency={cur} delta={delta} />;
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
  const W = 774, H = 220, padL = 8, padR = 8, padT = 20, padB = 30;
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
  // Phones (Trend_Chart_Section 342:8068): "€3.900 Incomes avg" = the average income of the months that have data
  // (Felipe, Sept 28), two lines (Incomes, Expenses), no change chip. On every size (211:18753 too): no axis letters, pins,
  // point markers or month line.
  const mobile = useMobile();
  const incomeMonths = populated.filter((i) => totals.incomes[i] > 0);
  const avgIncome = incomeMonths.length ? incomeMonths.reduce((a, i) => a + totals.incomes[i], 0) / incomeMonths.length : 0;
  return (
    <div className={'card hero-chart' + (mobile ? ' is-compact' : '')}>
      <div className="hc-top">
        <div>
          <div className="hc-label">Incomes · Expenses · Savings</div>
          <div className="hc-value" id="hero-value">{mobile ? fmtMoneyShort(avgIncome, cur) + ' Incomes avg' : fmtMoneyShort(totals.incomes[monthIdx], cur) + ' Incomes'}</div>
        </div>
        {!mobile && <Label type={up ? 'positive' : 'negative'} icon={up ? arrowStraightUp : arrowStraightDown} id="hero-delta" aria-label={`${up ? '+' : '-'}${Math.abs(pct).toFixed(1)}% since ${since}`}>
          {`${Math.abs(pct).toFixed(1)}% since ${since}`}
        </Label>}
      </div>
      <div className="chart-wrap" style={{ marginTop: 16 }}>
        <svg id="trend-chart" ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {[0, 1, 2, 3].map((g) => { const gy = padT + g * ((H - padT - padB) / 3); return <line key={'g' + g} className="gridline" x1="0" x2={W} y1={gy} y2={gy} />; })}
                    <path d={path(totals.expenses)} fill="none" stroke={color.expenses} strokeWidth="1.75" strokeOpacity="1" strokeLinecap="round" strokeLinejoin="round" />
          {!mobile && <path d={path(totals.investments)} fill="none" stroke={color.investments} strokeWidth="1.75" strokeOpacity="1" strokeLinecap="round" strokeLinejoin="round" />}
          <path d={path(totals.incomes)} fill="none" stroke={color.incomes} strokeWidth="2.5" strokeOpacity="1" strokeLinecap="round" strokeLinejoin="round" />
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
        {!mobile && <span><span className="swatch" style={{ background: 'var(--chart-invest)' }} />Savings</span>}
      </div>
    </div>
  );
}

// Year over year: annual totals per currency, so different currencies are never summed.
export function YearOverYear({ model, onYear }) {
  return (
    <>
      <h2 className="yoy-heading">Year over year</h2>
      <div className="hint yoy-sub" style={{ marginBottom: 'var(--space-md)' }}>Annual totals, shown separately by currency, so different currencies are never summed together.</div>
      <div className="yoy">
        <YoYCard model={model} cur="SEK" onYear={onYear} />
        <YoYCard model={model} cur="EUR" onYear={onYear} />
      </div>
    </>
  );
}
function YoYCard({ model, cur, onYear }) {
  const years = model.DATA.filter((y) => y.currency === cur);
  const svgRef = useRef(null);
  const [tip, setTip] = useTip();
  const id = cur === 'SEK' ? 'yoy-sek' : 'yoy-eur';
  const lbl = years.map((y) => y.year).sort();
  const title = lbl.length ? (lbl.length > 1 ? lbl[0] + '–' + lbl[lbl.length - 1] : lbl[0]) + ' · ' + cur : cur;
  const W = 560, H = 220, padL = 44, padR = 14, padT = 14, padB = 28;
  const n = years.length;
  const inc = years.map(model.yearIncome), exp = years.map(model.yearExpense);
  const maxV = Math.max(1, ...inc, ...exp);
  const bw = n ? (W - padL - padR) / n : (W - padL - padR);
  const barW = bw * 0.32;
  const yScale = (v) => (v / maxV) * (H - padT - padB);
  return (
    <div className="card" hidden={n === 0}>
      <h2 id={id + '-title'}>{title}</h2>
      <div className="chart-wrap" style={{ marginTop: 'var(--space-md)' }}>
        <svg id={id} ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {n === 0 ? <text className="axis-label" x="20" y="20">No years in this currency</text> : <>
            {[0, 1, 2, 3, 4].map((g) => { const gy = padT + g * ((H - padT - padB) / 4); return <line key={g} className="gridline" x1={padL} x2={W - padR} y1={gy} y2={gy} />; })}
            {years.map((y, i) => {
              const cx = padL + i * bw + bw / 2, hInc = yScale(inc[i]), hExp = yScale(exp[i]);
              const bar = (bx, h, fill) => (
                <rect data-i={i} x={bx.toFixed(1)} y={(H - padB - h).toFixed(1)} width={barW.toFixed(1)} height={h.toFixed(1)} rx="4" fill={fill}
                  onMouseEnter={() => setTip({ i, ...tipPos(svgRef.current, bx + barW / 2, H - padB - h) })} onMouseLeave={() => setTip((t) => t && { ...t, hide: true })}
                  onClick={() => onYear(model.DATA.indexOf(y))} />
              );
              return (
                <g key={y.year}>
                  {bar(cx - barW - 2, hInc, 'var(--income)')}
                  {bar(cx + 2, hExp, 'var(--expense)')}
                  <text className="axis-label" x={cx.toFixed(1)} y={H - 10} textAnchor="middle">{y.year}</text>
                </g>
              );
            })}
          </>}
        </svg>
        <div className="tooltip-chart" id={id + '-tip'} style={tip ? { left: tip.left, top: tip.top, opacity: tip.hide ? 0 : 1 } : undefined}>
          {tip && <><b>{years[tip.i].year}</b><br />{`Income ${fmtMoney(inc[tip.i], years[tip.i].currency)}`}<br />{`Expenses ${fmtMoney(exp[tip.i], years[tip.i].currency)}`}</>}
        </div>
      </div>
    </div>
  );
}
