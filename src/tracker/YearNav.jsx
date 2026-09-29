'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, MonthSelector, RoundButton, YearAddButton } from '../ui/index.js';
import { plus, x } from '../ui/icons.js';
import { Icon } from '../ui/Icon.jsx';
import { currentYearLabel } from './model.js';

// A year before the current one is history: it can't be deleted from here.
const isPastYear = (label) => { const n = parseInt(label, 10); return !isNaN(n) && n < parseInt(currentYearLabel(), 10); };

// Year tabs (newest first) with "+ Add year", and the month row (Nav tabs 59:850, Month selector 4:171).
export function YearNav({ model, yearIdx, monthIdx, onYear, onMonth, onAddYear, onDeleteYear, canSave, onAddingChange }) {
  const { DATA } = model;
  const y = DATA[yearIdx];
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (onAddingChange) onAddingChange(adding); }, [adding, onAddingChange]);

  return (
    <div className="actions-wrap">
      <div className={'actions-row' + (adding ? ' dimmed' : '')}>
        <div className="top-nav">
          <div className="years">
            <YearAddButton id="year-add-toggle" onClick={() => setAdding((a) => !a)} />
            <div className="year-tabs" id="years" role="tablist" aria-label="Year">
              {DATA.map((_, i) => i).reverse().map((i) => {
                const yr = DATA[i];
                return (
                  <div className="year-tab" key={yr.year}>
                    <button className="year-btn" role="tab" aria-pressed={i === yearIdx ? 'true' : 'false'} onClick={() => onYear(i)}>{yr.year}</button>
                    {yr.isExtra && yr.dbId && i === yearIdx && !isPastYear(yr.year) && (
                      <button type="button" className="year-del-btn" aria-label={'Delete ' + yr.year} onClick={(e) => { e.stopPropagation(); onDeleteYear(yr); }}>
                        <Icon icon={x} size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="months" id="months" role="tablist" aria-label="Month">
            {y.months.map((m, i) => {
              const future = model.isFutureMonth(y, i);
              const has = !future && model.monthHasData(y, i);
              return <MonthSelector key={m} label={m.slice(0, 3)} selected={i === monthIdx} state={future ? 'estimated' : has ? undefined : 'empty'} onSelect={() => onMonth(i)} />;
            })}
          </div>
        </div>
      </div>
      <AddYearPill open={adding} onClose={() => setAdding(false)} model={model} canSave={canSave}
        onSubmit={(label, currency) => { setAdding(false); onAddYear(label, currency); }} />
    </div>
  );
}

// Nav tabs - Add year (79:1242): close, year, currency, "Add year". It only validates; the Year budget panel creates the year.
function AddYearPill({ open, onClose, onSubmit, model, canSave }) {
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [status, setStatus] = useState(canSave ? null : { err: true, text: "This view can't save a new year (no database access)." });
  // The years that can be added: this year and the next ten, minus the ones that exist.
  const now = parseInt(currentYearLabel(), 10);
  const yearOptions = Array.from({ length: 11 }, (_, k) => String(now + k)).filter((l) => !model.DATA.some((y) => y.year === l)).map((l) => ({ value: l, label: l }));
  useEffect(() => { if (open) { setLabel(''); setStatus(null); } }, [open]);
  const submit = () => {
    const l = label.trim();
    if (!l) return setStatus({ err: true, text: 'Pick a year.' });
    if (model.DATA.some((y) => y.year === l)) return setStatus({ err: true, text: 'That year already exists.' });
    if (!canSave) return setStatus({ err: true, text: "Not connected — can't save a new year right now." });
    onSubmit(l, currency);
  };
  return (
    <div className={'year-add-pill' + (open ? ' open' : '')} id="year-add-panel" role="dialog" aria-label="Add a year">
      <RoundButton icon={x} size="small" id="year-add-cancel" label="Close" active onClick={onClose} />
      <div className="year-add-pill-inputs">
        <div className="year-add-pill-year">
          <Dropdown id="year-add-year" ariaLabel="Year" size="tiny" placeholder="Year" value={label} onChange={setLabel} options={yearOptions} />
        </div>
        <div className="year-add-pill-currency">
          <Dropdown id="year-add-currency" ariaLabel="Currency" size="tiny" value={currency} onChange={setCurrency} emptyOption={false}
            options={[{ value: 'EUR', label: 'EUR' }, { value: 'SEK', label: 'SEK' }]} />
        </div>
      </div>
      <Button size="tiny" icon={plus} iconSize={12} id="year-add-submit" onClick={submit}>Add year</Button>
      <span className={'add-status' + (status && status.err ? ' err' : '')} id="year-add-status">{status ? status.text : ''}</span>
    </div>
  );
}
