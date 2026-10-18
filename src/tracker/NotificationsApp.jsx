'use client';
// Notifications page (Ongatu notifications-desktop 840:9143, dark 840:9327), laid out like the Account page: the App
// header, "Go to dashboard", the title, a side menu that filters the list (All / Unread, with counters) and a card with
// the notifications, divided by separators. The list is the header bell's (src/tracker/notifications.js), so the two
// never disagree; the page shares one useNotifications with the header. Phones (notifications-mobile 1070:74832, Oct 18):
// a full-screen surface/primary page with no app header or bottom nav: the back Round button, the title, the filters as
// tabs and the list.
import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import '../ui/okara.css';
import '../ui/shell.css';
import './notifications.css';
import { ActionLink, AppHeader, RoundButton, SideMenu } from '../ui/index.js';
import { arrowStraightLeft } from '../ui/icons.js';
import { AppSkeleton } from '../ui/Loading.jsx';
import { getMe } from './api.js';
import { AccountNav, NotificationEntry } from './AccountBar.jsx';
import { useBudgetAlertsStandalone } from './alerts.js';
import { alertHref, useNotifications } from './notifications.js';
import { useProfile } from './profile.js';
import { useAppNavigation } from './AppNavigation.jsx';

export default function NotificationsApp() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const profile = useProfile(me);
  const alerts = useBudgetAlertsStandalone();
  const n = useNotifications(me, alerts);

  useEffect(() => {
    getMe().then((m) => {
      if (m.status === 'pending') location.href = '/pending';
      else if (m.status === 'blocked') location.href = '/blocked';
      else setMe(m);
    }).catch(() => setLoadError(true));
  }, []);

  // The page shows every alert, like opening the bell: the bell's red dot goes.
  const { markSeen } = n;
  useEffect(() => { if (me) markSeen(); }, [me, markSeen]);

  useAppNavigation(me ? profile.image : undefined, () => router.push('/?add=1'));

  if (!me) return <AppSkeleton account error={loadError} />;
  const openAlert = (a) => router.push(alertHref(a));
  const shown = filter === 'unread' ? n.items.filter((it) => it.unread) : n.items;
  return (
    <>
      <div className="app-top-gap" />
      <AppHeader><AccountNav me={me} profile={profile} notifications={n} onOpenAlert={openAlert} /></AppHeader>
      <div className="wrap acct-page notif-page">
        <header className="acct-head">
          {/* Desktop (840:9143): "Back to dashboard"; phones (1070:74832): the Small Tertiary Round button (Arrow left). */}
          <ActionLink href="/" onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); router.push('/'); } }} size="medium" icon={arrowStraightLeft} id="notif-page-back">Back to dashboard</ActionLink>
          <div className="notif-mobile-nav"><RoundButton icon={arrowStraightLeft} size="small" iconSize={20} id="notif-page-back-mobile" label="Back to dashboard" onClick={() => router.push('/')} /></div>
          <h1 className="app-title">Notifications</h1>
        </header>
        <div className="acct-content notif-content">
          {/* Side menu (840:9150): All with the total, Unread with the notification-coloured counter. */}
          <SideMenu className="acct-menu notif-menu" label="Filter notifications" value={filter}
            items={[
              { key: 'all', id: 'notif-filter-all', label: 'All', count: n.items.length },
              { key: 'unread', id: 'notif-filter-unread', label: 'Unread', count: n.unreadCount, unread: true },
            ]}
            onSelect={(key) => setFilter(key)} />
          <section className="notif-card" id="notif-list" aria-labelledby="notif-card-title">
            {/* Card header (840:9152): "All notifications" / "Unread notifications" in Heading/XL. */}
            <h2 className="notif-card-title" id="notif-card-title">{filter === 'unread' ? 'Unread notifications' : 'All notifications'}</h2>
            <div className="notif-list">
              {shown.length
                ? shown.map((it, i) => (
                  <Fragment key={it.key}>
                    {i > 0 && <hr className="ds-divider notif-sep" />}
                    <div className={'notif-entry' + (it.unread ? ' is-unread' : '')}>
                      <NotificationEntry it={it} n={n} onOpenAlert={openAlert} idPrefix="notif-page-" />
                    </div>
                  </Fragment>
                ))
                : <div className="ds-notif-item ds-notif-empty"><div className="ds-notif-text">{filter === 'unread' ? 'No unread notifications.' : 'No notifications.'}</div></div>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
