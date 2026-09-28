import { Icon } from './Icon.jsx';
import { Money } from './Money.jsx';

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
export function KpiCard({ label, dotColor, value, currency, detail, indicator, euroSize }) {
  return (
    <div className="mini-kpi">
      <div className="label"><span className="dot" style={{ background: dotColor }} />{label}</div>
      <div className="value"><Money value={value} currency={currency} iconSize={euroSize} /></div>
      {detail && <div className="detail">{indicator && <Icon icon={indicator} size={12} />}<span>{detail}</span></div>}
    </div>
  );
}

// Expense card (DS 130:3844): initial badge + name, the Value, and a details row
// (arrow icon + change, coloured by direction). delta: { icon, text, color } or null (shows —).
export function ExpenseCard({ name, initial, badgeColor, value, currency, delta }) {
  return (
    <div className="ticker-item">
      <div className="ti-top"><span className="ti-dot" style={{ background: badgeColor }}>{initial}</span><span className="ti-name">{name}</span></div>
      <div className="ti-val"><Money value={value} currency={currency} /></div>
      <div className="ti-delta" style={{ color: delta ? delta.color : 'var(--text-secondary)' }}>
        {delta ? <><Icon icon={delta.icon} size={12} /><span>{delta.text}</span></> : '—'}
      </div>
    </div>
  );
}

// Meter (DS): name + amount over a rounded track. state: undefined | 'estimate' | 'removed'. `counter` sits after the name.
export function Meter({ name, amount, max, currency, color, state, counter, euroSize }) {
  const pct = Math.max(0, Math.min(1, amount / max));
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
export function BreakdownRow({ name, amount, currency, state, counter, euroSize }) {
  return (
    <div className={'bd-row' + (state === 'estimate' ? ' is-estimate' : state === 'removed' ? ' is-removed' : '')}>
      <span className="bd-item-name">{name}{counter}</span>
      <span className="n">{state === 'estimate' ? '≈' : ''}<Money value={amount} currency={currency} iconSize={euroSize} /></span>
    </div>
  );
}

// progress-bar (DS 238:676): 8px surface/secondary track, a green gradient fill. `value` 0..1.
export function ProgressBar({ value, className, ...rest }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={['ds-progress', className].filter(Boolean).join(' ')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} {...rest}>
      <div className="ds-progress-fill" style={{ width: pct.toFixed(1) + '%' }} />
    </div>
  );
}
