// New Okara components (DS Components 4:43, Oct 2). Sizes and colours are in okara.css (search the component name).
import { Icon } from './Icon.jsx';
import { checkmark, information, negativeOutlined, positiveFilled, warningOutlined, x, cancel } from './icons.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// Label 211:859 as a plain tag. type: neutral (default) | positive | negative | warning. size: regular | small.
export function Tag({ type, size, icon, className, children, ...rest }) {
  return (
    <span className={cx('ds-tag', type && type !== 'neutral' && type, size === 'small' && 'small', className)} {...rest}>
      {icon && <Icon icon={icon} size={size === 'small' ? 10 : 12} />}{children}
    </span>
  );
}

// chip-selector 540:785: a toggle chip. Hover over an unselected chip previews the X of "remove".
export function ChipSelector({ selected, onToggle, className, children, ...rest }) {
  return (
    <button type="button" aria-pressed={!!selected} className={cx('ds-chip', selected && 'is-selected', className)} onClick={onToggle} {...rest}>
      {selected ? <Icon icon={checkmark} size={10} /> : <span className="ds-chip-ring" />}
      {children}
    </button>
  );
}

// Step progress 543:798 with step 543:802. steps: [{ label, progress (0..1) }]; current: index of the step on going.
// Steps before it are Done (full bar, Positive/Filled icon), after it Idle (empty bar, ring in action/disable).
export function StepProgress({ steps, current, className }) {
  return (
    <ol className={cx('ds-steps', className)} aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'idle';
        const fill = state === 'done' ? 1 : state === 'idle' ? 0 : Math.max(0, Math.min(1, s.progress ?? 0.5));
        return (
          <li key={s.label} className={cx('ds-step', 'is-' + state)} aria-current={state === 'current' ? 'step' : undefined}>
            <div className="ds-step-bar"><div className="ds-step-fill" style={{ width: fill * 100 + '%' }} /></div>
            <div className="ds-step-label">{state === 'done' ? <Icon icon={positiveFilled} size={16} /> : <span className="ds-step-ring" />}<span>{s.label}</span></div>
          </li>
        );
      })}
    </ol>
  );
}

// Pager 543:823: one dot per page; the current one is wide. onGo(i) makes the dots buttons.
export function Pager({ count, current, onGo, className }) {
  return (
    <div className={cx('ds-pager', className)} role="tablist" aria-label="Pages">
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button" role="tab" aria-selected={i === current} aria-label={`Page ${i + 1} of ${count}`}
          className={cx('ds-pager-dot', i === current && 'is-current')} onClick={() => onGo && onGo(i)} tabIndex={onGo ? 0 : -1} />
      ))}
    </div>
  );
}

// list-selector: a selectable card. `label` = the Small Neutral tag beside the title; `action` = what a selected card
// shows instead of the description (the Tiny Action link "Sub-category +").
export function ListSelector({ title, description, label, selected, action, onSelect, className, ...rest }) {
  const body = (
    <div className="ds-list-sel-body">
      <div className="ds-list-sel-head"><span className="ds-list-sel-title">{title}</span>{label && <Tag size="small">{label}</Tag>}</div>
      {selected && action ? action : description && <span className="ds-list-sel-desc">{description}</span>}
    </div>
  );
  if (selected) return <div className={cx('ds-list-sel', 'is-selected', className)} aria-current="true" {...rest}>{body}</div>;
  return <button type="button" className={cx('ds-list-sel', className)} onClick={onSelect} {...rest}>{body}</button>;
}

// build-item 605:1358: a built row (Type over the name) with a Small Tertiary round button to remove it.
export function BuildItem({ type, name, onRemove, removeLabel }) {
  return (
    <div className="ds-build-item">
      <div className="ds-build-item-text"><span className="ds-build-item-type">{type}</span><span className="ds-build-item-name">{name}</span></div>
      {onRemove && <button type="button" className="round-btn small" aria-label={removeLabel || 'Remove ' + name} onClick={onRemove}><Icon icon={x} size="lg" /></button>}
    </div>
  );
}

// info 632:905: an inline message. message: neutral (default) | warning | danger.
const INFO_ICON = { neutral: cancel, warning: warningOutlined, danger: negativeOutlined };
export function InfoMessage({ message = 'neutral', title, children, icon, className, ...rest }) {
  return (
    <div className={cx('ds-info', message !== 'neutral' && message, className)} role={message === 'neutral' ? 'note' : 'alert'} {...rest}>
      <Icon icon={icon || INFO_ICON[message]} size={16} />
      <div className="ds-info-text">{title && <p className="ds-info-title">{title}</p>}{children && <p className="ds-info-desc">{children}</p>}</div>
    </div>
  );
}

// Info tooltip 634:1351: a 16px Information icon that shows `text` on hover or focus.
export function InfoTooltip({ text, className }) {
  return (
    <button type="button" className={cx('ds-info-tip', className)} aria-label={text}>
      <Icon icon={information} size={16} />
      <span className="ds-info-tip-bubble" role="tooltip">{text}</span>
    </button>
  );
}
