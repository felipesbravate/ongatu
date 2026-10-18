'use client';
// Board settings (Ongatu, Oct 15): "05 - Boards settings - Owner" 970:18246 (dark 1009:24719), with the board list open
// 992:34665, personal board 989:29429, "Viewer/Editor" 992:37022; phones 986:27262, 989:29453, 992:37239, the board
// sheet 992:35130 and the access sheet 989:28776. /board-settings?board=<id | personal> (else the board shown).
//   Oct 18: re-measured against the refined frames (and their 1070:* dark twins). Phones are a panel: no App header, a
//   64-high nav bar with the back button, then the title block.
//   The App header; "Back to dashboard"; "Board settings" + "Manage your board name, member access, and permissions.";
//   then, centred (1110): on the left (246) "Select a board" and the board pill (it opens "Your boards" in place; on
//   phones a sheet); on the right (800) the cards, 16 apart:
//     Board name: the name field; co-owners get the info message + "Save changes"; others / the personal board a
//       disabled field and a line saying why.
//     Board sharing (co-owners): Sharing.jsx.
//     Delete this board (co-owners): the confirm checkbox + Delete board. Leave board (others, and co-owners when
//       another co-owner remains).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import '../../ui/okara.css';
import '../../ui/shell.css';
import '../notifications.css';
import { ActionLink, AppHeader, BoardSwitcher, Button, Checkbox, InfoMessage, Input, RoundButton, useDismiss, useMobile, useToast } from '../../ui/index.js';
import { Icon } from '../../ui/Icon.jsx';
import { arrowStraightLeft, chevronDown, duo, information, user2 } from '../../ui/icons.js';
import { AppSkeleton } from '../../ui/Loading.jsx';
import { boardsApi, getActiveBoard, getMe, setActiveBoard } from '../api.js';
import { AccountNav, boardSwitcherProps } from '../AccountBar.jsx';
import { useBudgetAlertsStandalone } from '../alerts.js';
import { alertHref } from '../notifications.js';
import { useProfile } from '../profile.js';
import { useAppNavigation } from '../AppNavigation.jsx';
import { useConfirm } from '../ConfirmModal.jsx';
import { personalBoardName, useBoards } from '../boards.js';
import { BoardCard } from './parts.jsx';
import { BoardSharing, useBoardPeople } from './Sharing.jsx';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const settingsHref = (id) => '/board-settings?board=' + (id ? encodeURIComponent(id) : 'personal');

export default function BoardSettingsApp() {
  const router = useRouter();
  const mobile = useMobile();
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const profile = useProfile(me);
  const alerts = useBudgetAlertsStandalone();
  const [toastEl, showToast] = useToast();
  const [confirmModal, confirm] = useConfirm();
  const boards = useBoards();
  const [boardId, setBoardId] = useState(undefined); // undefined = not decided yet, null = the personal board
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    getMe().then((m) => {
      if (m.status === 'pending') location.href = '/pending';
      else if (m.status === 'blocked') location.href = '/blocked';
      else setMe(m);
    }).catch(() => setLoadError(true));
  }, []);
  // Which board: ?board=<id> when I'm on it, ?board=personal, else the board shown (a joint one) or the personal one.
  useEffect(() => {
    if (!boards.boards || boardId !== undefined) return;
    const list = boards.boards;
    const asked = new URLSearchParams(location.search).get('board');
    const ok = (id) => id && UUID_RE.test(id) && list.some((b) => b.id === id);
    const pick = asked === 'personal' ? null : ok(asked) ? asked : ok(getActiveBoard()) ? getActiveBoard() : null;
    setBoardId(pick);
    if (asked !== (pick || 'personal')) history.replaceState(null, '', settingsHref(pick));
  }, [boards.boards, boardId]);

  const people = useBoardPeople(boardId || null);
  const board = boardId ? people.board : null;
  useEffect(() => { if (board) setName(board.name); }, [board]);
  useEffect(() => { setSure(false); }, [boardId]);

  useAppNavigation(me ? profile.image : undefined, () => router.push('/?add=1'));
  if (!me || boardId === undefined) return <AppSkeleton account error={loadError} />;

  const personalName = personalBoardName(profile.firstName || profile.name);
  const isCo = !!board && board.role === 'co_owner';
  const coOwners = board ? board.members.filter((m) => m.role === 'co_owner').length : 0;
  const canLeave = !!board && (!isCo || coOwners > 1);
  const goTo = (id) => { if ((id || null) !== boardId) location.assign(settingsHref(id)); };

  const rename = async () => {
    const n = name.trim();
    if (!n || n === board.name) return;
    setBusy('rename');
    try { await boardsApi.rename(boardId, n); showToast('Changes saved.', 'success'); await Promise.all([people.reload(), boards.reload()]); }
    catch (e) { showToast(e.message || "Couldn't save your changes.", 'fail'); }
    finally { setBusy(''); }
  };
  const leaveOrDelete = (kind) => confirm({
    title: kind === 'delete' ? `Are you sure you want to delete “${board.name}”?` : `Leave “${board.name}”?`,
    description: kind === 'delete'
      ? 'Its years, entries and budgets are deleted for everyone on it, and its invite links stop working. This cannot be undone.'
      : 'You will lose access to this board. To regain access, an owner will need to invite you again.',
    confirmLabel: kind === 'delete' ? 'Delete board' : 'Leave board', busyLabel: kind === 'delete' ? 'Deleting…' : 'Leaving…',
    onConfirm: async () => {
      try {
        if (kind === 'delete') await boardsApi.remove(boardId);
        else await boardsApi.removeMember(boardId, board.members.find((m) => m.you).userId);
        // The joint board is gone for me: back to the dashboard (the personal board if this one was shown).
        setActiveBoard(getActiveBoard() === boardId ? null : getActiveBoard(), '/');
      } catch (e) { showToast(e.message || 'Something went wrong.', 'fail'); }
    },
  });

  const nameCard = (
    <BoardCard id="board-sec-name" className={'jb-name-card ' + (isCo ? 'is-co' : boardId ? 'is-locked' : 'is-personal')} titleId="board-name-title" title="Board name"
      text={!boardId ? 'Personal boards are tied to your account and cannot be renamed.'
        : isCo ? 'This name appears for everyone on the joint board.'
          : mobile ? 'The name is set by the owner and co-owners.' : 'Only owners and co-owners can change the board name.'}>
      <Input id="board-name" aria-labelledby="board-name-title" value={boardId ? name : personalName} maxLength={60} disabled={!isCo} readOnly={!isCo}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename(); }} />
      {isCo && (
        <div className="jb-name-actions">
          <InfoMessage className="jb-info" icon={information}>{`Renaming this board won't change your active workspace. To switch boards, use the selector ${mobile ? 'in the top menu' : 'on the left'}.`}</InfoMessage>
          <Button id="board-rename" disabled={busy === 'rename' || !name.trim() || name.trim() === board.name} onClick={rename}>Save changes</Button>
        </div>
      )}
    </BoardCard>
  );
  const sharingCard = isCo && (
    <BoardCard id="board-sec-sharing" className="jb-sharing-card" titleId="board-sharing-title" title="Board sharing" text="As the owner, you can change access or remove a member.">
      <BoardSharing board={board} invites={people.invites} reload={people.reload} showToast={showToast} confirm={confirm} idPrefix="board" />
    </BoardCard>
  );
  const deleteCard = isCo && (
    <BoardCard id="board-sec-delete" className="jb-danger-card">
      <div className="jb-danger">
        <div className="jb-danger-meta">
          <h3 className="jb-danger-title">Delete this board</h3>
          <p className="jb-danger-text">Permanently delete this board, its settings, and all associated transaction history. This action cannot be undone.</p>
          <Checkbox id="board-delete-confirm" checked={sure} onChange={setSure}>I understand that deleting this board is permanent and cannot be undone.</Checkbox>
        </div>
        <Button size="small" variant="destructive" id="board-delete" disabled={!sure} onClick={() => leaveOrDelete('delete')}>Delete board</Button>
      </div>
    </BoardCard>
  );
  const leaveCard = canLeave && (
    <BoardCard id="board-sec-leave" className="jb-danger-card">
      <div className="jb-danger">
        <div className="jb-danger-meta">
          <h3 className="jb-danger-title">Leave board</h3>
          <p className="jb-danger-text">{mobile ? 'You will lose any access to this board. To access it again, you need to be invited.' : 'You will lose access to this board. To regain access, an owner will need to invite you again.'}</p>
        </div>
        <Button size="small" variant="secondary" className="is-destructive" id="board-leave" onClick={() => leaveOrDelete('leave')}>Leave board</Button>
      </div>
    </BoardCard>
  );

  return (
    <>
      <div className="app-top-gap" />
      {/* Phones (989:29453 / 992:37239 / 986:27262): a panel with its own nav bar (the back button), no app header. */}
      {!mobile && <AppHeader><AccountNav me={me} profile={profile} alerts={alerts} onOpenAlert={(a) => router.push(alertHref(a))} /></AppHeader>}
      <div className="wrap acct-page jb-page" id="board-settings">
        <header className="jb-head">
          {mobile
            ? <div className="jb-nav"><RoundButton icon={arrowStraightLeft} iconSize={20} className="jb-back" id="board-settings-back" label="Back to dashboard" onClick={() => router.push('/')} /></div>
            : <ActionLink href="/" size="medium" icon={arrowStraightLeft} id="board-settings-back"
                onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); router.push('/'); } }}>Back to dashboard</ActionLink>}
          <div className="jb-heading">
            <h1 className="jb-title">Board settings</h1>
            <p className="jb-sub">Manage your board name, member access, and permissions.</p>
          </div>
        </header>
        <div className="jb-content">
          <div className="jb-left">
            <h2 className="jb-left-title">Select a board</h2>
            <BoardPicker boards={boards} firstName={profile.firstName || profile.name} boardId={boardId} personalName={personalName} mobile={mobile} onPick={goTo} />
          </div>
          <div className="jb-cards">
            {boardId && !board
              ? <BoardCard className="jb-name-card"><p className="jb-small" role="status">{people.error || 'Loading…'}</p></BoardCard>
              : <>{nameCard}{sharingCard}{deleteCard}{leaveCard}</>}
          </div>
        </div>
      </div>
      {toastEl}
      {confirmModal}
    </>
  );
}

/** "Select a board" (986:26970): a 246-wide pill (border/selected-item, 16 padding, the 16px Duo / User 2 icon, the
 * board name in link/default, a 12px chevron). It opens "Your boards" (board-dropdown, State=Active) in its place;
 * on phones the sheet. Picking a board shows its settings (the dashboard keeps showing the board it showed). */
function BoardPicker({ boards, firstName, boardId, personalName, mobile, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open && !mobile, ref, close);
  const p = boardSwitcherProps(boards, firstName);
  const list = p.boards.map((b) => ({ ...b, current: (b.id || null) === boardId }));
  const current = list.find((b) => b.current);
  return (
    <div className={'jb-picker' + (open ? ' is-open' : '')} ref={ref}>
      {/* 992:34665: the open list covers the title and the pill (absolute, 302 wide); the pill stays underneath. */}
      <button type="button" className="jb-picker-btn" id="board-settings-board" aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((o) => !o)}>
        <Icon icon={boardId ? duo : user2} size={mobile ? 24 : 16} />
        <span className="jb-picker-name">{current ? current.name : personalName}</span>
        <Icon icon={chevronDown} size={mobile ? 16 : 12} />
      </button>
      <BoardSwitcher id="board-settings-switcher" boards={list} mobile={mobile} open={open} onClose={close} note={mobile ? undefined : p.note} onCreate={mobile ? undefined : p.onCreate}
        onPick={(id) => { close(); onPick(id); }} />
    </div>
  );
}
