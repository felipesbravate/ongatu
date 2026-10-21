'use client';
// What the header bell and the Notifications page (Ongatu 840:9143) list, from one place so they never disagree:
// over-budget alerts (model.budgetAlerts) and, for an admin, accounts waiting for approval. Read state comes from
// useSeenAlerts (settings/notifications). An alert is unread until "Mark as read"; accounts waiting for approval have
// no read state (they leave the list once approved).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtMoney } from '../ui/index.js';
import { listUsers, setUserStatus } from './api.js';
import { useSeenAlerts } from './alerts.js';
import { useBoardInvites } from './boards/invites.js';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// When something happened, as the notification item shows it: "Sep 17" and "14:05" (no time for a date-only entry).
export function whenOf(iso) {
  if (!iso) return { date: '', time: '' };
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return { date: '', time: '' };
  return { date: `${MON[d.getMonth()]} ${d.getDate()}`, time: dateOnly ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

export const alertText = (a) => `${a.item} (${a.group}) is over budget in ${MON[a.mi]}: ${fmtMoney(a.spent, a.currency || 'EUR')} of ${fmtMoney(a.budget, a.currency || 'EUR')}.`;

// The dashboard URL that shows an alert's month and group (pages other than the dashboard link there).
export const alertHref = (a) => '/?alert=' + encodeURIComponent([a.year, a.mi, a.group, a.type || 'expense'].join('|'));

// `me` (getMe), `alerts` (model.budgetAlerts()). Returns { items, unreadCount, hasNew, markSeen, markRead, reload }.
// items: [{ key, kind: 'alert' | 'pending', id, date, time, text, unread, alert?, user?, approve?, busy? }], alerts first.
export function useNotifications(me, alerts = []) {
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState({});
  const [seen, markSeenIds, read, markRead] = useSeenAlerts();

  const reloadPending = useCallback(async () => {
    if (!me || !me.isAdmin) return;
    try { const r = await listUsers(); setPending((r.users || []).filter((u) => u.status === 'pending')); } catch { /* keep the last list */ }
  }, [me]);
  useEffect(() => { reloadPending(); }, [reloadPending]);

  const approve = useCallback(async (u) => {
    setBusy((b) => ({ ...b, [u.id]: true }));
    try { await setUserStatus(u.id, 'approve'); setPending((p) => p.filter((x) => x.id !== u.id)); }
    finally { setBusy((b) => ({ ...b, [u.id]: false })); }
  }, []);

  // Joint-board invites to my email and "X accepted your invitation" (Oct 15, 973:26339), newest kind first.
  const invites = useBoardInvites(me);
  const items = useMemo(() => [
    ...invites.items,
    ...alerts.map((a) => ({ key: a.id, kind: 'alert', id: a.id, ...whenOf(a.at), text: alertText(a), unread: !!read && !read.has(a.id), alert: a })),
    ...pending.map((u) => ({ key: u.id, kind: 'pending', id: u.id, ...whenOf(u.created_at), text: `${u.email} is waiting for your approval.`, unread: false, user: u, busy: !!busy[u.id] })),
  ], [invites.items, alerts, pending, read, busy]);

  const unreadCount = items.filter((it) => it.unread).length;
  // The bell's red dot: an account waiting, or an alert the bell hasn't shown yet.
  const hasNew = pending.length > 0 || invites.items.some((it) => it.kind === 'board-invite') || (!!seen && alerts.some((a) => !seen.has(a.id)));
  const markSeen = useCallback(() => markSeenIds(alerts.map((a) => a.id)), [markSeenIds, alerts]);
  const reload = useCallback(() => { reloadPending(); invites.reload(); }, [reloadPending, invites.reload]);
  return { items, unreadCount, hasNew, markSeen, markRead, reload, approve, acceptInvite: invites.accept, declineInvite: invites.decline };
}
