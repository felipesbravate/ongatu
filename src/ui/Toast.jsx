'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoundButton } from './Button.jsx';
import { x } from './icons.js';

// Toast (DS 304:659, pinned Mobile): Type=Positive / Negative / Neutral. surface/dark, 1px border/secondary, radius/sm,
// Floating shadow, 320–400 wide, at least 64 high, 16 between parts. A 16px colour strip on the left (brand/mint,
// status/red-deep, surface/tertiary), the message in Body/Medium/Medium white, and a Micro round button with a 12px X
// (icon/muted) that closes it. Position (Ongatu 238:7184): top right,
// 24px from the right edge, 12px under the app header.
// type: 'success' (Positive) | 'fail' (Negative) | 'neutral'. `action` is an optional control before the X (the
// year-delete Undo); the DS Toast has no slot for it.
export function Toast({ type = 'success', visible, id = 'ds-toast', action, onClose, children }) {
  return (
    <div id={id} className={`ds-toast ${type}${visible ? ' visible' : ''}`} role="status">
      <span className="ds-toast-strip" aria-hidden="true" />
      <span className="ds-toast-msg">{children}</span>
      {action}
      {onClose && <RoundButton icon={x} size="micro" className="ds-toast-close" label="Close" onClick={onClose} />}
    </div>
  );
}

// useToast(): [element, show(message, type)]. Hides after 3.2s, or on its X.
export function useToast() {
  const [t, setT] = useState(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);
  const show = useCallback((message, type) => {
    clearTimeout(timer.current);
    setVisible(false);
    setT({ message, type: type === 'fail' || type === 'neutral' ? type : 'success', key: Date.now() });
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    timer.current = setTimeout(() => setVisible(false), 3200);
  }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setVisible(false); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const el = t ? <Toast key={t.key} type={t.type} visible={visible} onClose={hide}>{t.message}</Toast> : null;
  return [el, show];
}
