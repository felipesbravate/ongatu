'use client';
import { useEffect, useRef } from 'react';
import { Button, RoundButton } from './Button.jsx';
import { x } from './icons.js';

// An Okara illustration (src/ui/illustrations.js), `width` wide (64 in the Modal) with the height of its own
// proportions (Trash can 178x200 -> 64x72, as in the Cost-tracker delete modal). Drawn in surface/dark.
export function Illustration({ art, width = 64, className }) {
  if (!art) return null;
  const height = Math.round((width * art.height / art.width) * 100) / 100;
  return (
    <svg className={['ds-illustration', className].filter(Boolean).join(' ')} viewBox={art.viewBox} width={width} height={height} aria-hidden="true" data-illustration={art.name}>
      {art.paths.map((d, i) => <path key={i} d={d} fill="currentColor" />)}
    </svg>
  );
}

// Modal (DS Components 273:632, Sept 25). 540 wide, surface/primary, radius/md, shadow 0 0 8 ink@8%, padding 16/16/24/16,
// 40 between Header (Round button Small Tertiary, X), Content (padding 0 24, gap space/sm 12: optional 64px illustration,
// then Text = title Heading/Large + description Body/Medium/Medium, space/tn 4 apart, centred) and Actions (padding
// 0 space/2xl 48, Secondary + Primary Medium buttons 240 wide, 16 apart).
// `illustration` = an object from illustrations.js, or null to hide it (the "Illustration" boolean).
// primary/secondary = { label, onClick, disabled, id }; primary.destructive paints it action/destructive (the
// override on the Cost-tracker delete modal, 258:10267).
// Opens as a native <dialog> (focus trap, Escape closes, page behind inert).
export function Modal({ open, onClose, title, description, illustration, primary, secondary, id, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const titleId = id ? `${id}-title` : undefined;
  return (
    <dialog ref={ref} className="ds-modal" id={id} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose && onClose(); }}
      onClick={(e) => { if (e.target === ref.current && onClose) onClose(); }}>
      <div className="ds-modal-header"><RoundButton icon={x} size="small" label="Close" onClick={onClose} /></div>
      <div className="ds-modal-content">
        {illustration && <div className="ds-modal-title-block"><Illustration art={illustration} /></div>}
        <div className="ds-modal-text">
          <h2 className="ds-modal-title" id={titleId}>{title}</h2>
          {description && <p className="ds-modal-description">{description}</p>}
        </div>
        {children}
      </div>
      {(primary || secondary) && (
        <div className="ds-modal-actions">
          {secondary && <Button variant="tertiary" onClick={secondary.onClick} disabled={secondary.disabled} id={secondary.id}>{secondary.label}</Button>}
          {primary && <Button variant={primary.destructive ? 'destructive' : 'primary'} onClick={primary.onClick} disabled={primary.disabled} id={primary.id}>{primary.label}</Button>}
        </div>
      )}
    </dialog>
  );
}
