'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';
import { chevronDown } from './icons.js';

// Dropdown (DS 182:6851 trigger, 183:6858 item, 71:1096 / 182:6850 list).
//
// options: a flat list [{ value, label }] or groups [{ group, options:[{ value, label }] }]; mixing is fine.
// An option's `selectedLabel` is what the closed trigger shows when it's chosen (e.g. menu "September", trigger "September 2026").
// A hidden native <select> with the same id stays in the DOM and holds the value, so forms, tests and
// anything reading `#id.value` keep working; setting it from outside and dispatching 'change' also works.
// The trigger gets id `${id}-trigger`: point the field's <label htmlFor> at it.
// onChange(value) fires when the value changes; onChoose(value) fires on every pick, even the same value.
// selectProps: extra attributes for the hidden select (e.g. data-f). emptyOption: keep a "no choice" option (the placeholder) in the hidden select; off for pickers that always have a value.
// `icon` = a leading icon in the trigger (Dropdown 71:1096 with Left icon: a guessed category shows Question / Outlined).
export function Dropdown({ id, value, onChange, onChoose, options, placeholder = 'Select', size = 'sm', disabled, ariaLabel, className, emptyOption = true, selectProps, icon, iconSize }) {
  const blocks = toBlocks(options);
  const flat = blocks.flatMap((b) => b.opts);
  const chosen = flat.find((o) => String(o.value) === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placeTick, setPlaceTick] = useState(0);
  const wrapRef = useRef(null), triggerRef = useRef(null), menuRef = useRef(null), byMouse = useRef(false);

  const close = useCallback(() => { setOpen(false); setActive(-1); }, []);
  const openMenu = () => {
    if (disabled || !flat.length) return;
    setOpen(true);
    const i = flat.findIndex((o) => o === chosen);
    setActive(i >= 0 ? i : 0);
  };
  const choose = (o) => {
    close();
    if (!chosen || String(o.value) !== String(chosen.value)) onChange && onChange(o.value);
    onChoose && onChoose(o.value);
  };

  useEffect(() => { if (disabled && open) close(); }, [disabled, open, close]);

  // Position the menu under (or above) the trigger, like the legacy place().
  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current, trigger = triggerRef.current;
    if (!menu || !trigger) return;
    const r = trigger.getBoundingClientRect();
    menu.style.setProperty('--dd-w', r.width + 'px');
    menu.style.maxHeight = '';
    const gap = 4, edge = 8, natural = menu.offsetHeight, mw = menu.offsetWidth;
    const below = window.innerHeight - r.bottom - gap - edge, above = r.top - gap - edge;
    let top, h;
    if (natural <= below || below >= above) { top = r.bottom + gap; h = Math.min(natural, below); } else { h = Math.min(natural, above); top = r.top - gap - h; }
    menu.style.maxHeight = Math.max(h, 80) + 'px';
    menu.style.top = Math.max(edge, top) + 'px';
    menu.style.left = Math.max(edge, Math.min(r.left, window.innerWidth - mw - edge)) + 'px';
  }, [open, placeTick]);

  // Close on outside pointer, page scroll or resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !wrapRef.current?.contains(e.target)) close(); };
    // A scroll that lands right after opening is the browser bringing a half-hidden trigger into view (focus on click):
    // it must not close the menu it just opened.
    const openedAt = performance.now();
    const onScroll = (e) => { if (menuRef.current?.contains(e.target)) return; if (performance.now() - openedAt > 250) close(); else setPlaceTick((t) => t + 1); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); };
  }, [open, close]);

  // Keep the highlighted option in view when moving with the keyboard.
  useEffect(() => {
    if (!open || active < 0) return;
    if (byMouse.current) { byMouse.current = false; return; }
    const menu = menuRef.current;
    const el = menu?.querySelectorAll('.ds-dd-item')[active];
    // Scroll the menu only: scrollIntoView would also scroll the panel behind it, and a scroll closes the menu.
    if (el) {
      const top = el.offsetTop, bottom = top + el.offsetHeight;
      if (top < menu.scrollTop) menu.scrollTop = top;
      else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
    }
  }, [open, active]);

  const onKeyDown = (ev) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(ev.key)) { ev.preventDefault(); openMenu(); }
      return;
    }
    const last = flat.length - 1;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => Math.min(last, a + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (ev.key === 'Home') { ev.preventDefault(); setActive(0); }
    else if (ev.key === 'End') { ev.preventDefault(); setActive(last); }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); const o = flat[active]; if (o) choose(o); else close(); }
    else if (ev.key === 'Tab') close();
  };

  const grouped = blocks.length > 1 || !!blocks[0]?.label;
  const label = chosen ? (chosen.selectedLabel || chosen.label) : placeholder;
  let k = -1;
  const menu = open && typeof document !== 'undefined' ? createPortal(
    <div ref={menuRef} className={'ds-dd-menu' + (grouped ? ' is-group' : '')} role="listbox" aria-labelledby={id ? id + '-trigger' : undefined}>
      {blocks.map((b, bi) => (
        <FragmentWithDivider key={bi} divider={bi > 0}>
          <div className="ds-dd-block" role="group" aria-label={b.label || undefined}>
            {b.label && <div className="ds-dd-group">{b.label}</div>}
            <div className="ds-dd-items">
              {b.opts.map((o) => {
                const i = ++k;
                return (
                  <div key={o.value} className={'ds-dd-item' + (i === active ? ' is-active' : '')} role="option" aria-selected={o === chosen ? 'true' : 'false'}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
                    onMouseMove={() => { if (i !== active) { byMouse.current = true; setActive(i); } }}>{o.label}</div>
                );
              })}
            </div>
          </div>
        </FragmentWithDivider>
      ))}
    </div>,
    // Inside a modal <dialog> (top layer) the menu must live in the dialog, or it renders under it and can't be clicked.
    (wrapRef.current && wrapRef.current.closest('dialog')) || document.body) : null;

  const cls = ['ds-dd', 'ds-dd--' + size, !chosen && 'is-empty', disabled && 'is-disabled', open && 'open', className].filter(Boolean).join(' ');
  return (
    <div ref={wrapRef} className={cls}>
      <select id={id} data-dd={size} tabIndex={-1} aria-hidden="true" aria-label={ariaLabel} value={chosen ? chosen.value : ''} disabled={disabled} {...selectProps}
        onChange={(e) => onChange && onChange(e.target.value)}>
        {emptyOption && <option value="">{placeholder}</option>}
        {blocks.map((b, bi) => b.label
          ? <optgroup key={bi} label={b.label}>{b.opts.map((o) => <option key={o.value} value={o.value} data-label={o.selectedLabel}>{o.label}</option>)}</optgroup>
          : b.opts.map((o) => <option key={o.value} value={o.value} data-label={o.selectedLabel}>{o.label}</option>))}
      </select>
      <button ref={triggerRef} type="button" className="ds-dd-trigger" id={id ? id + '-trigger' : undefined} aria-haspopup="listbox" aria-expanded={open ? 'true' : 'false'}
        aria-label={ariaLabel} title={chosen ? label : ''} disabled={disabled}
        onMouseDown={() => triggerRef.current && triggerRef.current.focus()} onClick={() => (open ? close() : openMenu())} onKeyDown={onKeyDown}>
        {icon && <Icon icon={icon} size={iconSize || (size === 'tiny' ? 'md' : 'lg')} className="ds-dd-lead" />}
        <span className="ds-dd-label">{label}</span>
        <span style={{ display: 'inline-flex' }}><Icon icon={chevronDown} size={12} /></span>
      </button>
      {menu}
    </div>
  );
}

function FragmentWithDivider({ divider, children }) {
  return <>{divider && <hr className="ds-divider" />}{children}</>;
}

function toBlocks(options) {
  const blocks = []; let loose = null;
  for (const o of options || []) {
    if (o.options) { loose = null; const opts = o.options.filter((x) => x.value !== '' && !x.hidden); if (opts.length) blocks.push({ label: o.group, opts }); }
    else if (o.value !== '' && !o.hidden) { if (!loose) { loose = { label: '', opts: [] }; blocks.push(loose); } loose.opts.push(o); }
  }
  return blocks;
}
