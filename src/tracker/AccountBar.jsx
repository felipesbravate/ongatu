'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notification, NotificationItem, UserMenu, UserNav, fmtMoney } from '../ui/index.js';
import { signOut as signOutIcon } from '../ui/icons.js';
import { listUsers, setUserStatus, signOut } from './api.js';
import { useSeenAlerts } from './alerts.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The first name the header greets: the account's email up to the first dot, dash, underscore or plus, capitalised
// ("felipe.sbravate@…" → "Felipe"). The account has no name field.
export { firstNameOf } from '../lib/names.js';

// When something happened, as the notification item shows it: "Sep 17" and "14:05" (no time for a date-only entry).
function whenOf(iso) {
  if (!iso) return { date: '', time: '' };
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return { date: '', time: '' };
  return { date: `${MON[d.getMonth()]} ${d.getDate()}`, time: dateOnly ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

// User nav (DS 230:618) in the page header: notifications (over-budget alerts; for an admin also accounts waiting for
// approval) and the user menu (Account page, Admin for admins, Sign out). `profile` (useProfile) gives the name and picture.
// Choosing an item doesn't close the menu: it closes only from its top row (chevron, name, avatar) or a click outside.
// Account on the Account page does nothing; Account elsewhere and Sign out load another page with the menu open.
// `alerts` = model.budgetAlerts(); `onOpenAlert(alert)` shows that month and group on the dashboard.
export function AccountNav({ me, profile, alerts = [], onOpenAlert }) {
  const [open, setOpen] = useState(null); // 'notif' | 'user' | null
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState({});
  const [dialog, setDialog] = useState(null); // 'admin'
  const close = useCallback(() => setOpen(null), []);
  const [seen, markSeen, read, markRead] = useSeenAlerts();

  const loadPending = useCallback(async () => {
    if (!me || !me.isAdmin) return;
    try { const r = await listUsers(); setPending((r.users || []).filter((u) => u.status === 'pending')); } catch { /* keep the last list */ }
  }, [me]);
  useEffect(() => { loadPending(); }, [loadPending]);

  if (!me) return null;
  const approve = async (u) => {
    setBusy((b) => ({ ...b, [u.id]: true }));
    try { await setUserStatus(u.id, 'approve'); setPending((p) => p.filter((x) => x.id !== u.id)); }
    finally { setBusy((b) => ({ ...b, [u.id]: false })); }
  };
  const name = (profile && profile.name) || firstNameOf(me.email);
  const items = [
    { key: 'account', id: 'menu-account', label: 'Account', onSelect: () => { if (location.pathname !== '/account') location.href = '/account'; } },
    ...(me.isAdmin ? [{ key: 'admin', id: 'menu-admin', label: 'Admin', onSelect: () => setDialog('admin') }] : []),
    { key: 'signout', id: 'menu-signout', label: 'Sign out', icon: signOutIcon, onSelect: () => signOut().then(() => { location.href = '/login'; }) },
  ];
  return (
    <>
      <UserNav>
        <Notification open={open === 'notif'} unread={pending.length > 0 || (!!seen && alerts.some((a) => !seen.has(a.id)))} onClose={close}
          onToggle={() => { setOpen((o) => (o === 'notif' ? null : 'notif')); if (open !== 'notif') { loadPending(); markSeen(alerts.map((a) => a.id)); } }}>
          {alerts.map((a) => {
            const w = whenOf(a.at);
            return (
              <NotificationItem key={a.id} date={w.date} time={w.time} id={'notif-' + a.id}
                onMarkRead={read && !read.has(a.id) ? () => markRead(a.id) : undefined}
                action={onOpenAlert ? { label: 'View', onClick: () => { setOpen(null); onOpenAlert(a); } } : undefined}>
                {`${a.item} (${a.group}) is over budget in ${MON[a.mi]}: ${fmtMoney(a.spent, 'EUR')} of ${fmtMoney(a.budget, 'EUR')}.`}
              </NotificationItem>
            );
          })}
          {pending.length
            ? pending.map((u) => {
              const d = new Date(u.created_at);
              const ok = !isNaN(d);
              return (
                <NotificationItem key={u.id} date={ok ? `${MON[d.getMonth()]} ${d.getDate()}` : ''} time={ok ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''}
                  action={{ label: 'Approve', onClick: () => approve(u), disabled: !!busy[u.id] }}>
                  {`${u.email} is waiting for your approval.`}
                </NotificationItem>
              );
            })
            : (!alerts.length && <div className="ds-notif-item ds-notif-empty"><div className="ds-notif-text">No notifications.</div></div>)}
        </Notification>
        <UserMenu name={name} image={profile && profile.image} open={open === 'user'} onClose={close} onToggle={() => setOpen((o) => (o === 'user' ? null : 'user'))} items={items} />
      </UserNav>
      {dialog === 'admin' && <UsersDialog onClose={() => { setDialog(null); loadPending(); }} />}
    </>
  );
}

function useModal(onClose) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return [ref, { onClose, onCancel: onClose }];
}

// Admin: every account, with Approve and Block.
function UsersDialog({ onClose }) {
  const [ref, handlers] = useModal(onClose);
  const [users, setUsers] = useState(null);
  useEffect(() => { listUsers().then((r) => setUsers(r.users || [])).catch(() => setUsers([])); }, []);
  const act = async (u, a) => { await setUserStatus(u.id, a); setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, status: a === 'approve' ? 'approved' : 'blocked' } : x))); };
  return (
    <dialog ref={ref} className="ct-dialog" id="users-dialog" {...handlers}>
      <h2 className="ct-dialog-title">Users</h2>
      {!users ? <p className="ct-dialog-text">Loading…</p> : users.map((u) => (
        <div key={u.id} className="ct-row">
          <span>{u.email + ' · ' + u.status}</span>
          <Button size="small" variant="secondary" onClick={() => act(u, 'approve')}>Approve</Button>
          <Button size="small" variant="secondary" onClick={() => act(u, 'block')}>Block</Button>
        </div>
      ))}
      <div className="ct-dialog-actions"><Button variant="tertiary" onClick={() => ref.current?.close()}>Close</Button></div>
    </dialog>
  );
}
