'use client';
// "Board sharing" (Ongatu 970:18246 card 986:26987; the same block in "Share your board" 994:40586 and on phones
// 986:27262 / 994:52459). Co-owners only.
//   "Add email addresses" (one or more, separated by commas or spaces) + "Send invite" (Button Small Secondary, Send):
//     each address gets its own single-use invite, emailed with the link; someone who already has an account on that
//     address also finds it in the app's notifications. They show in the list as "Invite sent" until they join.
//   "Copy link" (Action link, Copy): a Viewer invitation link for anyone, copied to the clipboard.
//   "People with access · N": avatar, name, email, a Label ("You" Neutral, "Invite sent" Warning) and the access
//     dropdown (Tiny, 120 wide; mine disabled). Its menu: Viewer, Co-owner, Collaborator, then "Remove access"
//     (986:27011); on phones the menu is a sheet with the person on top (989:28776: top-nav 80, then the items 24 in).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionLink, Avatar, Button, Divider, Input, RoundButton, useDismiss, useMobile } from '../../ui/index.js';
import { Icon } from '../../ui/Icon.jsx';
import { chevronDown, copy as copyIcon, remove as removeIcon, send, x } from '../../ui/icons.js';
import { boardsApi } from '../api.js';
import { inviteApi } from './invites.js';
import { ACCESS_LABEL, ACCESS_MENU } from './parts.jsx';

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const splitEmails = (v) => [...new Set(String(v || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
const label = (p) => (p.you && p.role === 'co_owner' ? 'Owner' : ACCESS_LABEL[p.role]);

/** The board's people: members and open email invites, as the list shows them. */
export function useBoardPeople(boardId, canManage) {
  const [board, setBoard] = useState(null);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!boardId) return;
    try {
      const b = await boardsApi.get(boardId);
      setBoard(b); setError('');
      // Open email invites, minus addresses that are on the board already (they joined with a link meanwhile).
      const on = new Set(b.members.map((m) => String(m.email || '').toLowerCase()));
      if (b.role === 'co_owner' && canManage !== false) setInvites(((await boardsApi.invites(boardId)).invites || []).filter((i) => i.email && !on.has(i.email)));
      else setInvites([]);
    } catch (e) { setError(e.message || "Couldn't load the board."); }
  }, [boardId, canManage]);
  useEffect(() => { load(); }, [load]);
  return { board, invites, error, reload: load };
}

export function BoardSharing({ board, invites, reload, showToast, confirm, idPrefix = 'share' }) {
  const [emails, setEmails] = useState('');
  const [sending, setSending] = useState(false);
  const link = useRef(null); // { boardId, url }: one Viewer link per board while the page is open
  const list = splitEmails(emails);
  const valid = list.length > 0 && list.every((e) => EMAIL_RE.test(e));

  const copyLink = async () => {
    try {
      if (!link.current || link.current.boardId !== board.id) link.current = { boardId: board.id, ...(await boardsApi.createInvite(board.id, 'viewer')) };
      await navigator.clipboard.writeText(link.current.url);
      showToast('Link copied.', 'success');
    } catch (e) { showToast(e && e.message && e.code !== undefined ? e.message : "Couldn't copy the link.", 'fail'); }
  };
  const sendInvites = async () => {
    if (!valid) { showToast('Enter valid email addresses.', 'fail'); return; }
    setSending(true);
    try {
      const r = await inviteApi.email(board.id, list, 'viewer');
      const sent = r.invites.filter((i) => i.status === 'sent').map((i) => i.email);
      const already = r.invites.filter((i) => i.status === 'member').map((i) => i.email);
      if (sent.length) showToast(`Invite sent to ${sent.join(', ')}.`, 'success');
      else if (already.length) showToast(`${already.join(', ')} ${already.length === 1 ? 'is' : 'are'} already on this board.`, 'success');
      setEmails('');
      await reload();
    } catch (e) { showToast(e.message || "Couldn't send the invite.", 'fail'); }
    finally { setSending(false); }
  };

  const setRole = async (p, role) => {
    try {
      if (p.invite) await inviteApi.setRole(board.id, p.id, role);
      else await boardsApi.setRole(board.id, p.userId, role);
      showToast('Access changed.', 'success');
    } catch (e) { showToast(e.message || "Couldn't change the access.", 'fail'); }
    reload();
  };
  const removeAccess = (p) => confirm({
    title: p.invite ? `Cancel the invite to ${p.email}?` : `Remove ${p.name || p.email} from “${board.name}”?`,
    description: p.invite ? 'The invitation link stops working. You can invite them again later.' : 'They stop seeing this board. You can invite them again later.',
    confirmLabel: 'Remove access', busyLabel: 'Removing…',
    onConfirm: async () => {
      try {
        if (p.invite) await boardsApi.revokeInvite(board.id, p.id);
        else await boardsApi.removeMember(board.id, p.userId);
        showToast(p.invite ? 'Invite cancelled.' : 'Removed from the board.', 'success');
      } catch (e) { showToast(e.message || 'Something went wrong.', 'fail'); }
      await reload();
    },
  });

  const people = [
    ...board.members.map((m) => ({ key: m.userId, userId: m.userId, name: m.name, email: m.email, role: m.role, you: m.you })),
    ...invites.map((i) => ({ key: 'inv-' + i.id, id: i.id, invite: true, name: null, email: i.email, role: i.role })),
  ];
  return (
    <div className="jb-sharing">
      <div className="jb-sharing-input">
        <Input id={idPrefix + '-emails'} type="text" inputMode="email" autoComplete="off" value={emails} placeholder="Add email addresses" aria-label="Email addresses"
          onChange={(e) => setEmails(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendInvites(); }} />
        <div className="jb-sharing-cta">
          <ActionLink size="medium" icon={copyIcon} id={idPrefix + '-copy-link'} onClick={copyLink}>Copy link</ActionLink>
          <Button size="small" variant="secondary" icon={send} id={idPrefix + '-send'} disabled={sending || !emails.trim()} onClick={sendInvites}>{sending ? 'Sending…' : 'Send invite'}</Button>
        </div>
      </div>
      <div className="jb-people">
        <h3 className="jb-people-title" id={idPrefix + '-people-title'}>{`People with access  · ${people.length}`}</h3>
        <ul className="jb-people-list" aria-labelledby={idPrefix + '-people-title'} id={idPrefix + '-people'}>
          {people.map((p, i) => (
            <li key={p.key} className={'jb-person-row' + (p.invite ? ' is-invite' : '')} data-user={p.userId} data-invite={p.invite ? p.id : undefined}>
              {i > 0 && <Divider />}
              <div className="jb-person">
                <div className="jb-person-user">
                  <Avatar name={p.name || p.email || '?'} />
                  <div className="jb-person-info">
                    <span className="jb-person-name">{p.name || p.email || 'Someone'}</span>
                    {p.email && p.name && <span className="jb-person-email">{p.email}</span>}
                  </div>
                  {p.you && <span className="jb-tag">You</span>}
                  {p.invite && <span className="jb-tag is-warning">Invite sent</span>}
                </div>
                <RoleMenu id={'board-role-' + (p.userId || p.id)} person={p} disabled={p.you} onPick={(role) => setRole(p, role)} onRemove={() => removeAccess(p)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The access dropdown (Dropdown Tiny, 120 wide) and its menu: the roles, a divider, "Remove access". A hidden native
 * select with the same id holds the role (setting it and dispatching 'change' works too, as with the DS Dropdown). */
function RoleMenu({ id, person, disabled, onPick, onRemove }) {
  const mobile = useMobile();
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false); // 986:27011: the menu opens above the dropdown when there is no room below
  const ref = useRef(null);
  const sheet = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open && !mobile, ref, close);
  useEffect(() => {
    const d = sheet.current; if (!d) return;
    if (open && mobile && !d.open) d.showModal();
    if ((!open || !mobile) && d.open) d.close();
  }, [open, mobile]);
  const pick = (r) => { close(); if (r !== person.role) onPick(r); };
  const items = (
    <>
      <div className="jb-role-items" role="menu">
        {ACCESS_MENU.map((r) => (
          <button key={r} type="button" role="menuitemradio" aria-checked={r === person.role ? 'true' : 'false'} className={'jb-role-item' + (r === person.role ? ' is-current' : '')}
            id={`${id}-${r}`} onClick={() => pick(r)}>{ACCESS_LABEL[r]}</button>
        ))}
      </div>
      <Divider />
      <button type="button" className="jb-role-item is-destructive" id={id + '-remove'} onClick={() => { close(); onRemove(); }}>
        <Icon icon={removeIcon} size={16} /><span>Remove access</span>
      </button>
    </>
  );
  return (
    <div className={'jb-role' + (open ? ' is-open' : '') + (disabled ? ' is-disabled' : '')} ref={ref}>
      <select id={id} tabIndex={-1} aria-hidden="true" value={person.role} disabled={disabled} onChange={(e) => pick(e.target.value)}>
        {['viewer', 'editor', 'co_owner'].map((r) => <option key={r} value={r}>{ACCESS_LABEL[r]}</option>)}
      </select>
      <button type="button" className="jb-role-trigger" id={id + '-trigger'} disabled={disabled} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'}
        aria-label={`Access of ${person.name || person.email}: ${label(person)}`} onClick={(e) => { setUp(e.currentTarget.getBoundingClientRect().bottom + 240 > window.innerHeight); setOpen((o) => !o); }}>
        <span>{label(person)}</span><Icon icon={chevronDown} size={12} />
      </button>
      {open && !mobile && <div className={'jb-role-menu' + (up ? ' is-up' : '')} id={id + '-menu'}>{items}</div>}
      <dialog ref={sheet} className="jb-sheet jb-role-sheet" aria-label={`Access of ${person.name || person.email}`}
        onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === sheet.current) close(); }}>
        {mobile && open && (
          <>
            <div className="jb-sheet-head">
              <div className="jb-person-user">
                <Avatar name={person.name || person.email || '?'} />
                <div className="jb-person-info">
                  <span className="jb-person-name">{person.name || person.email}</span>
                  {person.name && person.email && <span className="jb-person-email">{person.email}</span>}
                </div>
              </div>
              <RoundButton icon={x} iconSize={24} className="jb-sheet-x" label="Close" onClick={close} />
            </div>
            <div className="jb-sheet-body">{items}</div>
          </>
        )}
      </dialog>
    </div>
  );
}
