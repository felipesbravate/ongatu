'use client';
import { useEffect, useRef } from 'react';
import { Button, RoundButton } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { chevronDown, duo, settings, user2, x } from './icons.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// board-dropdown (Okara 1052:6292, Oct 15). The User nav's board switcher, 16 before the bell.
//   Desktop Default (1052:6291): a 220 slot (pl space/xs, py space/tn) with the pill on its right: 36 high, 1px
//     border/selected-item, pl space/xs pr space/sm, the 16px icon (Oct 16, 1052:6292) (User 2 = personal, Duo = joint), the board name
//     (Label/Tiny, link/default) and a 12px chevron, space/tn apart. Hover (1053:1936): border link/disable, name link/hover.
//   Mobile Default (1120:3757, Oct 16): the 16px icon and the 12px chevron space/xs apart, pr space/sm, no name on screen (kept for screen readers).
export function BoardDropdown({ id, name, kind = 'personal', open, onToggle, mobile, className, ...rest }) {
  return (
    <button type="button" id={id} className={cx('ds-board-dd', mobile && 'is-mobile', open && 'is-open', className)} aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'}
      onClick={onToggle} {...rest}>
      <Icon icon={kind === 'joint' ? duo : user2} size={16} className="ds-board-dd-icon" />
      <span className={cx('ds-board-dd-name', mobile && 'visually-hidden')}>{name}</span>
      <Icon icon={chevronDown} size={12} className="ds-board-dd-chevron" />
    </button>
  );
}

// board-dropdown, State=Active.
//   Desktop (1053:1946): the pill grows into a card in its place: surface/primary, border/secondary, radius/md, padding
//     space/md, gap space/lg, Floating shadow. Top row: "Your boards" (Heading/Medium) + a 24px Settings Round button,
//     the chevron turned up on the right. The boards (menu-items 4 apart: 24px icon, Label/Medium; the current one
//     surface/secondary + text/primary, the others text/secondary; a joint board carries its access as a Neutral Label).
//     Then, 10 apart and centred, the note (Body/Small/Regular, text/secondary) and "Create joint board" (Button Tiny
//     Secondary, full width).
//   Mobile (1120:3769): a sheet over the scrim (8 from the edges, radius 44, padding-bottom space/md): Top-nav 80 high
//     ("Your boards" Heading/Large + Settings, X on the right, Round buttons Medium), then the boards 12 apart, the note
//     and "Create joint board" (Button Medium Secondary), 24 side padding.
// boards = [{ id (null = personal), name, kind: 'personal' | 'joint', tag, current }].
export function BoardSwitcher({ id = 'board-switcher', boards, onPick, onCreate, onSettings, onClose, note, mobile, open = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!mobile) return;
    const d = ref.current; if (!d) return;
    if (open) {
      d.classList.remove('is-closing');
      if (!d.open) {
        d.showModal();
        d.querySelector('.ds-bsw-title')?.focus({ preventScroll: true });
      }
      return;
    }
    if (!d.open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { d.close(); return; }
    d.classList.add('is-closing');
    const timer = setTimeout(() => { d.classList.remove('is-closing'); d.close(); }, 200);
    return () => clearTimeout(timer);
  }, [mobile, open]);
  if (!mobile && !open) return null;
  const titleId = id + '-title';
  const head = (
    <div className="ds-bsw-head">
      <div className="ds-bsw-title-row">
        <h2 className="ds-bsw-title" id={titleId} tabIndex={-1}>Your boards</h2>
        {onSettings && <RoundButton icon={settings} size={mobile ? 'medium' : 'micro'} iconSize={20} id="board-settings" label="Board settings" onClick={onSettings} />}
      </div>
      {mobile
        ? <RoundButton icon={x} iconSize={20} id={id + '-close'} label="Close" onClick={onClose} />
        : <button type="button" className="ds-bsw-collapse" id={id + '-close'} aria-label="Close board list" onClick={onClose}><Icon icon={chevronDown} size={12} /></button>}
    </div>
  );
  const body = (
    <div className="ds-bsw-body">
      <div className="ds-bsw-list" role="menu" aria-labelledby={titleId}>
        {boards.map((b) => (
          <button key={b.id || 'personal'} type="button" role="menuitemradio" aria-checked={b.current ? 'true' : 'false'} id={'board-pick-' + (b.id || 'personal')}
            className={cx('ds-bsw-item', b.current && 'is-selected')} onClick={() => onPick && onPick(b.id || null)}>
            <Icon icon={b.kind === 'joint' ? duo : user2} size={20} />
            <span className="ds-bsw-name">{b.name}</span>
            {b.tag && <span className="ds-bsw-tag">{b.tag}</span>}
          </button>
        ))}
      </div>
      <div className="ds-bsw-cta">
        {note && <p className="ds-bsw-note">{note}</p>}
        {onCreate && <Button variant="secondary" size={mobile ? 'medium' : 'tiny'} className="ds-bsw-create" id="board-create-joint" onClick={onCreate}>Create joint board</Button>}
      </div>
    </div>
  );
  if (mobile) {
    return (
      <dialog ref={ref} className="ds-bsw is-sheet" id={id} aria-labelledby={titleId}
        onCancel={(e) => { e.preventDefault(); if (onClose) onClose(); }}
        onClick={(e) => { if (e.target === ref.current && onClose) onClose(); }}>
        <div className="ds-bsw-sheet">{head}{body}</div>
      </dialog>
    );
  }
  return <div className="ds-bsw is-card" id={id} role="dialog" aria-labelledby={titleId}>{head}{body}</div>;
}
