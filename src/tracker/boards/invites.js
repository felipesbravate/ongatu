'use client';
// Invites by email and the in-app invite notifications (Oct 13; server: src/lib/boards.js).
//   inviteApi.email(boardId, emails, role)  -> { invites: [{ id, email, role, status: 'sent' | 'member', mailed }] }
//   inviteApi.setRole(boardId, inviteId, role), inviteApi.mine(), inviteApi.accept(id), inviteApi.decline(id)
//   useBoardInvites(me) -> { items, accept, decline, reload } for the bell ("Ongatu - Invite notification" 973:26339):
//     items = [{ key, kind: 'board-invite', id, date, time, text, invite, busy }   "<who> invited you to join the “<board>” board."
//              { key, kind: 'board-accepted', id, date, time, text }]            "<name> accepted your invitation to join the “<board>” board."
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setActiveBoard } from '../api.js';
import { whenOf } from '../notifications.js';

const enc = encodeURIComponent;
export const inviteApi = {
  email: (boardId, emails, role = 'viewer') => api('POST', `/api/boards/${enc(boardId)}/invites/email`, { emails, role }),
  setRole: (boardId, inviteId, role) => api('PATCH', `/api/boards/${enc(boardId)}/invites/${enc(inviteId)}`, { role }),
  mine: () => api('GET', '/api/invites/mine'),
  accept: (id) => api('POST', `/api/invites/mine/${enc(id)}/accept`),
  decline: (id) => api('POST', `/api/invites/mine/${enc(id)}/decline`),
};

export function useBoardInvites(me) {
  const [data, setData] = useState({ invites: [], accepted: [] });
  const [busy, setBusy] = useState({});
  const reload = useCallback(async () => {
    if (!me) return;
    try { const r = await inviteApi.mine(); setData({ invites: r.invites || [], accepted: r.accepted || [] }); } catch { /* keep the last list */ }
  }, [me]);
  useEffect(() => { reload(); }, [reload]);
  const accept = useCallback(async (inv) => {
    setBusy((b) => ({ ...b, [inv.id]: true }));
    try { const r = await inviteApi.accept(inv.id); setActiveBoard(r.boardId, '/'); }
    catch { setBusy((b) => ({ ...b, [inv.id]: false })); reload(); }
  }, [reload]);
  const decline = useCallback(async (inv) => {
    setBusy((b) => ({ ...b, [inv.id]: true }));
    try { await inviteApi.decline(inv.id); } catch { /* gone already */ }
    setBusy((b) => ({ ...b, [inv.id]: false }));
    reload();
  }, [reload]);
  const items = useMemo(() => [
    ...data.invites.map((i) => ({ key: 'binv-' + i.id, kind: 'board-invite', id: 'binv-' + i.id, ...whenOf(i.createdAt), unread: true, invite: i, busy: !!busy[i.id],
      text: `${i.invitedBy || 'Someone'} invited you to join the “${i.boardName}” board.` })),
    ...data.accepted.map((a) => ({ key: `bacc-${a.boardId}-${a.userId}`, kind: 'board-accepted', id: `bacc-${a.boardId}-${a.userId}`, ...whenOf(a.at), unread: false,
      text: `${a.name || 'Someone'} accepted your invitation to join the “${a.boardName}” board.` })),
  ], [data, busy]);
  return { items, accept, decline, reload };
}
