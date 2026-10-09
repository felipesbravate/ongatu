import { Icon } from './Icon.jsx';
import { Money } from './Money.jsx';
import { Input } from './Field.jsx';
import { euro, arrowStraightDown, arrowStraightUp, minus } from './icons.js';

// A comparison line (src/tracker/indicators.js): { head?, tone: good|bad|neutral, dir: up|down|flat|null, text }.
// The head stays text/secondary; the arrow and the comparison take the tone (Minus in surface/tertiary when flat).
export const TONE_COLOR = { good: 'var(--good)', bad: 'var(--critical)', neutral: 'var(--text-secondary)' };
const DIR_ICON = { up: arrowStraightUp, down: arrowStraightDown, flat: minus };
export function TrendLine({ trend, className = 'detail', id }) {
  const icon = DIR_ICON[trend.dir];
  return (
    <div className={className + ' is-trend'} id={id} data-tone={trend.tone}>
      {trend.head && <span className="trend-head">{trend.head}</span>}
      {trend.head && icon && <span className="trend-sep" aria-hidden="true">·</span>}
      <span className="trend-change" style={{ color: TONE_COLOR[trend.tone] }}>
        {icon && <Icon icon={icon} size={12} className={trend.dir === 'flat' ? 'trend-flat' : undefined} />}
        {(!trend.head || icon) && <span>{trend.text}</span>}
      </span>
    </div>
  );
}

// Card (DS): white surface, no border, 24px padding. Optional uppercase title and hint.
export function Card({ title, hint, hintId, className, children, ...rest }) {
  return (
    <div className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {title && <h2>{title}</h2>}
      {hint != null && <div className="hint" id={hintId}>{hint}</div>}
      {children}
    </div>
  );
}

export const Divider = (props) => <hr className="ds-divider" {...props} />;

// KPI card (DS 28:68): dot + uppercase label, the Value, an optional mono details line.
// `indicator` (Show indicator): a 12px arrow icon before the details, in surface/tertiary.
export function KpiCard({ label, dotColor, value, currency, detail, indicator, euroSize, trend }) {
  return (
    <div className="mini-kpi">
      <div className="label"><span className="dot" style={{ background: dotColor }} />{label}</div>
      <div className="value"><Money value={value} currency={currency} iconSize={euroSize} /></div>
      {trend ? <TrendLine trend={trend} />
        : detail && <div className="detail">{indicator && <Icon icon={indicator} size={12} />}<span>{detail}</span></div>}
    </div>
  );
}

// Expense card (DS 130:3844): initial badge + name, the Value, and a details row
// (arrow icon + change, coloured by direction). delta: { icon, text, color } or null (shows —).
export function ExpenseCard({ name, initial, badgeColor, value, currency, delta, euroSize = 16 }) {
  return (
    <div className="ticker-item">
      <div className="ti-top"><span className="ti-dot" style={{ background: badgeColor }}>{initial}</span><span className="ti-name">{name}</span></div>
      <div className="ti-val"><Money value={value} currency={currency} iconSize={euroSize} /></div>
      <div className="ti-delta" style={{ color: delta ? delta.color : 'var(--text-secondary)' }}>
        {delta ? <>{delta.icon && <Icon icon={delta.icon} size={12} className={delta.flat || delta.icon === minus ? 'trend-flat' : undefined} />}<span>{delta.text}</span></> : '—'}
      </div>
    </div>
  );
}

// Meter (DS): name + amount over a rounded track. state: undefined | 'estimate' | 'removed'. `counter` sits after the name.
export function Meter({ name, amount, max, currency, color, state, counter, euroSize = 16 }) {
  const pct = Math.max(0, Math.min(1, (max > 0 ? amount / max : 0)));
  return (
    <div className={'meter-row' + (state === 'estimate' ? ' is-estimate' : state === 'removed' ? ' is-removed' : '')}>
      <div className="meter-top">
        <span className="meter-name">{name}{counter}</span>
        <span className="meter-amt">{state === 'estimate' ? '≈' : ''}<Money value={amount} currency={currency} iconSize={euroSize} /></span>
      </div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${(pct * 100).toFixed(1)}%`, '--seg-color': color }} /></div>
    </div>
  );
}

// Breakdown row (DS 124:3667, Default): name (+ counter) and the right-aligned Value.
// `actions` = the row's Micro Tertiary round button with the Actions icon and its menu (124:3667, Oct 3: every variant).
// `onAmount` makes the figure the row's Medium Action link (581:19517: link/default).
export function BreakdownRow({ name, amount, currency, state, counter, euroSize, actions, onAmount, amountLabel, editing, editValue, onEditChange, onCommit, onCancel }) {
  const fig = <>{state === 'estimate' ? '≈' : ''}<Money value={amount} currency={currency} iconSize={euroSize} /></>;
  return (
    <div className={'bd-row' + (state === 'estimate' ? ' is-estimate' : state === 'removed' ? ' is-removed' : '')}>
      <span className="bd-item-name">{name}{counter}</span>
      {editing ? <Input size="tiny" className="bd-edit-input" icon={currency === 'EUR' || !currency ? euro : undefined}
        inputMode="decimal" aria-label={amountLabel || `Amount for ${name}`} value={editValue ?? ''}
        onChange={(e) => onEditChange?.(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommit?.(); } if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); } }} /> : onAmount
        ? <button type="button" className="n bd-amount-link" aria-label={amountLabel} onClick={onAmount}>{fig}</button>
        : <span className="n">{fig}</span>}
      {actions}
    </div>
  );
}

// Current Figma names; existing call sites keep their compatible exports.
export const AmountMeter = Meter;
export const TypeRow = BreakdownRow;

// progress-bar (DS 238:676): 8px surface/secondary track, a green gradient fill. `value` 0..1.
export function ProgressBar({ value, className, ...rest }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={['ds-progress', className].filter(Boolean).join(' ')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} {...rest}>
      <div className="ds-progress-fill" style={{ width: pct.toFixed(1) + '%' }} />
    </div>
  );
}
