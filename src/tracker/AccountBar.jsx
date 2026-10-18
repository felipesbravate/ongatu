'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardDropdown, BoardSwitcher, Button, Notification, NotificationItem, UserMenu, UserNav, useDismiss, useMobile } from '../ui/index.js';
import { signOut as signOutIcon } from '../ui/icons.js';
import { getActiveBoard, listUsers, setActiveBoard, setUserStatus, signOut } from './api.js';
import { useNotifications } from './notifications.js';
import { ROLE_LABEL, boardSettingsHref, personalBoardName, startJointBoard, useBoards } from './boards.js';

// The first name the header greets: the account's email up to the first dot, dash, underscore or plus, capitalised
// ("felipe.sbravate@…" → "Felipe"). The account has no name field.
import { firstNameOf } from '../lib/names.js';
export { firstNameOf };

// One notification item, as the bell and the Notifications page show it. `onOpenAlert(alert)` = the alert's "View".
export function NotificationEntry({ it, n, onOpenAlert, onView, idPrefix = 'notif-' }) {
  if (it.kind === 'board-invite') {
    return (
      <NotificationItem date={it.date} time={it.time} id={idPrefix + it.id}
        ctas={[{ label: 'Accept', outline: true, id: `${idPrefix}${it.id}-accept`, disabled: it.busy, onClick: () => n.acceptInvite(it.invite) },
          { label: 'Decline', id: `${idPrefix}${it.id}-decline`, disabled: it.busy, onClick: () => n.declineInvite(it.invite) }]}>
        {it.text}
      </NotificationItem>
    );
  }
  if (it.kind === 'board-accepted') return <NotificationItem date={it.date} time={it.time} id={idPrefix + it.id}>{it.text}</NotificationItem>;
  if (it.kind === 'pending') {
    return (
      <NotificationItem date={it.date} time={it.time} id={idPrefix + it.id} action={{ label: 'Approve', onClick: () => n.approve(it.user), disabled: it.busy }}>
        {it.text}
      </NotificationItem>
    );
  }
  return (
    <NotificationItem date={it.date} time={it.time} id={idPrefix + it.id}
      onMarkRead={it.unread ? () => n.markRead(it.id) : undefined}
      action={onOpenAlert ? { label: 'View', onClick: () => { if (onView) onView(); onOpenAlert(it.alert); } } : undefined}>
      {it.text}
    </NotificationItem>
  );
}

// User nav (DS 230:618) in the page header: notifications (over-budget alerts; for an admin also accounts waiting for
// approval; src/tracker/notifications.js) and the user menu (Profile = the Account page, Admin for admins, Sign out).
// `profile` (useProfile) gives the name and picture.
// Choosing an item doesn't close the menu: it closes only from its top row (chevron, name, avatar) or a click outside.
// Profile on the Account page does nothing; Profile elsewhere and Sign out load another page with the menu open.
// `alerts` = model.budgetAlerts(); `onOpenAlert(alert)` shows that month and group on the dashboard. A page that also
// lists the notifications (the Notifications page) passes its own `notifications` (useNotifications) to share it.
export function AccountNav(props) {
  return props.notifications ? <AccountNavView {...props} n={props.notifications} /> : <AccountNavOwn {...props} />;
}

function AccountNavOwn(props) {
  const n = useNotifications(props.me, props.alerts);
  return <AccountNavView {...props} n={n} />;
}

function AccountNavView({ me, profile, onOpenAlert, n }) {
  const router = useRouter();
  const [open, setOpen] = useState(null); // 'notif' | 'user' | 'board' | null
  const [dialog, setDialog] = useState(null); // 'admin'
  const close = useCallback(() => setOpen(null), []);
  const boards = useBoards();

  if (!me) return null;
  const name = (profile && profile.name) || firstNameOf(me.email);
  // Main page - Active menus (2:2): Profile, Admin, Sign out. Profile keeps the id and the /account route.
  const items = [
    { key: 'account', id: 'menu-account', label: 'Profile', onSelect: () => { if (location.pathname !== '/account') router.push('/account'); } },
    ...(me.isAdmin ? [{ key: 'admin', id: 'menu-admin', label: 'Admin', onSelect: () => setDialog('admin') }] : []),
    { key: 'signout', id: 'menu-signout', label: 'Sign out', icon: signOutIcon, onSelect: () => signOut().then(() => { location.href = '/login'; }) },
  ];
  return (
    <>
      <UserNav board={<BoardMenu boards={boards} firstName={name} open={open === 'board'} onToggle={() => setOpen((o) => (o === 'board' ? null : 'board'))} onClose={close} />}>
        <Notification open={open === 'notif'} unread={n.hasNew} onClose={close} seeAllHref="/notifications"
          onToggle={() => { setOpen((o) => (o === 'notif' ? null : 'notif')); if (open !== 'notif') { n.reload(); n.markSeen(); } }}>
          {n.items.length
            ? n.items.map((it) => <NotificationEntry key={it.key} it={it} n={n} onOpenAlert={onOpenAlert} onView={close} />)
            : <div className="ds-notif-item ds-notif-empty"><div className="ds-notif-text">No notifications.</div></div>}
        </Notification>
        <UserMenu name={name} image={profile && profile.image} open={open === 'user'} onClose={close} onToggle={() => setOpen((o) => (o === 'user' ? null : 'user'))} items={items} />
      </UserNav>
      {dialog === 'admin' && <UsersDialog onClose={() => { setDialog(null); n.reload(); }} />}
    </>
  );
}

// Board switcher (board-dropdown, Okara 1052:6292; Ongatu 961:27593 desktop / 981:13985 phones, Oct 15): the pill in
// the User nav names the board shown; it opens "Your boards": the personal board, the joint boards (with my access as a
// tag), the Settings gear (the shown joint board's settings, or the first one's) and "Create joint board". Desktop: the
// pill grows into a card in place; phones: a sheet. Picking a board reloads onto it (setActiveBoard).
export function boardSwitcherProps(boards, firstName) {
  const activeId = getActiveBoard();
  const list = boards.boards || [];
  const current = activeId ? list.find((b) => b.id === activeId) || null : null;
  const settingsFor = current || list[0] || null;
  return {
    current,
    boards: [
      { id: null, name: personalBoardName(firstName), kind: 'personal', current: !current },
      ...list.map((b) => ({ id: b.id, name: b.name, kind: 'joint', tag: b.role === 'co_owner' ? 'Owner' : ROLE_LABEL[b.role], current: b.id === activeId })),
    ],
    onPick: (id) => { if ((id || null) !== (activeId || null)) setActiveBoard(id, '/'); },
    onCreate: startJointBoard,
    onSettings: () => location.assign(boardSettingsHref(settingsFor && settingsFor.id)),
    note: 'Your personal board data stays private.',
  };
}

function BoardMenu({ boards, firstName, open, onToggle, onClose }) {
  const ref = useRef(null);
  const mobile = useMobile();
  useDismiss(open && !mobile, ref, onClose);
  const { current, ...p } = boardSwitcherProps(boards, firstName);
  const name = current ? current.name : personalBoardName(firstName);
  return (
    <div className={'ds-board-menu' + (open ? ' is-open' : '') + (mobile ? ' is-mobile' : '')} ref={ref}>
      <BoardDropdown id="board-dd" name={name} kind={current ? 'joint' : 'personal'} mobile={mobile} open={open} onToggle={onToggle} />
      <BoardSwitcher {...p} mobile={mobile} open={open} onClose={onClose} />
    </div>
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
