'use client';
import { Icon } from './Icon.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

// menu-item (DS 304:528): 40 high, padding space/sm, radius/sm, 8 between an optional 20px icon and the label
// (Body/Medium/SemiBold). Unselected: text/secondary, icon surface/tertiary. Hover: text/primary, icon surface/dark.
// Selected: surface/secondary fill, text/primary, icon surface/dark. A link with `href`, otherwise a button.
// menu-item-counter (936:953): count badges have a separate unread color role.
export function MenuItemCounter({ children, unread = false, className }) {
  return <span className={cx('ds-menu-counter', unread && 'is-unread', className)}>{children}</span>;
}

export function MenuItem({ label, icon, selected, href, onClick, id, count, unread }) {
  const cls = cx('ds-menu-item', selected && 'is-selected');
  const inner = <>{icon && <Icon icon={icon} size={20} />}<span>{label}</span>{count != null && <MenuItemCounter unread={unread}>{count}</MenuItemCounter>}</>;
  const current = selected ? 'true' : undefined;
  return href
    ? <a href={href} id={id} className={cls} aria-current={current} onClick={onClick}>{inner}</a>
    : <button type="button" id={id} className={cls} aria-current={current} onClick={onClick}>{inner}</button>;
}

// Side menu (DS 304:553): menu-items stacked 4 apart (space/tn), 200 wide.
// items: [{ key, label, icon?, href?, id? }]; `value` = the selected key; onSelect(key, event).
export function SideMenu({ items, value, onSelect, label, className }) {
  return (
    <nav className={cx('ds-side-menu', className)} aria-label={label}>
      {items.map((it) => (
        <MenuItem key={it.key} id={it.id} label={it.label} count={it.count} unread={it.unread} icon={it.icon} href={it.href} selected={it.key === value}
          onClick={onSelect ? (e) => onSelect(it.key, e) : undefined} />
      ))}
    </nav>
  );
}
