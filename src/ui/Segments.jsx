'use client';
import { useLayoutEffect, useRef } from 'react';

// Okara Segment tab 832:3325, Sub-segment tab 843:3824,
// Segments 832:3771 and Sub-segments 843:3935 share one moving selection surface.
export function Segments({ options, value, onChange, sub = false, id, className, ...rest }) {
  const root = useRef(null);
  const indicator = useRef(null);
  const positioned = useRef(false);

  useLayoutEffect(() => {
    const group = root.current;
    const pill = indicator.current;
    let disposed = false;
    const position = () => {
      if (disposed) return;
      const active = group.querySelector('button[aria-pressed="true"]:not([hidden])');
      if (!active || !active.offsetWidth || !group.offsetWidth) {
        pill.hidden = true;
        positioned.current = false;
        group.removeAttribute('data-positioned');
        return;
      }
      const height = active.offsetHeight + (sub ? 2 : 0);
      pill.hidden = false;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${height}px`;
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop - (sub ? 1 : 0)}px)`;
      if (!positioned.current) {
        // First paint and newly revealed groups snap into place; subsequent choices slide.
        pill.getBoundingClientRect();
        group.setAttribute('data-positioned', 'true');
        positioned.current = true;
      }
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(group);
    group.querySelectorAll('button').forEach((button) => observer.observe(button));
    document.fonts?.ready.then(position);
    return () => { disposed = true; observer.disconnect(); };
  });

  return (
    <div ref={root} className={['seg-tabs', 'seg-tabs--sliding', sub && 'sub', className].filter(Boolean).join(' ')} id={id} {...rest}>
      <span ref={indicator} className="seg-indicator" aria-hidden="true" hidden />
      {options.map((o) => (
        <button key={o.value} type="button" data-v={o.value} aria-pressed={o.value === value ? 'true' : 'false'} hidden={o.hidden || undefined}
          onClick={() => onChange && onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
