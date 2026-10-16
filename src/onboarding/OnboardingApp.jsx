'use client';
// Onboarding and setup (Ongatu 397:4392, Oct 2). After "Create account" and the code, a new account lands here:
//   02 Tour (3 cards, 399:4424 / 399:4485 / 564:7633) -> 03 Choose how to start (400:4509) -> 03a Set up your board,
//   from the starter template (401:4464) or empty (402:4539) -> 04 Welcome modal (404:4571) -> the dashboard.
// "Start tracking" writes the first year (its taxonomy = the board), a budget per type that has one, and
// settings/onboarding, so the dashboard never sends this account here again.
import { useEffect, useRef, useState } from 'react';
import '../ui/okara.css';
import './onboarding.css';
import { ActionLink, Avatar, Button, CategorySelector, Dropdown, Input, Label, Logo, Modal, illustrations, useMobile, useToast } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { arrowStraightLeft, arrowStraightRight, cancel, copy as copyIcon, dot, edit, euro, information, plus, send, upload, warningOutlined } from '../ui/icons.js';
import { Illustration } from '../ui/Modal.jsx';
import { InfoMessage, Pager, StepProgress, Tag } from '../ui/Selectors.jsx';
import { api, boardsApi, db, getActiveBoard, getMe, importPath, leavePage, setActiveBoard } from '../tracker/api.js';
import { readFile, analyzeWorkbook } from '../../public/legacy/importer.js';
import { boardFromFile, entriesForBoard } from './board-from-file.js';
import { CATS, EXP_GROUPS, MONTH_NAMES, addGroupToTaxonomy, addSubToTaxonomy, addTypeToTaxonomy, budgetDefaultDocId, fmtNum, hasGroups, parseAmount } from '../tracker/model.js';
import { Combo, EmptyField, SubCategoryDeleteModal, SubCategoryEditModal, SubCategoryModal, TypeModal, kindLabel } from '../tracker/TaxonomyModals.jsx';
import { BlockFrag, BudgetRow, GroupHeader } from '../tracker/BudgetPanel.jsx';
import { useConfirm } from '../tracker/ConfirmModal.jsx';
import { ROLE_LABEL, ROLE_OPTIONS } from '../tracker/boards.js';

const STEPS = ['Account', 'Tour', 'Setup'];
const nowYear = new Date().getFullYear();

// The starter template: the generic taxonomy every new year falls back to (model.CATS).
function templateBoard() {
  const types = [];
  CATS.incomes.forEach((item) => types.push({ type: 'income', group: null, category: null, item, budget: 0 }));
  CATS.investments.forEach((item) => types.push({ type: 'investment', group: null, category: null, item, budget: 0 }));
  Object.entries(CATS.expenses).forEach(([group, cats]) => Object.entries(cats).forEach(([category, items]) => items.forEach((item) => types.push({ type: 'expense', group, category, item, budget: 0 }))));
  return { kinds: KINDS3.slice(), subs: { expense: EXP_GROUPS.slice() }, groups: {}, types };
}
// Oct 5 (Felipe): Income, Savings and investments and Expenses are the only categories, always there, never deleted or
// renamed. Sub-categories and groups are the user's: added, renamed and deleted freely.
// board = { kinds: [type], subs: { [type]: [sub-category] }, groups: { 'expense|<sub>': [empty groups] },
//           types: [{ type, group (sub-category), category (group), item, budget }] }
const KINDS3 = ['income', 'investment', 'expense'];
const emptyBoard = () => ({ kinds: KINDS3.slice(), subs: {}, groups: {}, types: [] });

export function taxonomyOfBoard(board) {
  const tx = { incomes: [], investments: [], expenses: {} };
  board.kinds.forEach((k) => (board.subs[k] || []).forEach((g) => addSubToTaxonomy(tx, k, g)));
  Object.entries(board.groups || {}).forEach(([key, names]) => { const [k, sub] = key.split('|'); if (k === 'expense') names.forEach((g) => addGroupToTaxonomy(tx, sub, g)); });
  board.types.forEach((t) => addTypeToTaxonomy(tx, t));
  return tx;
}

function Header({ name, joint }) {
  const mobile = useMobile();
  return (
    <header className={'ob-header' + (joint ? ' is-joint' : '')}>
      {joint ? <JointArt /> : <Logo variant="symbol" height={44} />}
      {joint
        ? <><h1 className="ob-title">Set up your joint board</h1><p className="ob-sub">Manage your finances together with your partner or family.</p></>
        : <><h1 className="ob-title">Welcome{name ? `, ${name}` : ''}</h1><p className="ob-sub">{mobile ? 'Let\u2019s get started.' : 'Let\u2019s set up your financial dashboard.'}</p></>}
    </header>
  );
}

// The joint-board setup's header illustration (Ongatu 961:33044, Illustration Color=Brand, 60 x 64): brand/mint and
// the accent purple (#4F46E5 light, #C2BCFF dark = link/default; dark frame 994:56291).
function JointArt() {
  return (
    <svg className="ob-joint-art" width="60" height="64" viewBox="0 0 60 64" fill="none" aria-hidden="true">
      <path d="M27.6548 16.4849C28.8105 12.8414 28.3082 8.64363 26.1007 5.50624C24.2081 2.71889 21.1352 0.89031 17.8886 0.264653C13.4918 -0.597037 8.78213 0.686463 5.29319 3.50786C2.26391 5.86744 0.207807 9.55061 0.021578 13.4443C-0.16275 16.3951 0.849849 19.3502 2.65064 21.6581C5.30985 25.2389 9.90913 27.2263 14.3063 26.6586C15.8166 31.3476 17.5051 36.0073 19.8294 40.3539C23.6489 45.1058 20.0276 33.0593 19.3672 29.9145C19.0766 28.5715 19.0014 27.1931 18.6812 25.855C22.8652 24.3334 26.4103 20.8615 27.6548 16.4849ZM7.83415 11.7902C8.51099 9.82475 10.1208 8.26233 12.0321 7.5389C14.3819 6.65074 17.3207 7.25742 18.9573 9.25239C21.6524 12.8196 19.5119 18.6954 15.2594 19.788C12.8549 20.4765 10.1405 19.4621 8.71329 17.3941C7.54715 15.8164 7.18002 13.6592 7.83415 11.7902Z" fill="var(--brand-mint)" />
      <path d="M31.0181 60.2607C32.9832 57.9748 33.3176 54.6666 35.3523 52.4091C37.8051 51.6282 40.4531 52.0399 43.0034 51.7418C44.8012 54.4394 47.7975 56.3704 51.0308 56.4982C53.8041 56.5408 56.0618 54.4962 57.6367 52.3665C59.2672 50.1089 59.0582 47.1841 59.6853 44.5716C60.619 40.4683 59.5181 35.4421 55.797 33.142C52.4941 30.9696 47.7418 32.1765 45.512 35.3995C44.0626 37.2311 43.7699 39.6164 43.31 41.8455C40.5924 42.6264 37.8609 41.1356 35.1433 40.9084C37.3313 37.515 39.4915 34.0932 42.0697 30.998C44.2438 30.6715 46.6269 30.2171 48.0484 28.3429C49.8741 26.0286 51.7694 23.3451 51.6997 20.2357C51.7137 18.3331 51.8809 16.3879 51.2956 14.5564C49.3166 8.43689 41.8049 4.53237 35.9098 7.27264C33.1365 8.4511 31.7707 11.4327 30.8369 14.1446C30.2098 17.5096 31.0042 21.1586 32.9413 23.9557C30.3631 28.9393 27.4922 33.7525 24.691 38.5941C22.8235 38.7503 20.956 39.0485 19.1861 39.659C15.6323 40.7381 13.305 44.4722 13.1795 48.1496C13.1935 51.1596 12.7754 54.3826 14.3362 57.1229C15.8971 60.8855 19.4091 64.0943 23.6179 63.9523C26.5863 64.3357 29.1088 62.3479 31.0181 60.2607ZM31.9658 17.2398C32.7184 18.6171 33.457 19.9943 34.2653 21.3432C34.0005 21.8117 33.7357 22.2945 33.4709 22.7772C32.8717 20.9598 32.3421 19.114 31.9658 17.2398ZM16.3013 45.2957C18.336 42.1721 22.3357 41.7319 25.6944 41.4906C25.9174 41.022 26.1543 40.5535 26.3912 40.0849C28.8301 35.2717 31.8264 30.7708 34.2235 25.9434C34.9482 24.4242 35.7983 22.9334 36.1328 21.2722C35.5475 19.611 34.1538 18.3331 33.7636 16.5725C32.9971 14.2866 33.4988 11.4753 35.5753 10.0981C40.1047 6.80409 47.0729 9.55857 49.0379 14.6558C50.0134 17.3818 49.2887 20.8036 46.8359 22.479C44.857 24.0692 42.223 23.1322 39.9374 23.5013C39.3521 25.3187 38.0839 26.7669 36.9968 28.2861C33.8193 32.3468 30.6976 36.4644 28.2448 41.0362C28.6489 41.7603 29.067 42.4986 29.4991 43.2228C34.1817 42.74 38.8364 43.6629 43.5051 44.0179C43.8257 44.3302 44.4807 44.9834 44.8012 45.3099C45.2054 42.2431 44.9545 38.6367 47.4352 36.3508C49.7068 33.6105 54.3895 33.5253 56.4799 36.5496C59.4623 40.88 57.8039 48.3626 52.6335 50.1231C49.7905 50.8757 48.1599 48.036 46.0416 46.8433C45.6374 46.8433 45.2332 46.8433 44.8291 46.8575C40.7457 46.9143 36.6484 47.0989 32.5651 47.1841C31.8682 47.2125 30.6418 47.1983 30.6279 48.2064C30.1541 51.472 28.9973 54.8796 26.433 57.0519C24.2172 58.6421 21.2905 57.5347 19.214 56.2284C15.7438 54.1129 13.7788 48.8595 16.3013 45.2957Z" fill="var(--link-default)" />
      <path d="M19.7967 12.8147C20.3606 12.1253 20.4583 11.0648 19.9095 10.3451C19.5411 10.0496 19.0224 10.2542 18.5939 10.2011C18.4736 10.7314 18.1804 11.292 18.4511 11.8299C18.6691 12.345 19.1502 13.0344 19.7967 12.8147Z" fill="var(--link-default)" />
      <path d="M16.2981 15.3068C17.0131 15.5438 17.5304 14.8407 17.7586 14.2522C18.1618 13.4803 17.9488 12.5938 17.7662 11.7913C17.6521 11.7455 17.4239 11.6538 17.3174 11.6079C17.112 12.5174 16.8001 13.4039 16.3514 14.2293C15.8493 13.679 15.4538 12.9453 14.6475 12.8154C14.7616 13.8242 15.2027 15.0241 16.2981 15.3068Z" fill="var(--link-default)" />
      <path d="M12.9929 15.874C13.8819 15.8512 14.2994 14.7932 14.1911 14.0473C13.9283 13.2862 12.962 13.035 12.2585 13.3395C10.9211 13.682 11.7329 16.1023 12.9929 15.874Z" fill="var(--link-default)" />
    </svg>
  );
}

// "Cancel board creation" (Ongatu 961:32094 / 962:33477): a Tertiary Medium button in action/destructive with the
// 20px Cancel icon, under the card.
function CancelBoard({ onClick, disabled }) {
  return <Button variant="tertiary" icon={cancel} className="ob-cancel-board" id="ob-cancel-board" disabled={disabled} onClick={onClick}>Cancel board creation</Button>;
}

// ---------- Joint board: 03 Name and share (Ongatu 962:33477, Oct 15) ----------
// Card 1: "Back to setup", "Name and share" and the Board name field. Card 2: "Share your board": an email field, Copy
// link (Action link Medium, Copy 16) and Send invite (Button Small Secondary, Send 16); "People with access": me (the
// "You" tag, Owner, fixed) and everyone invited here ("Invite sent", their access in a Tiny dropdown, 120 wide). Then
// "Cancel board creation" and "Finish and start tracking". The board is created when it's first needed: Copy link, Send
// invite or Finish (it needs its name); the invitations are links (the server keeps no email), one per address.
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DEFAULT_ACCESS = 'viewer'; // as the Share panel (boards-b): the least access; change it in the row
function NameAndShare({ me, name, setName, nameError, ensureBoard, boardId, invites, setInvites, onBack, onCancel, onFinish, busy, error, showToast }) {
  const [emails, setEmails] = useState('');
  const [working, setWorking] = useState(null); // 'copy' | 'send' | invite email
  const link = useRef(null); // the Copy link invitation
  const mine = me ? (String(me.name || '').trim() || me.email) : '';
  const copyLink = async () => {
    setWorking('copy');
    try {
      const id = await ensureBoard();
      if (id === 'preview') { showToast('Link copied.', 'success'); return; }
      if (!link.current || link.current.boardId !== id) link.current = { ...(await boardsApi.createInvite(id, DEFAULT_ACCESS)), boardId: id };
      await navigator.clipboard.writeText(link.current.url);
      showToast('Link copied.', 'success');
    } catch (e) { if (e && e.code !== 'no_name') showToast(e && e.code ? e.message : "Couldn't copy the link.", 'fail'); } // API errors carry a code
    finally { setWorking(null); }
  };
  const invite = async (id, email, role) => {
    if (id === 'preview') return { email, role, inviteId: 'preview-' + email }; // /welcome?preview=1 sends nothing
    const inv = await boardsApi.createInvite(id, role);
    await boardsApi.notifyInvite(id, inv.id, inv.token, email);
    return { email, role, inviteId: inv.id };
  };
  const sendInvites = async () => {
    const list = [...new Set(emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return;
    const bad = list.find((x) => !EMAIL_RE.test(x));
    if (bad) { showToast(`"${bad}" is not an email address.`, 'fail'); return; }
    setWorking('send');
    try {
      const id = await ensureBoard();
      const sent = [];
      for (const email of list) {
        if (invites.some((i) => i.email === email)) continue;
        sent.push(await invite(id, email, DEFAULT_ACCESS));
      }
      setInvites((xs) => [...xs, ...sent]);
      setEmails('');
      if (sent.length) showToast(sent.length === 1 ? `Invite sent to ${sent[0].email}.` : `${sent.length} invites sent.`, 'success');
    } catch (e) { if (e && e.code !== 'no_name') showToast((e && e.message) || "Couldn't send the invite.", 'fail'); }
    finally { setWorking(null); }
  };
  // Another access for someone invited here: their link is replaced by one with the new access, sent again.
  const changeRole = async (row, role) => {
    if (role === row.role) return;
    setWorking(row.email);
    try {
      if (boardId) await boardsApi.revokeInvite(boardId, row.inviteId).catch(() => {});
      const next = await invite(boardId || 'preview', row.email, role);
      setInvites((xs) => xs.map((x) => (x.email === row.email ? next : x)));
      showToast(`${row.email} is invited as ${ROLE_LABEL[role]}.`, 'success');
    } catch (e) { showToast((e && e.message) || "Couldn't change the access.", 'fail'); }
    finally { setWorking(null); }
  };
  return (
    <>
      <section className="ob-card ob-share-card" aria-labelledby="ob-name-title">
        <div className="ob-card-head">
          <BackLink onClick={onBack}>Back to setup</BackLink>
          <h2 className="ob-card-title" id="ob-name-title">Name and share</h2>
          <p className="ob-card-text">Name your board and share access with family, partners, or friends.</p>
        </div>
        <div className="fld ob-board-name">
          <label className="fld-label" htmlFor="ob-board-name">Board name</label>
          <Input id="ob-board-name" value={name} maxLength={60} placeholder="e.g., Home Finances, Living costs" aria-invalid={nameError ? 'true' : undefined}
            onChange={(e) => setName(e.target.value)} autoFocus={!name} />
          {nameError && <p className="ob-error" role="alert" id="ob-board-name-error">{nameError}</p>}
        </div>
      </section>
      <section className="ob-card ob-share-card" aria-labelledby="ob-share-title">
        <div className="ob-card-head">
          <h2 className="ob-card-title" id="ob-share-title">Share your board</h2>
          <p className="ob-card-text ob-share-text">Member access never includes anyone’s personal board. Each member can switch back to their own private budget.</p>
        </div>
        <div className="ob-invite">
          <Input id="ob-invite-email" type="email" multiple value={emails} placeholder="Add email addresses" aria-label="Add email addresses"
            onChange={(e) => setEmails(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendInvites(); }} />
          <div className="ob-invite-cta">
            <ActionLink size="medium" icon={copyIcon} id="ob-invite-copy" disabled={!!working} onClick={copyLink}>Copy link</ActionLink>
            <Button variant="secondary" size="small" icon={send} id="ob-invite-send" disabled={!!working || !emails.trim()} onClick={sendInvites}>{working === 'send' ? 'Sending…' : 'Send invite'}</Button>
          </div>
        </div>
        <div className="ob-people">
          <h3 className="ob-people-title">People with access</h3>
          <ul className="ob-people-list" id="ob-people">
            <li className="ob-person" data-you="true">
              <Avatar name={mine} />
              <span className="ob-person-who"><span className="ob-person-name">{mine}</span><span className="ob-person-email">{me ? me.email : ''}</span></span>
              <span className="ob-person-tag">You</span>
              <Dropdown id="ob-role-you" size="tiny" emptyOption={false} disabled value="owner" options={[{ value: 'owner', label: 'Owner' }]} ariaLabel="Your access" className="ob-person-role" />
            </li>
            {invites.map((row) => (
              <li className="ob-person" key={row.email} data-email={row.email}>
                <Avatar name={row.email} />
                <span className="ob-person-who"><span className="ob-person-name">{row.email.split('@')[0]}</span><span className="ob-person-email">{row.email}</span></span>
                <span className="ob-person-tag is-sent">Invite sent</span>
                <Dropdown id={'ob-role-' + row.inviteId} size="tiny" emptyOption={false} disabled={working === row.email} value={row.role} options={ROLE_OPTIONS}
                  ariaLabel={`Access for ${row.email}`} className="ob-person-role" onChange={(v) => changeRole(row, v)} />
              </li>
            ))}
          </ul>
        </div>
      </section>
      {error && <p className="ob-error" role="alert">{error}</p>}
      <div className="ob-joint-cta">
        <CancelBoard onClick={onCancel} disabled={busy} />
        <Button id="ob-finish" disabled={busy || !!working} onClick={onFinish}>{busy ? 'Saving…' : 'Finish and start tracking'}</Button>
      </div>
    </>
  );
}

// ---------- 02 Tour ----------
const TOUR = [
  { title: 'Every cent in one place', text: 'Track your income, expenses, and savings month by month. See exactly where you stand in seconds.' },
  { title: 'Your data is fully encrypted and accessible only by you', text: 'AI is strictly used to categorize your receipts, nothing else. Export or erase your account whenever you want.' },
  { title: 'Built to match exactly how you think about your money', text: 'Forget rigid budgeting templates. Create custom groups and items, from daily coffee runs to long-term investments.' },
];
function MiniDashboard() {
  const rows = [['Income', '3.900,00', 'var(--data-purple)', 72], ['Expenses', '1.160,00', 'var(--data-pink)', 44], ['Savings', '1.500,00', 'var(--data-light-blue)', 55]];
  return (
    <div className="ob-mini" aria-hidden="true">
      <div className="ob-mini-head"><span>Balance</span><span className="ob-mini-bal">1.240,00 €</span></div>
      <div className="ob-mini-rows">
        {rows.map(([n, v, c, w]) => (
          <div key={n} className="ob-mini-meter">
            <div className="ob-mini-info"><span>{n}</span><span className="ob-mini-val">{v}<Icon icon={euro} size={12} /></span></div>
            <div className="ob-mini-bar"><div style={{ width: w + '%', background: c }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
function TourArt({ i }) {
  if (i === 0) return <MiniDashboard />;
  if (i === 1) return (
    <div className="ob-art-col">
      <Illustration art={illustrations.padlock} width={69} />
      <div className="ob-tags"><Tag type="positive" className="ob-tag">Fully encrypted</Tag><Tag type="positive" className="ob-tag">A key just for you</Tag><Tag type="positive" className="ob-tag">Export or erase</Tag></div>
    </div>
  );
  return <Illustration art={illustrations.head} width={177} />;
}
// Oct 6: changing card slides the next one in from the right (and the current one out to the left) inside the card;
// going back slides the other way. Reduced motion: no slide.
function Tour({ card, setCard, onDone }) {
  const last = useRef(card);
  const [out, setOut] = useState(null); // { i, dir } — the card sliding out
  useEffect(() => {
    if (last.current === card) return undefined;
    setOut({ i: last.current, dir: card > last.current ? 'next' : 'prev' });
    last.current = card;
    const t = setTimeout(() => setOut(null), 420);
    return () => clearTimeout(t);
  }, [card]);
  const slide = (i, cls, current) => (
    <div className={'ob-slide ' + cls} key={i + cls} aria-hidden={current ? undefined : 'true'}>
      <div className="ob-art"><TourArt i={i} /></div>
      <div className="ob-tour-text">
        <h2 className="ob-card-title" id={current ? 'ob-tour-title' : undefined}>{TOUR[i].title}</h2>
        <p className="ob-card-text">{TOUR[i].text}</p>
      </div>
    </div>
  );
  return (
    <section className={'ob-card ob-tour' + (card === TOUR.length - 1 ? ' is-last' : '')} aria-labelledby="ob-tour-title">
      <div className="ob-tour-content">
        <div className="ob-tour-top">
          <ActionLink id="ob-skip" className="ob-skip" onClick={onDone}>Skip</ActionLink>
          <div className="ob-slides">
            {out && slide(out.i, 'is-out is-' + out.dir, false)}
            {slide(card, out ? 'is-in is-' + out.dir : 'is-still', true)}
          </div>
        </div>
        <Pager count={TOUR.length} current={card} onGo={setCard} />
      </div>
      {/* Oct 12 (399:4424 / 399:4485 / 564:7633, 908:18906): card 1 Next (full width); cards 2 and 3 Back (Tertiary, 20px
          arrow) + Next / Go to setup sharing the row, 8 apart (10 on phones). */}
      {card >= 1
        ? <div className="ob-tour-cta">
            <Button variant="tertiary" icon={arrowStraightLeft} id="ob-back" onClick={() => setCard(card - 1)}>Back</Button>
            <Button id="ob-next" onClick={() => (card < TOUR.length - 1 ? setCard(card + 1) : onDone())}>{card < TOUR.length - 1 ? 'Next' : 'Go to setup'}</Button>
          </div>
        : <Button id="ob-next" className="ob-full" onClick={() => setCard(card + 1)}>Next</Button>}
    </section>
  );
}

// ---------- 03 Choose how to start ----------
function Choose({ onPick }) {
  return (
    <section className="ob-card ob-choose" aria-labelledby="ob-choose-title">
      <div className="ob-card-head">
        <h2 className="ob-card-title" id="ob-choose-title">How do you want to start?</h2>
        <p className="ob-card-text">Pick one to get going. You can edit categories and add past months anytime.</p>
      </div>
      <div className="ob-options">
        <button type="button" className="ob-option" id="ob-template" onClick={() => onPick('template')}>
          <span className="ob-option-art"><Illustration art={illustrations.laptop} width={75} /></span>
          <span className="ob-option-text"><span className="ob-option-title">Start from a template</span><span className="ob-option-desc">Ready-made categories for income, bills and savings. Keep what fits.</span></span>
          <span className="ds-action-link medium ob-option-link"><span className="ds-al-label">Start with the template</span><Icon icon={arrowStraightRight} size={16} /></span>
        </button>
        {/* 400:4509 (Oct 12): Template, Import, Build your own. Import a file: Cloud Upload 2 (80 x 48) and a positive Label ".xlsx or .csv" in the top right. */}
        <button type="button" className="ob-option" id="ob-import" onClick={() => onPick('import')}>
          <Label type="positive" className="ob-option-tag">.xlsx or .csv</Label>
          <span className="ob-option-art"><Illustration art={illustrations.cloudUpload2} width={80} /></span>
          <span className="ob-option-text"><span className="ob-option-title">Import a file</span><span className="ob-option-desc">Bring a spreadsheet or bank export. We suggest categories, you confirm.</span></span>
          <span className="ds-action-link medium ob-option-link"><span className="ds-al-label">Import your file</span><Icon icon={arrowStraightRight} size={16} /></span>
        </button>
        <button type="button" className="ob-option" id="ob-empty" onClick={() => onPick('empty')}>
          <span className="ob-option-art"><Illustration art={illustrations.pencil} width={59} /></span>
          <span className="ob-option-text"><span className="ob-option-title">Build your own board</span><span className="ob-option-desc">Create your own tracking categories from zero, one at a time.</span></span>
          <span className="ds-action-link medium ob-option-link"><span className="ds-al-label">Organise your own</span><Icon icon={arrowStraightRight} size={16} /></span>
        </button>
      </div>
    </section>
  );
}

// ---------- 03c Import a file (907:18744, Oct 12) ----------
// The file is read here in the browser by the import engine (public/legacy/importer.js) and sorted into the three
// categories by board-from-file.js; nothing is sent anywhere until "Start tracking". The result opens in "Review your
// setup" (930:21353) with the file's items and monthly budgets, ready to edit.
const ACCEPT = '.csv,.tsv,.txt,.xlsx';
const nextFrame = () => new Promise((r) => setTimeout(r, 60));

// "Back to setup options" / "Back to file upload": a Medium Action link with the 16px arrow, above the title.
function BackLink({ onClick, children }) {
  return <ActionLink size="medium" icon={arrowStraightLeft} className="ob-back-link" id="ob-back-link" onClick={onClick}>{children}</ActionLink>;
}

function ImportFile({ onDone, onBack }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(null); // { name, pct } while the file is read
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const mobile = useMobile();
  const read = async (files) => {
    const f = files && files[0];
    if (!f || busy) return;
    setError(null); setBusy({ name: f.name, pct: 10 });
    try {
      if (f.size > 15 * 1024 * 1024) throw new Error('This file is over 15 MB. Export a shorter period and try again.');
      await nextFrame();
      const book = await readFile(f.name, await f.arrayBuffer());
      setBusy({ name: f.name, pct: 50 }); await nextFrame();
      const res = boardFromFile(analyzeWorkbook(book, { fileName: f.name }));
      if (!res.board.types.length) {
        const why = res.skipped.currency ? 'Its amounts are not in euros. Ongatu works in EUR for now.' : 'No amounts with a date were found. Check that it has a date (or a column per month) and an amount.';
        throw new Error(why);
      }
      setBusy({ name: f.name, pct: 100 }); await nextFrame();
      onDone({ ...res, fileName: f.name });
    } catch (e) {
      setError(e && e.message ? e.message : 'This file could not be read.');
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const pick = () => { if (!busy && fileRef.current) fileRef.current.click(); };
  return (
    <section className="ob-card ob-import" aria-labelledby="ob-import-title">
      <div className="ob-card-head">
        <BackLink onClick={onBack}>Back to setup options</BackLink>
        <h2 className="ob-card-title" id="ob-import-title">Upload your file</h2>
        <p className="ob-card-text">We’ll automatically organize your transactions into Income, Expenses, and Savings &amp; Investments. Nothing is saved until you review and confirm.</p>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden id="ob-import-file" onChange={(e) => read(e.target.files)} />
      <div className="ob-import-body">
        {busy ? (
          // Reading (935:41321): Upload illustration, "Reading …", "It may take a few seconds.", a progress bar and its %.
          <div className="ob-reading" id="ob-dropzone" role="status" aria-live="polite">
            <div className="ob-reading-info">
              <Illustration art={illustrations.upload} width={35} />
              <div className="ob-reading-text"><p className="ob-reading-title">Reading {busy.name}</p><p className="ob-reading-sub">It may take a few seconds.</p></div>
            </div>
            <div className="ob-reading-progress">
              <div className="ob-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={busy.pct}><div style={{ width: busy.pct + '%' }} /></div>
              <p className="ob-reading-pct">{busy.pct}%</p>
            </div>
          </div>
        ) : (
          <div className={'dropzone ob-dropzone' + (over ? ' is-over' : '')} id="ob-dropzone" tabIndex={0} role="button" aria-label="Upload a CSV or Excel file"
            onClick={pick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer && e.dataTransfer.files); }}>
            <div className="dz-text">
              <div className="dz-line"><span className="ds-action-link medium"><Icon icon={upload} size={16} /><span className="ds-al-label">Click to upload</span></span>{!mobile && <span>or drag and drop your file here</span>}</div>
              <div className="dz-hint">.CSV or .XLSX files</div>
            </div>
          </div>
        )}
        {error && <p className="ob-error" role="alert" id="ob-import-error">{error}</p>}
        {/* 909:19163: two illustrated columns (stacked on phones). */}
        <div className="ob-import-tips">
          <div className="ob-tip">
            <Illustration art={illustrations.spreadsheet} width={43} />
            <div className="ob-tip-text"><p className="ob-tip-title">Budget spreadsheets</p><p className="ob-tip-desc">Spreadsheets with monthly breakdowns are automatically organized into your categories, sub-categories, and groups.</p></div>
          </div>
          <div className="ob-tip">
            <Illustration art={illustrations.signalBars} width={39} />
            <div className="ob-tip-text"><p className="ob-tip-title">Bank &amp; card statements</p><p className="ob-tip-desc">Statements containing date, description, and amount columns are automatically mapped and categorized.</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}

const MONTH3 = MONTH_NAMES.map((m) => m.slice(0, 3));
const ymLabel = (ym) => (ym ? `${MONTH3[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '');
const nf = (n) => n.toLocaleString('de-DE');
const fmtCount = (n) => `${nf(n)} entr${n === 1 ? 'y' : 'ies'}`;
const plural = (n, w, ws) => `${nf(n)} ${n === 1 ? w : (ws || w + 's')}`;
/** The file's entries that will be saved: their type is still on the board and they fall on or after the start. */
function importedEntries(imported, board, year, month) {
  const from = `${year}-${String(Number(month) + 1).padStart(2, '0')}`;
  return entriesForBoard(imported.rows, board).filter((e) => e.date.slice(0, 7) >= from);
}
const importedKept = (imported, board, year, month) => importedEntries(imported, board, year, month).length;
// 03d summary box (930:21367): Information icon; file name · period (months); the counts as a list. Then one warning
// per sheet that was skipped, and the engine's other warnings.
function ImportNote({ imported, board, kept }) {
  const { fileName, first, last, months, skipped, warnings, skippedSheets = [] } = imported;
  const left = skipped.currency + skipped.negative + skipped.other;
  const subs = board.kinds.reduce((n, k) => n + (board.subs[k] || []).length, 0);
  const groups = new Set([...Object.entries(board.groups || {}).flatMap(([k, names]) => names.map((g) => k + '|' + g)),
    ...board.types.filter((t) => t.category).map((t) => `${t.type}|${t.group || ''}|${t.category}`)]).size;
  const notes = [
    ...skippedSheets.map((x) => `Skipped sheet "${x.sheet}": ${x.reason}`),
    ...(left > 0 ? [`${fmtCount(left)} skipped${skipped.currency ? `: ${skipped.currency} not in euros` : ''}${skipped.negative ? `${skipped.currency ? ',' : ':'} ${skipped.negative} negative in a budget sheet` : ''}.`] : []),
    ...warnings.filter((w) => w.code !== 'nothing_found').slice(0, 2).map((w) => w.message),
  ];
  return (
    <div className="ob-import-sum">
      <div className="ob-import-note" id="ob-import-note" role="status">
        <Icon icon={information} size={16} />
        <div className="ob-import-note-text">
          <p className="ob-import-note-head"><span>{fileName}</span>{months > 0 && <><Icon icon={dot} size={10} className="ob-import-dot" /><span>{first === last ? ymLabel(first) : `${ymLabel(first)} – ${ymLabel(last)}`} ({plural(months, 'month')})</span></>}</p>
          <ul className="ob-import-note-list">
            <li>{plural(subs, 'sub-category', 'sub-categories')}</li>
            <li>{plural(groups, 'group')}</li>
            <li>{plural(board.types.length, 'item')}</li>
            <li>{months ? fmtCount(kept) : 'No figures yet: categories only'}</li>
          </ul>
        </div>
      </div>
      {notes.map((t) => <InfoMessage key={t} message="warning" icon={warningOutlined} className="ob-import-warn">{t}</InfoMessage>)}
    </div>
  );
}

// ---------- 03a Set up your board / 03d Review your setup ----------
// 401:4464 (starter template) / 749:10871 (start empty) / 930:21353 (imported file), Oct 12: "Back to setup options"
// (or "Back to file upload") over the title; Categories = the three fixed categories (927:20745); under them
// Sub-category and Group (optional): a combobox with "Edit sub-category" / "Edit group" under it, or, with nothing to
// pick yet, an Info message with the Nano "+ Add …" (931:27920 / 930:21383); then the shown sub-category's groups
// (Heading/Large with its Actions menu: Rename group / Delete group), each with its items (rows: name, € budget,
// Actions) and "+ Add item", Dividers between groups; "No items added yet." for an empty group. Nothing on the board
// yet: the Empty state illustration with "No income added yet". Summary on the right (280).
const CAT_INFO = {
  income: { cta: 'Add income', title: 'Income', description: 'Money coming in (salary or any other revenue streams).', empty: 'No income added yet', emptyText: 'Define a specific income to track, and optionally organize it into sub-categories and groups.' },
  investment: { cta: 'Add savings/investment', title: 'Savings and investments', description: 'Money set aside for goals, growth, or emergencies.', empty: 'No savings or investments added yet', emptyText: 'Define what you put aside, and optionally organize it into sub-categories and groups.' },
  expense: { cta: 'Add expense', title: 'Expenses', description: 'Money spent on living costs, bills, and daily purchases.', empty: 'No expenses added yet', emptyText: 'Define a specific expense to track, and organize it into sub-categories and groups.' },
};
const NO_SUB = 'No sub-category';
const ALL_GROUPS = 'All groups';
const gkey = (k, sub) => k + '|' + (sub || '');

// A combobox that picks (or creates, by typing) one value; the text goes back to the picked value when left.
// `children` = the field's action links (8 under the combobox).
function PickField({ id, label, value, options, placeholder, onPick, listLabel, createLabel, autoFocus, children }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  return (
    <div className="fld">
      <label className="fld-label" htmlFor={id}>{label}</label>
      <Combo id={id} value={text} onChange={setText} options={options} placeholder={placeholder} listLabel={listLabel} createLabel={createLabel} autoFocus={autoFocus}
        onPick={(v, created) => { const name = String(v || '').trim(); if (name) onPick(name, created); else setText(value || ''); }}
        onBlur={() => setTimeout(() => setText(value || ''), 150)} />
      {children}
    </div>
  );
}

// `joint` (Ongatu 961:32131): the summary's button is "Continue" (on to Name and share); `initial` = { board, year, month }
// to come back to after "Back to setup".
function Setup({ mode, onStart, onBack, busy, error, imported, saving, joint, initial }) {
  const [board, setBoard] = useState(() => (initial ? initial.board : mode === 'import' && imported ? imported.board : mode === 'template' ? templateBoard() : emptyBoard()));
  const [sel, setSel] = useState('income');
  const [subSel, setSubSel] = useState(() => ({ income: '', investment: '', expense: mode === 'template' ? EXP_GROUPS[0] : mode === 'import' && imported ? ((imported.board.types.find((t) => t.type === 'expense') || {}).group || EXP_GROUPS[0]) : '' }));
  const [groupSel, setGroupSel] = useState(''); // '' = every group of the shown sub-category
  const [groupTyping, setGroupTyping] = useState(false); // "+ Add group" turned the info box into the combobox
  const [modal, setModal] = useState(null); // { kind: 'type', category } | null
  const [subModal, setSubModal] = useState(false);
  const [editSub, setEditSub] = useState(null); // { kind, from } — Sub-category edit (919:13266)
  const [delSub, setDelSub] = useState(null); // { kind, name } — Sub-category deletion (922:13829)
  const [editGroup, setEditGroup] = useState(null); // { from } — the group being edited
  const [confirmModal, confirm] = useConfirm();
  const mobile = useMobile();
  // An imported file starts tracking from its first month.
  const [year, setYear] = useState(initial ? initial.year : imported && imported.first ? imported.first.slice(0, 4) : String(nowYear));
  const [month, setMonth] = useState(initial ? String(initial.month) : imported && imported.first ? String(Number(imported.first.slice(5, 7)) - 1) : String(new Date().getMonth()));

  const label = (k) => kindLabel(k);
  const subsOf = (k) => board.subs[k] || [];
  const typesOf = (k) => board.types.filter((t) => t.type === k);
  const sub = subsOf(sel).includes(subSel[sel]) ? subSel[sel] : (sel === 'expense' ? (subsOf('expense')[0] || '') : '');
  const grouped = hasGroups(sel);
  const viewTypes = board.types.filter((t) => t.type === sel && (t.group || '') === (sub || ''));
  const declared = board.groups[gkey(sel, sub)] || [];
  const groupNames = [...new Set([...declared, ...viewTypes.map((t) => t.category || '').filter(Boolean)])];
  const shownGroups = grouped ? (groupSel && groupNames.includes(groupSel) ? [groupSel] : groupNames) : [];
  const loose = grouped ? viewTypes.filter((t) => !t.category) : viewTypes;
  const itemCount = (n) => (n ? `${n} item${n === 1 ? '' : 's'}` : 'None');
  const items = (n) => `${n} item${n === 1 ? '' : 's'}`;

  const pickKind = (k) => { setSel(k); setGroupSel(''); setGroupTyping(false); };
  const pickSub = (name, created) => {
    if (name === NO_SUB && sel !== 'expense') { setSubSel((s) => ({ ...s, [sel]: '' })); setGroupSel(''); return; }
    const existing = subsOf(sel).find((g) => g.toLowerCase() === name.toLowerCase());
    if (!existing && created) setBoard((b) => ({ ...b, subs: { ...b.subs, [sel]: [...(b.subs[sel] || []), name] } }));
    setSubSel((s) => ({ ...s, [sel]: existing || name })); setGroupSel(''); setGroupTyping(false);
  };
  const addSubs = (names) => {
    setBoard((b) => ({ ...b, subs: { ...b.subs, [sel]: [...(b.subs[sel] || []), ...names.filter((g) => !(b.subs[sel] || []).includes(g))] } }));
    if (names[0]) setSubSel((s) => ({ ...s, [sel]: names[0] }));
    setGroupSel(''); setGroupTyping(false);
  };
  const pickGroup = (name, created) => {
    if (name === ALL_GROUPS) { setGroupSel(''); return; }
    const existing = groupNames.find((g) => g.toLowerCase() === name.toLowerCase());
    if (!existing && created) setBoard((b) => ({ ...b, groups: { ...b.groups, [gkey(sel, sub)]: [...(b.groups[gkey(sel, sub)] || []), name] } }));
    setGroupSel(existing || name); setGroupTyping(false);
  };
  // Oct 5: rename a sub-category while setting up. Nothing is saved yet, so the change is immediate.
  const applyRename = (to) => {
    const r = editSub; setEditSub(null); if (!r) return;
    setBoard((b) => {
      const groups = {}; Object.entries(b.groups).forEach(([k, v]) => { groups[k === gkey(r.kind, r.from) ? gkey(r.kind, to) : k] = v; });
      return { ...b, groups, subs: { ...b.subs, [r.kind]: (b.subs[r.kind] || []).map((g) => (g === r.from ? to : g)) }, types: b.types.map((t) => (t.type === r.kind && t.group === r.from ? { ...t, group: to } : t)) };
    });
    setSubSel((s) => ({ ...s, [r.kind]: to }));
  };
  // 922:13829: delete a sub-category with its groups and items, or move them to another sub-category first.
  const subCounts = (k, g) => {
    const list = board.types.filter((t) => t.type === k && t.group === g);
    return { groups: new Set([...(board.groups[gkey(k, g)] || []), ...list.map((t) => t.category).filter(Boolean)]).size, items: list.length };
  };
  const deleteSub = (target) => {
    const d = delSub; setDelSub(null); if (!d) return;
    const { kind: k, name: g } = d;
    setBoard((b) => {
      const groups = { ...b.groups };
      if (target) {
        const moved = groups[gkey(k, g)] || [];
        groups[gkey(k, target)] = [...new Set([...(groups[gkey(k, target)] || []), ...moved])];
      }
      delete groups[gkey(k, g)];
      const keep = (t) => !(t.type === k && t.group === g);
      const types = target
        ? b.types.map((t) => (keep(t) ? t : { ...t, group: target })).filter((t, i, all) => all.findIndex((x) => x.type === t.type && (x.group || '') === (t.group || '') && x.item.toLowerCase() === t.item.toLowerCase()) === i)
        : b.types.filter(keep);
      return { ...b, groups, subs: { ...b.subs, [k]: (b.subs[k] || []).filter((x) => x !== g) }, types };
    });
    setSubSel((s) => ({ ...s, [k]: target || '' })); setGroupSel('');
  };
  const renameGroup = (from, to) => {
    const name = String(to || '').trim();
    if (!name || name === from || groupNames.some((g) => g !== from && g.toLowerCase() === name.toLowerCase())) return;
    const key = gkey(sel, sub);
    setBoard((b) => ({ ...b, groups: { ...b.groups, [key]: (b.groups[key] || []).map((g) => (g === from ? name : g)) },
      types: b.types.map((t) => (t.type === sel && (t.group || '') === (sub || '') && t.category === from ? { ...t, category: name } : t)) }));
    if (groupSel === from) setGroupSel(name);
  };
  const deleteGroup = (c) => {
    const n = viewTypes.filter((t) => t.category === c).length;
    setEditGroup(null);
    confirm({
      title: `Are you sure you want to delete ${c}?`,
      description: n ? `This removes the group and its ${items(n)} from your board.` : 'This removes the group from your board.',
      onConfirm: async () => {
        const key = gkey(sel, sub);
        setBoard((b) => ({ ...b, groups: { ...b.groups, [key]: (b.groups[key] || []).filter((g) => g !== c) },
          types: b.types.filter((t) => !(t.type === sel && (t.group || '') === (sub || '') && t.category === c)) }));
        if (groupSel === c) setGroupSel('');
      },
    });
  };
  const patchType = (t, fn) => setBoard((b) => ({ ...b, types: b.types.map((x) => (x === t ? fn(x) : x)) }));
  const removeType = (t) => setBoard((b) => ({ ...b, types: b.types.filter((x) => x !== t) }));
  const addTypes = ({ group, category, items: list }) => {
    setBoard((b) => {
      const exists = (it) => b.types.some((x) => x.type === sel && x.item.toLowerCase() === it.toLowerCase() && (x.group || null) === (group || null));
      const subs = group && !(b.subs[sel] || []).includes(group) ? { ...b.subs, [sel]: [...(b.subs[sel] || []), group] } : b.subs;
      return { ...b, subs, types: [...b.types, ...list.filter((it) => !exists(it)).map((item) => ({ type: sel, group: group || null, category: category || null, item, budget: 0 }))] };
    });
    if ((group || '') !== (sub || '')) setSubSel((s) => ({ ...s, [sel]: group || '' }));
  };

  // A board item as a budget row (the Editing budget's row, 232:5853): the figure is the monthly budget.
  const [editing, setEditing] = useState(null);
  const rowOf = (t, i) => ({ key: i, item: t.item, value: fmtNum(t.budget), editing: editing === t, type: t.type, group: t.group, category: t.category });
  const rowsFor = (list) => (
    <div className="budget-items">
      {list.map((t, i) => (
        <BudgetRow key={(t.category || '') + '|' + t.item} r={rowOf(t, i)}
          onValue={(_, v) => patchType(t, (x) => ({ ...x, budget: parseAmount(v) }))}
          onEditing={(_, on) => setEditing(on ? t : null)} onRemove={() => removeType(t)} />
      ))}
    </div>
  );
  const addTypeLink = (category, cls, id) => (
    <div><ActionLink size={mobile ? 'medium' : undefined} icon={plus} className={cls} id={id} onClick={() => setModal({ kind: 'type', category: category || '' })}>Add item</ActionLink></div>
  );
  const isEmpty = !viewTypes.length && !shownGroups.length;
  const needSub = sel === 'expense' && !sub;
  const info = CAT_INFO[sel];
  const years = [...new Set([...Array.from({ length: 6 }, (_, i) => String(nowYear - i)), ...(imported ? imported.years.filter((y) => Number(y) <= nowYear) : [])])].sort().reverse();
  const months = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m, selectedLabel: m.slice(0, 3) })).filter((o) => Number(year) < nowYear || Number(o.value) <= new Date().getMonth());
  const subOptions = [...(sel === 'expense' ? [] : [NO_SUB]), ...subsOf(sel)];
  // 03b (931:27920) draws the Cancel icon and a plain "Add"; 03d (930:21383) no icon and "+ Add sub-category".
  const emptyIcon = mode === 'empty' ? cancel : false;

  // 401:4464 / 749:10871 (Oct 9): the right column is two titled boxes, "Start tracking from" (Year, Month) and
  // "Summary" (counts, note, Start tracking). Phones (853:10147 / 853:19253): both sit below the card.
  const aside = (
    <div className="ob-col ob-col-summary">
      <div className="ob-aside-sec">
        <h3 className="ob-col-title">Start tracking from</h3>
        <div className="ob-summary ob-from-box">
          <div className="ob-from-row">
            <Dropdown id="ob-year" size={mobile ? 'md' : 'tiny'} emptyOption={false} value={year} onChange={(v) => { setYear(v); if (Number(v) === nowYear && Number(month) > new Date().getMonth()) setMonth(String(new Date().getMonth())); }} options={years.map((y) => ({ value: y, label: y }))} ariaLabel="Year" />
            <Dropdown id="ob-month" size={mobile ? 'md' : 'tiny'} emptyOption={false} value={month} onChange={setMonth} options={months} ariaLabel="Month" />
          </div>
        </div>
      </div>
      <div className="ob-aside-sec">
        <h3 className="ob-col-title">Summary</h3>
        <div className="ob-summary">
          <div className="ob-summary-list">
            {board.kinds.map((k) => (
              <div key={k} className="ob-sum-cat">
                <div className="ob-sum-row"><span className="ob-sum-name">{label(k)}</span><span className="ob-sum-count">{itemCount(typesOf(k).length)}</span></div>
                {subsOf(k).length > 0 && (
                  <div className="ob-sum-subs">
                    {subsOf(k).map((g) => <div key={g} className="ob-sum-row ob-sum-sub"><span>{g}</span><span className="ob-sum-count">{itemCount(typesOf(k).filter((t) => t.group === g).length)}</span></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="ob-summary-cta">
            <p className="ob-summary-note">{mode === 'import' && imported && imported.months ? `${fmtCount(importedKept(imported, board, year, month))} will be imported. You can edit, add, or move categories at any time.` : 'You can rename or add categories later.'}</p>
            {error && <p className="ob-error" role="alert">{error}</p>}
            <Button id="ob-start" className="ob-full" disabled={busy || board.types.length === 0} onClick={() => onStart(board, { year, month: Number(month) })}>{saving ? `Adding ${Math.min(saving.done + 500, saving.total).toLocaleString('de-DE')} of ${saving.total.toLocaleString('de-DE')}…` : joint ? 'Continue' : 'Start tracking'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
  const isImport = mode === 'import' && imported;
  const subLabel = sel === 'expense' && mode !== 'empty' ? 'Sub-category' : 'Sub-category (optional)';
  return (
    <>
    <section className={'ob-card ob-setup ob-board' + (isImport ? ' ob-review' : '')} aria-labelledby="ob-setup-title">
      <div className="ob-card-head">
        <BackLink onClick={onBack}>{isImport ? 'Back to file upload' : 'Back to setup options'}</BackLink>
        <h2 className="ob-card-title" id="ob-setup-title">{isImport ? 'Review your setup' : 'Set up your board'}</h2>
        <p className="ob-card-text">{mode === 'template' ? 'Keep what fits and add your own. Nothing is locked in.' : isImport ? 'We’ve organized your file into top-level categories. You can rename, move, or delete items before continuing.' : 'Start with a category, then add your own items. Organize them only if you need to.'}</p>
      </div>
      {isImport && <ImportNote imported={imported} board={board} kept={importedKept(imported, board, year, month)} />}
      <div className="ob-setup-cols">
        <div className="ob-col ob-col-board">
          <h3 className="ob-col-title">Categories</h3>
          <div className="ob-board-top">
            <CategorySelector id="ob-cat" value={sel} onChange={pickKind} options={KINDS3.map((k) => ({ value: k, title: CAT_INFO[k].title, description: CAT_INFO[k].description }))} />
            <div className={'ob-board-fields' + (grouped ? '' : ' is-single')}>
              {subsOf(sel).length ? (
                <PickField id="ob-sub" label={subLabel} value={sub || ''} options={subOptions} createLabel={(l) => `Add "${l}" sub-category`}
                  placeholder="Select or type to create new sub-category" listLabel="Show the sub-categories" onPick={pickSub}>
                  {/* 401:4464: "Edit sub-category" (Small, 16px Edit) 8 under the field; it carries Delete. */}
                  <div className="ob-field-links"><ActionLink icon={edit} id="ob-edit-sub" disabled={!sub} onClick={() => setEditSub({ kind: sel, from: sub })}>Edit sub-category</ActionLink></div>
                </PickField>
              ) : (
                <EmptyField id="ob-sub-empty" label={subLabel} text="No sub-categories created" icon={emptyIcon}
                  actionLabel={mode === 'empty' ? 'Add' : 'Add sub-category'} actionId="ob-add-sub" onAdd={() => setSubModal(true)} />
              )}
              {grouped && (groupNames.length || groupTyping) ? (
                <PickField id="ob-group" label="Group (optional)" value={groupSel} options={[...(groupSel ? [ALL_GROUPS] : []), ...groupNames]} autoFocus={groupTyping}
                  placeholder="Select or type to create new group" listLabel="Show the groups" onPick={pickGroup}>
                  <div className="ob-field-links"><ActionLink icon={edit} id="ob-edit-group" disabled={!groupSel} onClick={() => setEditGroup({ from: groupSel })}>Edit group</ActionLink></div>
                </PickField>
              ) : grouped ? (
                <EmptyField id="ob-group-empty" label="Group (optional)" text="No groups created" icon={emptyIcon}
                  actionLabel={mode === 'empty' ? 'Add' : 'Add group'} actionId="ob-add-group" onAdd={() => setGroupTyping(true)} />
              ) : null}
            </div>
          </div>
          {isEmpty ? (
            <div className="ob-board-empty">
              {illustrations.emptyState && <Illustration art={illustrations.emptyState} width={120} />}
              <div className="ob-board-empty-text">
                <h4>{needSub ? 'Start with a sub-category' : info.empty}</h4>
                <p>{needSub ? 'Add a sub-category above, like Fixed or Variable. Then add your items.' : info.emptyText}</p>
              </div>
              {/* 749:10871 (Oct 12): a Tiny Primary button with a 12px Plus; the label follows the category. */}
              {!needSub && <Button size="tiny" icon={plus} id="ob-add-type" className="ob-add-type" onClick={() => setModal({ kind: 'type', category: groupSel || '' })}>{info.cta}</Button>}
            </div>
          ) : (
            <div className="budget-sections ob-board-groups">
              {loose.length > 0 && (
                <div className="budget-group ob-board-loose">
                  {rowsFor(loose)}
                  {addTypeLink('', 'ob-add-type', 'ob-add-type')}
                </div>
              )}
              {shownGroups.map((c, i) => {
                const list = viewTypes.filter((t) => t.category === c);
                return (
                  <BlockFrag key={c} divider={i > 0 || loose.length > 0}>
                    <div className="budget-group" data-category={c}>
                      <GroupHeader title={c} mobile={mobile} onAdd={() => setModal({ kind: 'type', category: c })} onRename={(to) => renameGroup(c, to)} onDelete={() => deleteGroup(c)} />
                      {list.length ? rowsFor(list) : <div className="budget-items is-empty"><span className="budget-group-empty">No items added yet.</span></div>}
                      {!mobile && addTypeLink(c, 'budget-group-add')}
                    </div>
                  </BlockFrag>
                );
              })}
            </div>
          )}
        </div>
        {!mobile && aside}
      </div>
      <TypeModal open={!!modal} kind={sel} kindName={label(sel)} group={sub || null} category={grouped ? (modal ? modal.category : '') : undefined}
        groups={subsOf(sel)} groupsOf={() => groupNames} onClose={() => setModal(null)}
        onSave={(t) => { addTypes(t); setModal(null); }} />
      <SubCategoryModal open={subModal} kind={sel} kindName={label(sel)} existing={subsOf(sel)} id="ob-sub-modal"
        onClose={() => setSubModal(false)} onSave={({ groups }) => { addSubs(groups); setSubModal(false); }} />
      <SubCategoryEditModal open={!!editSub} id="ob-rename-modal" kind={editSub ? editSub.kind : sel} kindName={label(editSub ? editSub.kind : sel)} value={editSub ? editSub.from : ''}
        existing={editSub ? subsOf(editSub.kind).filter((n) => n !== editSub.from) : []}
        onClose={() => setEditSub(null)} onSave={applyRename}
        onDelete={() => { const r = editSub; setEditSub(null); setDelSub({ kind: r.kind, name: r.from }); }} />
      <SubCategoryDeleteModal open={!!delSub} id="ob-delete-sub-modal" kind={delSub ? delSub.kind : sel} kindName={label(delSub ? delSub.kind : sel)} name={delSub ? delSub.name : ''}
        {...(delSub ? subCounts(delSub.kind, delSub.name) : {})} targets={delSub ? subsOf(delSub.kind).filter((n) => n !== delSub.name) : []}
        onClose={() => setDelSub(null)} onConfirm={deleteSub} />
      <SubCategoryEditModal open={!!editGroup} id="ob-group-modal" noun="group" kind={sel} kindName={label(sel)} value={editGroup ? editGroup.from : ''}
        existing={groupNames.filter((g) => editGroup && g !== editGroup.from)} onClose={() => setEditGroup(null)}
        onSave={(to) => { renameGroup(editGroup.from, to); setEditGroup(null); }} onDelete={() => deleteGroup(editGroup.from)} />
      {confirmModal}
    </section>
    {mobile && aside}
    </>
  );
}

// The joint board being created by /welcome?joint=new is remembered for this tab, so "Cancel board creation" can delete
// it after a reload too.
const JOINT_NEW_KEY = 'ongatu.jointNew';
const jointNewId = () => { try { return sessionStorage.getItem(JOINT_NEW_KEY); } catch { return null; } };
const setJointNewId = (id) => { try { if (id) sessionStorage.setItem(JOINT_NEW_KEY, id); else sessionStorage.removeItem(JOINT_NEW_KEY); } catch { /* ignore */ } };
const JOINT_STEPS = ['Setup', 'Name and share'];

export default function OnboardingApp() {
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  // Oct 15 (Ongatu 961:32094 → 961:32131 → 962:33477 → 962:33425): a joint board is set up here too, no tour:
  // /welcome?joint=new ("Create joint board") starts one from scratch (the board is created on the way), and a joint board
  // that has no years yet (made elsewhere) opens here when shown.
  const [jointNew] = useState(() => {
    if (typeof window === 'undefined' || new URLSearchParams(location.search).get('joint') !== 'new') return false;
    if (getActiveBoard()) setActiveBoard(null, null); // start from the personal board: nothing is written until it exists
    return true;
  });
  const [boardId, setBoardId] = useState(() => getActiveBoard());
  const sharedId = jointNew ? null : boardId; // an existing joint board opened for its setup
  const joint = jointNew || !!sharedId;
  const [boardInfo, setBoardInfo] = useState(null); // { name, role } of the joint board being set up
  const [boardName, setBoardName] = useState('');
  const [nameError, setNameError] = useState('');
  const [invites, setInvites] = useState([]); // [{ email, role, inviteId }] sent from Name and share
  const [pending, setPending] = useState(null); // { board, year, month } from Setup, kept for Name and share
  const [step, setStep] = useState(joint ? 'choose' : 'tour');
  const [card, setCard] = useState(0);
  const [mode, setMode] = useState(null);
  const [imported, setImported] = useState(null); // board-from-file result + fileName
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(null); // { done, total } while the imported entries are saved
  const [error, setError] = useState(null);
  const [toastEl, showToast] = useToast();
  // /welcome?preview=1: walk the whole flow on any account without saving anything (for testing the design).
  const preview = typeof window !== 'undefined' && new URLSearchParams(location.search).get('preview') === '1';
  const doneRef = useRef(false);
  const setDone = (v) => { doneRef.current = v; };

  useEffect(() => {
    getMe().then((m) => {
      if (m.status === 'pending') { location.href = '/pending'; return; }
      if (m.status === 'blocked') { location.href = '/blocked'; return; }
      setMe(m);
      setName(String(m.name || '').trim().split(/\s+/)[0] || '');
    }).catch(() => {});
    if (sharedId) boardsApi.get(sharedId).then((b) => { setBoardInfo({ name: b.name, role: b.role }); setBoardName(b.name); }).catch(() => setActiveBoard(null, '/'));
    // An account (or joint board) that already has years goes to its dashboard. A new joint board: nothing to check yet.
    const offY = jointNew ? () => {} : db.collection('years').onSnapshot((snap) => { if (snap.docs.length && !doneRef.current && !preview) leavePage('/'); });
    const offS = db.collection('settings').onSnapshot((snap) => {
      const p = snap.docs.find((d) => d.id === 'profile'); if (p && p.data().firstName) setName(p.data().firstName);
    });
    return () => { offY(); offS(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = step === 'tour' ? (card + 1) / (TOUR.length + 1) : step === 'choose' ? 1 / 3 : step === 'import' ? 1 / 2 : 2 / 3;
  const current = step === 'tour' ? 1 : 2;

  // The joint board, created the first time it's needed (Copy link, Send invite, Finish): it needs its name.
  const ensureBoard = async () => {
    if (boardId) return boardId;
    const n = boardName.trim();
    if (!n) { setNameError('Give your board a name first.'); const e = new Error('no name'); e.code = 'no_name'; document.getElementById('ob-board-name')?.focus(); throw e; }
    if (preview) return 'preview';
    const b = await boardsApi.create(n);
    setActiveBoard(b.id, null); // from now on the app's data calls go to the new board
    setJointNewId(b.id);
    setBoardId(b.id);
    setBoardInfo({ name: b.name, role: b.role });
    return b.id;
  };
  useEffect(() => { if (nameError && boardName.trim()) setNameError(''); }, [boardName, nameError]);

  // "Cancel board creation": a board created by this flow is deleted; otherwise back to the personal board.
  const cancelJoint = async () => {
    setBusy(true);
    try { if (boardId && boardId === jointNewId() && !preview) await boardsApi.remove(boardId); } catch { /* gone already */ }
    setJointNewId(null);
    setActiveBoard(null, '/');
  };

  const start = async (board, { year, month }) => {
    if (preview) { setStep('welcome'); return; }
    setBusy(true); setError(null); setDone(true);
    try {
      const now = new Date().toISOString();
      const taxonomy = taxonomyOfBoard(board);
      // An imported file: a year for each year of its entries from the start on (same board), then the entries.
      const entries = mode === 'import' && imported ? importedEntries(imported, board, year, month) : [];
      const yearsToMake = [...new Set([year, ...entries.map((e) => e.date.slice(0, 4))])].sort();
      for (const y of yearsToMake) {
        await db.collection('years').add({ year: y, currency: 'EUR', createdAt: now, taxonomy, ...(entries.length ? { source: 'import' } : {}) });
        for (const t of board.types) {
          const amount = Math.round((t.budget || 0) * 100) / 100;
          if (!(amount > 0)) continue;
          const group = t.group || null, category = t.category || null;
          await db.collection('budgets').add({ year: y, type: t.type, group, category, item: t.item, amount, createdAt: now });
          if (y === year) await db.doc('budgetDefaults/' + budgetDefaultDocId(t.type, group, category, t.item)).set({ type: t.type, group, category, item: t.item, amount, updatedAt: now });
        }
      }
      for (let i = 0; i < entries.length; i += 500) {
        setSaving({ done: i, total: entries.length });
        await api('POST', importPath(), { entries: entries.slice(i, i + 500) });
      }
      setSaving(null);
      // A joint board's setup doesn't touch the person's own onboarding (settings are personal).
      if (!joint) await db.doc('settings/onboarding').set({ done: true, startYear: year, startMonth: month, template: mode, at: now, ...(entries.length ? { importedFrom: imported.fileName, imported: entries.length } : {}) });
      setJointNewId(null);
      setStep('welcome');
    } catch (e) {
      setDone(false); setSaving(null);
      setError('Could not save your board: ' + (e && e.message ? e.message : 'unknown error'));
    } finally { setBusy(false); }
  };

  // Name and share → "Finish and start tracking": the board exists (and carries the name), then its setup is written.
  const finishJoint = async () => {
    if (!pending) { setStep('setup'); return; }
    setError(null);
    try {
      const id = await ensureBoard();
      const n = boardName.trim();
      if (!n) { setNameError('Give your board a name first.'); return; }
      if (!preview && boardInfo && n !== boardInfo.name && boardInfo.role === 'co_owner') { await boardsApi.rename(id, n); setBoardInfo((b) => ({ ...b, name: n })); }
    } catch (e) { if (e && e.code !== 'no_name') setError((e && e.message) || "Couldn't create the board."); return; }
    await start(pending.board, pending);
  };

  const showSteps = step !== 'welcome';
  const doneText = 'Your board is ready. Start tracking your finances and hitting your goals.';
  const mobile = useMobile();
  // A viewer can't set up an empty joint board: say so, and offer the personal board.
  if (sharedId && boardInfo && boardInfo.role === 'viewer') {
    return (
      <main className="ob-page is-mid">
        <div className="ob-content">
          <Header joint />
          <section className="ob-card" aria-labelledby="ob-empty-title">
            <div className="ob-card-head">
              <h2 className="ob-card-title" id="ob-empty-title">This board is empty for now</h2>
              <p className="ob-card-text">A co-owner or editor sets it up first. You can see it as soon as they do.</p>
            </div>
            <Button id="ob-to-personal" onClick={() => setActiveBoard(null, '/')}>Go to my board</Button>
          </section>
        </div>
      </main>
    );
  }
  // Phones (853:19308, Oct 9): "You're all set" is its own page, not a modal over the board: the Success illustration
  // (160) over the title (24/24) and text (16/20), 48 sides, and Go to your board (320) at the bottom.
  if (step === 'welcome' && mobile) {
    return (
      <main className="ob-page ob-welcome-page" id="ob-welcome">
        <div className="ob-welcome-body">
          <Illustration art={illustrations.success} width={160} />
          <div className="ob-welcome-text">
            <h1 className="ob-welcome-title">{`You're all set${name ? `, ${name}` : ''}!`}</h1>
            <p className="ob-welcome-desc">{doneText}</p>
          </div>
        </div>
        <Button id="ob-go" className="ob-welcome-go" onClick={() => leavePage('/')}>Go to your board</Button>
      </main>
    );
  }
  // The joint setup's two steps (961:32094): Setup (choose, then set up the board) and Name and share.
  const jointSteps = JOINT_STEPS.map((label) => ({ label, progress: 0.5 })); // the current step's bar is half full
  const pageWidth = step === 'setup' || step === 'welcome' ? ' is-wide' : step === 'choose' || step === 'import' || step === 'share' ? ' is-mid' : '';
  return (
    <main className={'ob-page' + pageWidth + (joint ? ' is-joint' : '')}>
      {me && (
        <div className="ob-content">
          <Header name={name} joint={joint} />
          {showSteps && (joint
            ? <StepProgress steps={jointSteps} current={step === 'share' ? 1 : 0} />
            : <StepProgress steps={STEPS.map((label) => ({ label, progress }))} current={current} />)}
          {step === 'tour' && <Tour card={card} setCard={setCard} onDone={() => setStep('choose')} />}
          {step === 'choose' && <Choose onPick={(m) => { setMode(m); setPending(null); setStep(m === 'import' ? 'import' : 'setup'); }} />}
          {step === 'import' && <ImportFile onBack={() => setStep('choose')} onDone={(r) => { setImported(r); setPending(null); setStep('setup'); }} />}
          {(step === 'setup' || (step === 'welcome' && !joint)) && mode && <Setup mode={mode} joint={joint} initial={pending} onBack={() => setStep(mode === 'import' ? 'import' : 'choose')}
            onStart={joint ? (board, at) => { setPending({ board, ...at }); setStep('share'); } : start}
            busy={busy} error={error} imported={mode === 'import' ? imported : null} saving={saving} />}
          {joint && (step === 'share' || step === 'welcome') && <NameAndShare me={me} name={boardName} setName={setBoardName} nameError={nameError} ensureBoard={ensureBoard} boardId={boardId}
            invites={invites} setInvites={setInvites} onBack={() => setStep('setup')} onCancel={cancelJoint} onFinish={finishJoint} busy={busy || !!saving} error={error} showToast={showToast} />}
          {joint && step !== 'share' && step !== 'welcome' && <div className="ob-joint-cta is-end"><CancelBoard onClick={cancelJoint} disabled={busy} /></div>}
        </div>
      )}
      <Modal open={step === 'welcome' && !mobile} id="ob-welcome" illustration={illustrations.success} illustrationWidth={160} onClose={() => leavePage('/')}
        title={`You're all set${name ? `, ${name}` : ''}!`} description={doneText}
        primary={{ label: 'Go to your board', onClick: () => leavePage('/'), id: 'ob-go' }} />
      {toastEl}
    </main>
  );
}
