'use client';
import { useEffect, useRef } from 'react';
import { Button, RoundButton } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { chevronDown, duo, settings, user2, x } from './icons.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// board-dropdown (Okara 1052:6292, Oct 15/17). The User nav's board switcher, 16 before the bell.
//   Desktop Default (1052:6291): a 220 slot (pl space/xs, py space/tn) with the pill on its right: 36 high, 1px
//     link/default border, pl space/xs pr space/sm, then, space/tn apart: the 12px chevron, the board name (Label/Tiny,
//     link/default) and the 16px icon (User 2 = personal, Duo = joint) (Oct 17 order). Hover (1053:1936): border and
//     name link/hover.
//   Mobile Default (1120:3757): the 12px chevron and the 16px icon space/xs apart, border/selected-item, pr space/sm, no
//     name on screen (kept for screen readers).
export function BoardDropdown({ id, name, kind = 'personal', open, onToggle, mobile, className, ...rest }) {
  return (
    <button type="button" id={id} className={cx('ds-board-dd', mobile && 'is-mobile', open && 'is-open', className)} aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'}
      onClick={onToggle} {...rest}>
      <Icon icon={chevronDown} size={12} className="ds-board-dd-chevron" />
      <span className={cx('ds-board-dd-name', mobile && 'visually-hidden')}>{name}</span>
      <Icon icon={kind === 'joint' ? duo : user2} size={16} className="ds-board-dd-icon" />
    </button>
  );
}

// board-dropdown, State=Active (Oct 17 re-read; the card sits in the Product header, so it uses the Mobile Surface).
//   Desktop (1053:1946): the pill grows into a 322 card in its place: surface/primary, border/secondary, radius/md,
//     padding space/md, gap space/lg, Floating shadow. Top row (py space/tn, pr space/tn, space/xs apart): the 12px
//     chevron turned up (closes), "Your boards" (Heading/Medium, fills the row), then a 24px Settings Round button.
//     The boards: menu-items space/xs apart (padding space/sm, gap space/sm, a 20px icon, Label/Default; the current one
//     surface/secondary + text/primary, the others text/secondary; a joint board carries its access as a Neutral
//     Label). Then, 10 apart and centred, the note (text/secondary) and "Create joint board" (Button Small Secondary,
//     full width).
//   Mobile (1120:3769): a sheet over the scrim (8 from the edges, radius 44, padding-bottom space/md): Top-nav 80 high
//     ("Your boards" Heading/Large + Settings as a Round button Small with a 20px icon, X on the right as a Round
//     button Medium), then the boards 12 apart, the note and "Create joint board" (Button Medium Secondary), 24 side
//     padding.
// boards = [{ id (null = personal), name, kind: 'personal' | 'joint', tag, current }].
// `title` (Oct 18): the heading, "Your boards" by default (Board settings' phone sheet shows "Select a board", 992:35130).
export function BoardSwitcher({ id = 'board-switcher', title = 'Your boards', boards, onPick, onCreate, onSettings, onClose, note, mobile, open = true }) {
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
      {!mobile && <button type="button" className="ds-bsw-collapse" id={id + '-close'} aria-label="Close board list" onClick={onClose}><Icon icon={chevronDown} size={12} /></button>}
      <div className="ds-bsw-title-row">
        <h2 className="ds-bsw-title" id={titleId} tabIndex={-1}>{title}</h2>
        {onSettings && <RoundButton icon={settings} size={mobile ? 'small' : 'micro'} iconSize={mobile ? 20 : 16} id="board-settings" label="Board settings" onClick={onSettings} />}
      </div>
      {mobile && <RoundButton icon={x} iconSize={24} id={id + '-close'} label="Close" onClick={onClose} />}
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
        {onCreate && <Button variant="secondary" size={mobile ? 'medium' : 'small'} className="ds-bsw-create" id="board-create-joint" onClick={onCreate}>Create joint board</Button>}
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
