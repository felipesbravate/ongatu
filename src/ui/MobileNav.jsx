'use client';
import { Icon } from './Icon.jsx';
import { home, plus, user } from './icons.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// mobile-nav-item (DS 375:961). Type=Section: 104 x 56, radius/lg; Default shows the 24px icon (or a 24px round picture)
// only; Selected adds surface/accent-light behind it and the label in Label/Default/SemiBold, text/accent, 4px after the
// icon. Type=Action: the 40px primary Round button with the 20px Plus, in an 8px-padded 48px slot.
export function MobileNavItem({ type = 'section', icon, image, label, selected, href, onClick, id }) {
  if (type === 'action') {
    return (
      <span className="ds-mnav-action">
        <button type="button" className="round-btn primary" id={id} aria-label={label} onClick={onClick}><Icon icon={plus} size={24} /></button>
      </span>
    );
  }
  const inner = (
    <>
      {/* The selected background is its own layer so it can slide between tabs across page loads
          (cross-document View Transition "mnav-pill", see okara.css). */}
      {selected && <span className="ds-mnav-pillbg" aria-hidden="true" />}
      {image ? <img className="ds-mnav-img" src={image} alt="" /> : <Icon icon={icon} size={24} />}
      {selected && <span className="ds-mnav-label">{label}</span>}
    </>
  );
  const cls = cx('ds-mnav-item', selected && 'is-selected');
  return href
    ? <a className={cls} href={href} id={id} aria-label={label} aria-current={selected ? 'page' : undefined}>{inner}</a>
    : <button type="button" className={cls} id={id} aria-label={label} aria-current={selected ? 'page' : undefined} onClick={onClick}>{inner}</button>;
}

// mobile-bottom-nav (DS 378:673), Selection=Home | Account. A full-width pill (12px from the screen edges; surface/primary 88%,
// radius/full, space/xs sides and space/nav-padding-y top/bottom, Nav shadow 0 3 12 ink@12%) holding Home and Account
// (136 x 56 each) and the 48px Add action centred, over a 24px band that fades from transparent to white. Fixed to the bottom of the screen; phones only (hidden above 640px).
export function MobileBottomNav({ selection = 'home', onAdd, image, homeHref = '/', accountHref = '/account' }) {
  return (
    <nav className="ds-mnav" id="mobile-nav" aria-label="Main">
      <div className="ds-mnav-pill">
        <MobileNavItem icon={home} label="Home" selected={selection === 'home'} href={selection === 'home' ? undefined : homeHref}
          onClick={selection === 'home' ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined} id="mnav-home" />
        <MobileNavItem type="action" label="Add an entry" onClick={onAdd} id="mnav-add" />
        <MobileNavItem icon={user} image={image} label="Account" selected={selection === 'account'} href={selection === 'account' ? undefined : accountHref}
          onClick={selection === 'account' ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined} id="mnav-account" />
      </div>
    </nav>
  );
}
