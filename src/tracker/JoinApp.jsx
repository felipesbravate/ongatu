'use client';
// /join#<token>: "Mobile · Accept invitation" (Ongatu 938:32033). The app shell (header with the bell), "Your invitation",
// "Signed in as <name>", a card with the board, who invited and the access ("Viewer access"), the privacy note, and the
// "Join <board>" modal over it: "<who> invited you as a Viewer." + what that access can do + "This adds <board> to your
// boards…", Decline / Add joint board. No desktop frame: the same column, centred.
// Already a member, an expired or a broken link: the same page, the card says so with one way on.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import '../ui/okara.css';
import '../ui/shell.css';
import './notifications.css';
import { AppHeader, Button, Modal } from '../ui/index.js';
import { AppSkeleton, Spinner } from '../ui/Loading.jsx';
import { boardsApi, getMe, setActiveBoard } from './api.js';
import { AccountNav } from './AccountBar.jsx';
import { useBudgetAlertsStandalone } from './alerts.js';
import { alertHref } from './notifications.js';
import { useProfile } from './profile.js';
import { clearJoin, pendingJoin, stashJoin, tokenFromHash } from './boards.js';
import { ACCESS_HINT_YOU, ACCESS_LABEL, BoardCard, BoardNote, article } from './boards/parts.jsx';

export default function JoinApp() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const profile = useProfile(me);
  const alerts = useBudgetAlertsStandalone();
  const [token, setToken] = useState(null);
  const [state, setState] = useState({ kind: 'loading' }); // loading | invite | member | closed | invalid | error
  const [modal, setModal] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromHash = tokenFromHash(location.hash);
    // Keep it for the trip through sign-in, and take it out of the address bar and history.
    if (fromHash) { stashJoin(fromHash); history.replaceState(null, '', '/join'); }
    const t = fromHash || pendingJoin();
    if (!t) { setState({ kind: 'invalid' }); }
    else {
      setToken(t);
      boardsApi.preview(t).then((p) => {
        if (p.alreadyMember) setState({ kind: 'member', p });
        else if (!p.open) setState({ kind: 'closed', p });
        else setState({ kind: 'invite', p });
      }).catch((e) => {
        if (e.code === 'not_found') { clearJoin(); setState({ kind: 'invalid' }); }
        else if (e.code !== 'unauthenticated') setState({ kind: 'error', message: e.message });
      });
    }
    getMe().then((m) => {
      if (m.status === 'pending') location.href = '/pending';
      else if (m.status === 'blocked') location.href = '/blocked';
      else setMe(m);
    }).catch(() => setLoadError(true));
  }, []);

  const home = () => { clearJoin(); location.assign('/'); };
  const join = async () => {
    setBusy(true);
    try {
      const r = await boardsApi.accept(token);
      clearJoin();
      setActiveBoard(r.boardId, '/');
    } catch (e) {
      setBusy(false); setModal(false);
      if (e.code === 'gone') setState((s) => ({ kind: 'closed', p: s.p }));
      else setState({ kind: 'error', message: e.message });
    }
  };

  if (!me) return <AppSkeleton account error={loadError} />;
  const s = state;
  const who = s.p && s.p.invitedBy;
  let card;
  if (s.kind === 'loading') card = <div className="jb-join-loading"><Spinner /><p className="loading-status" role="status">Opening the invite…</p></div>;
  else if (s.kind === 'invite') card = (
    <BoardCard className="jb-join-card" id="join-card" titleId="join-board" title={s.p.boardName}>
      {who && <p className="jb-join-from">{`From ${who}`}</p>}
      <p className="jb-join-role" id="join-role">{`${ACCESS_LABEL[s.p.role]} access`}</p>
      {!modal && <Button id="join-review" onClick={() => setModal(true)}>Review invitation</Button>}
    </BoardCard>
  );
  else if (s.kind === 'member') card = (
    <BoardCard className="jb-join-card" id="join-card" titleId="join-title" title={`You’re already on ${s.p.boardName}`}>
      <p className="jb-join-from">{`Your access: ${ACCESS_LABEL[s.p.yourRole]}.`}</p>
      <Button id="join-open" onClick={() => { clearJoin(); setActiveBoard(s.p.boardId, '/'); }}>Open board</Button>
    </BoardCard>
  );
  else if (s.kind === 'closed') card = (
    <BoardCard className="jb-join-card" id="join-card" titleId="join-title" title="This invitation has expired">
      <p className="jb-join-from">{`The link was already used or is too old.${who ? ` Ask ${who} for a new one.` : ' Ask for a new one.'}`}</p>
      <Button id="join-home" onClick={home}>Go to my board</Button>
    </BoardCard>
  );
  else card = (
    <BoardCard className="jb-join-card" id="join-card" titleId="join-title" title={s.kind === 'invalid' ? 'This invitation link isn’t valid' : 'Couldn’t open the invitation'}>
      <p className="jb-join-from">{s.kind === 'invalid' ? 'Check that you opened the whole link, or ask for a new one.' : (s.message || 'Try again in a moment.')}</p>
      <Button id="join-home" onClick={home}>Go to my board</Button>
    </BoardCard>
  );

  return (
    <>
      <div className="app-top-gap" />
      <AppHeader><AccountNav me={me} profile={profile} alerts={alerts} onOpenAlert={(a) => router.push(alertHref(a))} /></AppHeader>
      <main className="wrap jb-join" id="join-page">
        <div className="jb-heading">
          <h1 className="jb-title">Your invitation</h1>
          <p className="jb-sub" id="join-signed-in">{`Signed in as ${profile.name || me.email}`}</p>
        </div>
        {card}
        <BoardNote>You’ll keep your personal board and switch between both boards.</BoardNote>
      </main>
      {s.kind === 'invite' && (
        <Modal open={modal} id="join" onClose={() => setModal(false)} illustration={null} title={`Join ${s.p.boardName}`}
          secondary={{ label: 'Decline', onClick: home, disabled: busy, id: 'join-decline' }}
          primary={{ label: busy ? 'Adding…' : 'Add joint board', onClick: join, disabled: busy, id: 'join-accept' }}>
          <div className="jb-join-modal-text" id="join-text">
            <p>{`${who ? `${who} invited you` : 'You were invited'} as ${article(s.p.role)}.`}</p>
            <p>{ACCESS_HINT_YOU[s.p.role]}</p>
            <p>{`This adds ${s.p.boardName} to your boards. Your personal board stays private and is not replaced.`}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
