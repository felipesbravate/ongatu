'use client';
import { Children, Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionLink, Button, RoundButton } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { MenuItemCounter } from './SideMenu.jsx';
import { arrowStraightLeft, bell, chevronDown } from './icons.js';
import { useMobile } from './useMobile.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// Closes a popover on a click outside `ref` (and `alsoRef`, e.g. a part rendered elsewhere) or on Escape.
export function useDismiss(open, ref, onClose, alsoRef) {
  useEffect(() => {
    if (!open) return;
    const inside = (r, t) => r && r.current && r.current.contains(t);
    // A click on something the click itself removed ("Mark as read" hides its own link) is not a click outside.
    const onDoc = (e) => { if (!e.target.isConnected) return; if (ref.current && !inside(ref, e.target) && !inside(alsoRef, e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, ref, onClose, alsoRef]);
}

// avatar (DS 221:1044, Oct 3): a circle in four sizes, 40 (default), 56, 80 and 112. Style=Text: surface/accent with
// the initial (Heading/Small, Medium, Large, XL); Style=Image: the picture, cropped to the circle. `large` = 80.
const AVATAR_SIZES = [40, 56, 80, 112];
export function Avatar({ name, image, large, size, className }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const px = AVATAR_SIZES.includes(size) ? size : (large ? 80 : 40);
  return (
    <span className={cx('ds-avatar', 's' + px, image && 'is-image', large && 'large', className)} aria-hidden="true">
      {image ? <img src={image} alt="" /> : initial}
    </span>
  );
}

// Menu of actions (Dropdown-list 182:6851, Type=Simple, made of dropdown-items 183:6858 with an optional left icon).
// items: [{ key, label, icon, onSelect, id }]. `bare` drops the list's own card (the user menu draws its own).
// dropdown-item (DS 183:6858): a 16px icon 8 before the label. `description` = Dropdown-list/Actions (663:935): a
// Body/Medium/Medium text/secondary line over the items, 8 apart.
// Non-bare lists are a drop-action (DS 801:1398 Mobile / 801:1400 Desktop, Oct 4): 200 wide, radius/md, surface/primary,
// border/secondary, shadow 0 0 8 ink@8%; items 36 high on phones (padding 16, Label/Small) and 32 on desktop (padding
// 12, Label/Tiny). `destructive: true` paints an item action/destructive.
export function MenuList({ items, bare, className, description, ...rest }) {
  return (
    <div className={cx(bare ? 'ds-menu-items' : 'ds-dd-menu ds-menu ds-drop-action', description && 'has-desc', className)} role="menu" {...rest}>
      {description && <div className="ds-dd-desc">{description}</div>}
      <div className="ds-dd-items">
        {items.map((it) => (
          <button key={it.key || it.label} id={it.id} type="button" role="menuitem" className={cx('ds-dd-item', it.icon && 'has-icon', it.destructive && 'is-destructive', it.className)} onClick={it.onSelect}>
            {it.icon && <Icon icon={it.icon} size="md" />}<span>{it.label}</span>{it.count != null && <MenuItemCounter unread={it.unread}>{it.count}</MenuItemCounter>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Keeps a popover mounted for its closing animation: 'open' | 'closing' | null.
function usePresence(open, ms = 200) {
  const [phase, setPhase] = useState(open ? 'open' : null);
  useEffect(() => {
    if (open) { setPhase('open'); return undefined; }
    setPhase((p) => (p ? 'closing' : null));
    const t = setTimeout(() => setPhase(null), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return phase;
}

// user (DS 221:1048): chevron + avatar (Hover: the pill fills action/secondary-hover). Active: the pill grows into a
// card with the first name (text/accent), the chevron turned up, and the menu (Account, Admin, Sign out). Clicking the
// card's top row, the avatar, outside it or Escape closes it; it shrinks back into the pill.
export function UserMenu({ name, image, open, onToggle, onClose, items }) {
  const ref = useRef(null);
  const phase = usePresence(open);
  useDismiss(open, ref, onClose);
  return (
    <div className={cx('ds-user', phase === 'open' && 'is-open', phase === 'closing' && 'is-closing')} ref={ref}>
      <button type="button" className="ds-user-trigger" id="user-menu-btn" aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} aria-label="Account menu" onClick={onToggle}>
        <span className="ds-user-info"><Icon icon={chevronDown} size={12} /><Avatar name={name} image={image} /></span>
      </button>
      {phase && (
        <div className={cx('ds-user-card', phase === 'closing' && 'is-closing')} id="user-menu">
          <button type="button" className="ds-user-info" aria-label="Close account menu" onClick={onClose}>
            <Icon icon={chevronDown} size={12} className="ds-user-chevron" /><span className="ds-user-name">{name}</span><Avatar name={name} image={image} />
          </button>
          <MenuList bare items={items} />
        </div>
      )}
    </div>
  );
}

// notification-item (DS 228:469, Oct 3): a header row (date · time in Body/Medium/SemiBold, the optional Micro Secondary
// action on the right, 16 apart), the text under it and — while the item is unread — the "Mark as read" link at the
// bottom. `onMarkRead` omitted = read (no link).
export function NotificationItem({ date, time, children, action, onMarkRead, id }) {
  return (
    <div className={'ds-notif-item' + (onMarkRead ? ' is-unread' : '')} id={id}>
      <div className="ds-notif-body">
        <div className="ds-notif-head">
          <div className="ds-notif-when"><span>{date}</span>{time && <><span className="ds-notif-dot" aria-hidden="true" /><span>{time}</span></>}</div>
          {action && <Button variant="secondary" size="micro" onClick={action.onClick} disabled={action.disabled}>{action.label}</Button>}
        </div>
        <div className="ds-notif-content">
          <div className="ds-notif-text">{children}</div>
        </div>
      </div>
      {onMarkRead && <ActionLink className="ds-notif-mark" onClick={onMarkRead}>Mark as read</ActionLink>}
    </div>
  );
}

// Notification (DS 228:455): bell (Round button, Small, Tertiary) with a red-orange dot when something is new.
// Active: the bell turns Active and the list opens below it, right-aligned.
// State=Mobile (407:905, Ongatu 381:6397): on a phone the bell opens a full page over the app: a 64px bar (back arrow =
// Round button Small Tertiary, "Notifications" in Heading/Large) and the items 12 apart with a divider between them.
export function Notification({ open, onToggle, onClose, unread, children }) {
  const ref = useRef(null);
  const pageRef = useRef(null);
  const mobile = useMobile();
  useDismiss(open, ref, onClose, pageRef);
  useEffect(() => {
    if (!(open && mobile)) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, mobile]);
  const items = Children.toArray(children).filter(Boolean);
  return (
    <div className={cx('ds-notif', open && 'is-open')} ref={ref}>
      <RoundButton icon={bell} size="small" active={open && !mobile} id="notif-btn" label={unread ? 'Notifications (new)' : 'Notifications'}
        aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} onClick={onToggle} />
      {unread && <span className="ds-notif-badge" aria-hidden="true" />}
      {open && !mobile && <div className="ds-notif-panel" id="notif-panel" role="dialog" aria-label="Notifications">{children}</div>}
      {open && mobile && createPortal(
        <div className="ds-notif-page" id="notif-panel" role="dialog" aria-modal="true" aria-labelledby="notif-page-title" ref={pageRef}>
          <div className="ds-notif-page-nav">
            <RoundButton icon={arrowStraightLeft} size="small" iconSize="lg" id="notif-back" label="Back" onClick={onClose} />
            <h2 className="ds-notif-page-title" id="notif-page-title">Notifications</h2>
          </div>
          <div className="ds-notif-page-list">
            {items.map((it, i) => <Fragment key={it.key || i}>{i > 0 && <hr className="ds-divider" />}{it}</Fragment>)}
          </div>
        </div>, document.body)}
    </div>
  );
}

// User nav (DS 230:618): the notification bell, then the user.
export function UserNav({ children }) {
  return <div className="ds-user-nav" id="user-nav"><div className="ds-user-nav-actions">{children[0]}</div>{children[1]}</div>;
}
