import { Icon } from './Icon.jsx';
import { plus, x } from './icons.js';

// Round button (Secondary) that opens "Add a year" (Nav tabs 59:850).
export function YearAddButton(props) {
  // Nav tabs 59:850 (Oct 3): a Small Secondary Round button (36, border/dark, 20px plus), space/md before the tabs.
  return <button type="button" className="round-btn small secondary year-add-btn" title="Add a new year" aria-label="Add a new year" {...props}><Icon icon={plus} size="lg" /></button>;
}

// Tab (DS 53:801): one year. The selected, deletable year shows a Micro round button on hover.
export function YearTab({ label, selected, onSelect, onDelete }) {
  return (
    <div className="year-tab">
      <button className="year-btn" role="tab" aria-pressed={selected ? 'true' : 'false'} onClick={onSelect}>{label}</button>
      {onDelete && selected && (
        <button type="button" className="year-del-btn" aria-label={`Delete ${label}`} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Icon icon={x} size={10} />
        </button>
      )}
    </div>
  );
}

// Month selector (DS 4:171). state: undefined | 'estimated' (projected, dashed) | 'empty' (no data, faded).
export function MonthSelector({ label, selected, state, onSelect }) {
  return (
    <button className={'month-btn' + (state ? ' ' + state : '')} title={state === 'estimated' ? "Projected — this month hasn't happened yet" : ''}
      role="tab" aria-pressed={selected ? 'true' : 'false'} onClick={onSelect}>{label}</button>
  );
}
