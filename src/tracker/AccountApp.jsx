'use client';
// Account page (Cost-tracker/Ongatu 250:3399, Security states 283:4288 / 283:4351 / 283:4409): the App header, "Return
// to dashboard", a menu on the left (Side menu 304:553: Edit profile, Security, Data and privacy) and three cards: Personal information
// (picture, first/last name, email), Security (sign-in code or password, one or the other) and Data and privacy
// (import, export, clear all data, delete account). Destructive actions ask first in the confirm modal.
import { useEffect, useRef, useState } from 'react';
import '../ui/okara.css';
import '../ui/shell.css';
import { ActionLink, AppHeader, Avatar, Button, Checkbox, Divider, Field, Input, MobileBottomNav, SideMenu, Toggle, useToast } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { arrowStraightLeft, cancel, lock, security, trash, user } from '../ui/icons.js';
import { api, deleteMe, deleteMyData, getMe, getSignIn, setSignIn, signOut } from './api.js';
import { AccountNav } from './AccountBar.jsx';
import { useConfirm } from './ConfirmModal.jsx';
import { useBudgetAlertsStandalone } from './alerts.js';
import { avatarFromFile, removeAvatar, saveAvatar, saveProfile, useProfile } from './profile.js';

// Side menu labels and icons as in Ongatu 250:3399 (Sept 28).
const SECTIONS = [
  { id: 'profile', label: 'Personal information', icon: user },
  { id: 'security', label: 'Security', icon: lock },
  { id: 'data', label: 'Data & privacy', icon: security },
];
const EXPORT_COLLECTIONS = ['years', 'entries', 'budgets', 'budgetDefaults', 'overrides', 'settings'];

export default function AccountApp() {
  const [me, setMe] = useState(null);
  const profile = useProfile(me);
  const [confirmModal, confirm] = useConfirm();
  const [toastEl, showToast] = useToast();
  const [active, setActive] = useState('profile');
  const alerts = useBudgetAlertsStandalone();

  useEffect(() => {
    getMe().then((m) => {
      if (m.status === 'pending') location.href = '/pending';
      else if (m.status === 'blocked') location.href = '/blocked';
      else setMe(m);
    }).catch(() => {});
  }, []);

  // The menu follows the card in view; clicking an item scrolls to its card.
  useEffect(() => {
    if (!me) return undefined;
    const onScroll = () => {
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el && el.getBoundingClientRect().top < 160) cur = s.id; }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) cur = SECTIONS[SECTIONS.length - 1].id;
      setActive(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [me]);

  if (!me) return null;
  return (
    <>
      <div className="app-top-gap" />
      <AppHeader><AccountNav me={me} profile={profile} alerts={alerts} onOpenAlert={(a) => { location.href = '/?alert=' + encodeURIComponent([a.year, a.mi, a.group].join('|')); }} /></AppHeader>
      <div className="wrap acct-page">
        <header className="acct-head">
          <ActionLink href="/" icon={arrowStraightLeft} id="acct-back">Return to dashboard</ActionLink>
          <h1 className="app-title">Account</h1>
          <div className="app-sub">Manage your personal identity, security preferences, and data privacy controls.</div>
        </header>
        <div className="acct-content">
          <SideMenu className="acct-menu" label="Account sections" value={active}
            items={SECTIONS.map((s) => ({ key: s.id, id: 'menu-' + s.id, label: s.label, icon: s.icon, href: '#' + s.id }))}
            onSelect={(key, e) => { e.preventDefault(); setActive(key); document.getElementById(key).scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
          <div className="acct-cards">
            <ProfileCard me={me} profile={profile} confirm={confirm} showToast={showToast} />
            <SecurityCard showToast={showToast} />
            <DataCard me={me} confirm={confirm} showToast={showToast} />
          </div>
        </div>
      </div>
      <MobileBottomNav selection="account" image={profile.image} onAdd={() => { location.href = '/?add=1'; }} />
      {toastEl}
      {confirmModal}
    </>
  );
}

function ProfileCard({ me, profile, confirm, showToast }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const seeded = useRef(false);
  useEffect(() => {
    if (profile.loaded && !seeded.current) { seeded.current = true; setFirst(profile.firstName); setLast(profile.lastName); }
  }, [profile.loaded, profile.firstName, profile.lastName]);

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await saveAvatar(await avatarFromFile(f)); showToast('Picture updated.', 'success'); }
    catch { showToast("Couldn't use that picture. Try a JPG or PNG.", 'fail'); }
  };
  const askRemove = () => confirm({
    title: 'Are you sure you want to delete your picture?',
    description: 'Your initial shows in its place.',
    onConfirm: async () => { try { await removeAvatar(); showToast('Picture deleted.', 'success'); } catch { showToast("Couldn't delete the picture.", 'fail'); } },
  });
  const save = async () => {
    setSaving(true);
    try { await saveProfile(first, last); showToast('Changes saved.', 'success'); }
    catch { showToast("Couldn't save your changes.", 'fail'); }
    finally { setSaving(false); }
  };
  return (
    <section className="acct-card" id="profile" aria-labelledby="profile-title">
      <div className="acct-card-head"><h2 id="profile-title">Personal information</h2><p>Edit your personal information.</p></div>
      <div className="acct-card-body">
        <div className="acct-avatar-row">
          <Avatar large name={profile.name} image={profile.image} />
          <div className="acct-avatar-actions">
            {/* 250:3399: "Add image" (Button Tiny Secondary, 32 high) and a 32px tertiary Round button with a 12px Trash. */}
            <Button size="tiny" variant="secondary" id="avatar-upload" onClick={() => fileRef.current && fileRef.current.click()}>Add image</Button>
            <button type="button" className="round-btn small is-destructive" id="avatar-delete" aria-label="Delete picture" disabled={!profile.image} onClick={askRemove}><Icon icon={trash} size={12} /></button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden id="avatar-file" onChange={onFile} />
          </div>
        </div>
        <div className="acct-form">
          <div className="acct-row">
            <Field label="First name" htmlFor="first-name"><Input id="first-name" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" placeholder="First name" /></Field>
            <Field label="Last name" htmlFor="last-name"><Input id="last-name" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" placeholder="Last name" /></Field>
          </div>
          <div className="acct-row">
            <Field label="Email" htmlFor="email"><Input id="email" icon={lock} value={me.email} disabled readOnly /></Field>
          </div>
        </div>
      </div>
      <div className="acct-actions"><Button id="profile-save" onClick={save} disabled={saving}>Save changes</Button></div>
    </section>
  );
}

// Security: the sign-in code is the default. Turning Password on shows Password + Repeat password (Save password);
// with a password set it shows Current + New password (Change password). Turning the code back on shows Save changes.
function SecurityCard({ showToast }) {
  const [method, setMethod] = useState(null);   // what the account uses: 'code' | 'password' (null while loading)
  const [chosen, setChosen] = useState(null);   // what the toggles show
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    getSignIn().then((r) => { setMethod(r.method); setChosen(r.method); }).catch(() => { setUnavailable(true); setMethod('code'); setChosen('code'); });
  }, []);
  const pick = (m) => { setChosen(m); setA(''); setB(''); setErr(''); };
  const run = async (body, done) => {
    setBusy(true); setErr('');
    try { const r = await setSignIn(body); setMethod(r.method); setChosen(r.method); setA(''); setB(''); showToast(done, 'success'); }
    catch (e) { setErr(e.code === 'wrong_password' ? 'The current password is not right.' : e.code === 'weak_password' ? e.message + '.' : "Couldn't save. Try again."); }
    finally { setBusy(false); }
  };
  const savePassword = () => {
    if (a !== b) { setErr("The passwords don't match."); return; }
    run({ method: 'password', password: a }, 'Password saved. Use it the next time you sign in.');
  };
  const changePassword = () => run({ method: 'password', current: a, password: b }, 'Password changed.');
  const useCode = () => run({ method: 'code' }, "Saved. You'll get a sign-in code by email next time.");
  const setting = chosen === 'password' && method === 'code';
  const changing = chosen === 'password' && method === 'password';
  return (
    <section className="acct-card" id="security" aria-labelledby="security-title">
      <div className="acct-card-head"><h2 id="security-title">Security</h2><p>Choose your preferred sign-in method.</p></div>
      <div className="acct-card-body">
        <div className="acct-option">
          <div className="acct-meta"><h3>Sign-in code</h3><p>Receive a secure, one-time code to your registered email each time you log in.</p></div>
          <Toggle id="toggle-code" label="Sign-in code" on={chosen === 'code'} disabled={!chosen || busy || unavailable} onChange={(on) => pick(on ? 'code' : 'password')} />
        </div>
        <Divider />
        <div className="acct-option-group">
          <div className="acct-option">
            <div className="acct-meta"><h3>Password</h3><p>Use a traditional password to access your account.</p></div>
            <Toggle id="toggle-password" label="Password" on={chosen === 'password'} disabled={!chosen || busy || unavailable} onChange={(on) => pick(on ? 'password' : 'code')} />
          </div>
          {(setting || changing) && (
            <div className="acct-form" id="pw-form">
              <div className="acct-row">
                <Field label={setting ? 'Password' : 'Current password'} htmlFor="pw-a"><Input id="pw-a" type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="Password" autoComplete={setting ? 'new-password' : 'current-password'} /></Field>
                <Field label={setting ? 'Repeat password' : 'New password'} htmlFor="pw-b"><Input id="pw-b" type="password" value={b} onChange={(e) => setB(e.target.value)} placeholder="Password" autoComplete="new-password" /></Field>
              </div>
            </div>
          )}
          {err && <p className="acct-error" role="alert" id="security-error">{err}</p>}
          {setting && <div className="acct-actions"><Button id="pw-save" onClick={savePassword} disabled={busy || !a || !b}>Save password</Button></div>}
          {changing && <div className="acct-actions"><Button id="pw-change" onClick={changePassword} disabled={busy || !a || !b}>Change password</Button></div>}
        </div>
        {unavailable && <p className="acct-note">Password sign-in isn't available right now.</p>}
      </div>
      {chosen === 'code' && method === 'password' && <div className="acct-actions"><Button id="signin-save" onClick={useCode} disabled={busy}>Save changes</Button></div>}
    </section>
  );
}

function DataCard({ me, confirm, showToast }) {
  const [sure, setSure] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      const out = { exportedAt: new Date().toISOString(), account: me.email };
      for (const c of EXPORT_COLLECTIONS) out[c] = (await api('GET', '/api/db/' + c)).docs.map((d) => ({ id: d.id, ...d.data }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `ongatu-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Your data was downloaded.', 'success');
    } catch { showToast("Couldn't export your data.", 'fail'); }
    finally { setExporting(false); }
  };
  const clearData = () => confirm({
    title: 'Are you sure you want to delete all your data?',
    description: 'All your years, entries and budgets will be permanently deleted. Your account and profile stay.',
    onConfirm: async () => { try { await deleteMyData(); showToast('All your data was deleted.', 'success'); } catch { showToast("Couldn't delete your data.", 'fail'); } },
  });
  const deleteAccount = () => confirm({
    title: 'Are you sure you want to delete your account?',
    description: `Your account, your sign-in and all your data will be permanently deleted, and you'll be signed out.`,
    onConfirm: async () => { await deleteMe(); await signOut(); location.href = '/login'; },
  });
  return (
    <section className="acct-card" id="data" aria-labelledby="data-title">
      <div className="acct-card-head"><h2 id="data-title">Data &amp; privacy</h2><p>Manage your data with Ongatu.</p></div>
      <div className="acct-card-body acct-data">
        <div className="acct-data-row">
          <div className="acct-meta"><h3>Import</h3><p>Import your data from different platforms or spreadsheet.</p></div>
          <Button size="small" variant="secondary" id="import-btn" onClick={() => { location.href = '/?add=1'; }}>Import data</Button>
        </div>
        <Divider />
        <div className="acct-data-row">
          <div className="acct-meta"><h3>Portability</h3><p>Download a complete copy of your financial logs, categories, and transaction ledger stored on Ongatu, as one JSON file.</p></div>
          <Button size="small" variant="secondary" id="export-btn" onClick={exportData} disabled={exporting}>Export data</Button>
        </div>
        <Divider />
        <div className="acct-data-row">
          <div className="acct-meta"><h3>Wipe stored spending and savings history</h3><p>This clears your entries, custom tags, budgets, and historical ledgers. Your login credentials and account settings remain preserved.</p></div>
          <Button size="small" variant="secondary" className="is-destructive" id="delete-data-btn" onClick={clearData}>Clear all data</Button>
        </div>
        <Divider />
        <div className="acct-data-row">
          <div className="acct-meta">
            <h3>Permanently close and delete account</h3>
            <p>Completely erase your credentials, billing context, settings, and all active tracking histories. This action cannot be undone.</p>
            <Checkbox id="delete-confirm" checked={sure} onChange={setSure}>I confirm that I want to close my account and permanently delete all associated data.</Checkbox>
          </div>
          <Button size="small" variant="destructive" icon={cancel} id="delete-account-btn" onClick={deleteAccount} disabled={!sure}>Delete account</Button>
        </div>
      </div>
    </section>
  );
}
