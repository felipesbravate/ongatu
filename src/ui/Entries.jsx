import { Icon } from './Icon.jsx';
import { x, chart } from './icons.js';
import { Money } from './Money.jsx';

// Entry counter (DS 146:5252): the small pill after an item's name. `open` = Pressed (its tooltip is showing).
// Type=Number: dark pill with the count (or a sign: ×, •). Type=Icon (354:553): nothing recorded yet, only a budget or an
// estimate: surface/secondary pill with a 10px Chart in surface/tertiary; Hover and Pressed swap the two colours.
// variant: undefined | 'icon' | 'estimate' (grey) | 'removed' (red).
export function EntryCounter({ variant, open, className, children, ...rest }) {
  const cls = ['note-count', variant === 'icon' && 'is-icon', variant === 'estimate' && 'is-estimate', variant === 'removed' && 'is-removed', open && 'is-open', className].filter(Boolean).join(' ');
  return <span className={cls} {...rest}>{variant === 'icon' ? <Icon icon={chart} size={12} /> : children}</span>;
}

// Tooltip entry item (DS 144:4426, Oct 3): 24 high, with no row gap: 12px Dot | name (Body/Large/SemiBold, white) + date
// (Body/Large/Medium, muted) 8 apart | 16px € + Value/Medium (4 apart) and the Micro round X, 8 apart.
export function TooltipEntryItem({ name, date, amount, currency, estimate, prefix, onRemove, removeTitle, extra, sub }) {
  return (
    <div className={'tip-item' + (sub ? ' sub' : '')}>
      <span className="tip-dot" />
      <span className="tip-left"><span className="tip-name">{name}</span>{date ? <span className="tip-date">{date}</span> : null}</span>
      <span className="tip-right">
        {amount != null && <span className={'tip-amount' + (estimate ? ' is-estimate' : '')}>{prefix || ''}<Money value={amount} currency={currency} iconSize={12} /></span>}
        {extra}
        {onRemove && (
          <button type="button" className="round-btn micro tip-del" title={removeTitle} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <Icon icon={x} size="sm" />
          </button>
        )}
      </span>
    </div>
  );
}

// Entries tooltip (the Entry counter's Pressed state): dark surface listing the entries behind a figure. With `budget`
// (the item's budget for the month) it starts with a "Budget set" header and a divider (146:5497).
// `budgetLabel` names it ("Budget set"; "Estimated" for income). With nothing under it, the divider is left out.
// With a header and nothing under it, the tooltip says "There's no entries yet." (354:618).
export function EntriesTooltip({ visible, style, footnote, children, tipRef, budget, budgetLabel = 'Budget set', currency }) {
  const hasLines = Array.isArray(children) ? children.length > 0 : !!children;
  const empty = budget != null && !hasLines && !footnote;
  return (
    <div id="note-tip" ref={tipRef} className={[visible && 'visible', empty && 'is-empty'].filter(Boolean).join(' ') || undefined} style={style}>
      {budget != null && (
        <>
          <div className="tip-head"><span className="tip-head-label">{budgetLabel}</span><span className="tip-head-amount"><Money value={budget} currency={currency} iconSize={16} /></span></div>
          <hr className="tip-head-divider" />
        </>
      )}
      {hasLines && <div className="tip-entries">{children}</div>}
      {empty && <div className="tip-empty">There's no entries yet.</div>}
      {footnote && <div className="tip-foot">{footnote}</div>}
    </div>
  );
}
