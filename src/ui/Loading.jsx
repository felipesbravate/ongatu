'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader, Logo } from './Brand.jsx';
import { Illustration } from './Modal.jsx';
import { calculating } from './illustrations.js';
import './okara.css';
import './loading.css';

export function Skeleton({ kind = 'line' }) {
  return <span className={`skeleton skeleton--${kind}`} aria-hidden="true" />;
}

export function LoginSkeletonContent() {
  return <div className="skeleton-stack" aria-hidden="true"><Skeleton kind="title" /><Skeleton kind="field" /><Skeleton kind="field" /></div>;
}

// A spinning ring (Oct 9): 32px, 3px track in surface/secondary, the turning quarter in surface/accent.
export function Spinner({ size = 32, className }) {
  return <span className={['ds-spinner', className].filter(Boolean).join(' ')} style={{ width: size, height: size }} aria-hidden="true" />;
}

// Sign in / Create account while the page loads (Oct 9, Felipe): the logo and tagline where the page puts them, and a
// spinner instead of a skeleton (a skeleton of the form, or of the dashboard, read as content that never came).
export function LoginLoading() {
  return <main className="login-page is-loading-page" aria-busy="true">
    <div className="login-content">
      <header className="login-header"><Logo variant="vertical" height={104} /><p className="login-tagline">Take charge of your money</p></header>
      <div className="login-spinner"><Spinner /><p className="loading-status" role="status">Loading sign-in…</p></div>
    </div>
  </main>;
}

export function LoginSkeleton() {
  return <main className="login-page" aria-busy="true">
    <div className="login-content">
      <header className="login-header"><Logo variant="vertical" height={104} /><p className="login-tagline">Take charge of your money</p></header>
      <section className="login-card"><LoginSkeletonContent /><p className="loading-status" role="status">Loading sign-in…</p></section>
    </div>
  </main>;
}

function PlaceholderCard({ rows = 3 }) {
  return <div className="loading-card" aria-hidden="true"><Skeleton kind="label" /><Skeleton kind="title" />
    {Array.from({ length: rows }, (_, i) => <div className="loading-row" key={i}><Skeleton /><Skeleton kind="value" /></div>)}
  </div>;
}

export function AppSkeleton({ error, account = false }) {
  return <>
    <div className="app-top-gap" />
    <AppHeader><Skeleton kind="avatar" /></AppHeader>
    <main className="wrap loading-page" aria-busy={!error}>
      <p className="loading-status" role={error ? 'alert' : 'status'}>{error ? 'We couldn’t load your account. Check your connection and try again.' : account ? 'Loading your account…' : 'Loading your dashboard…'}</p>
      {error && <button className="btn-pill secondary" onClick={() => window.location.reload()}>Try again</button>}
      <div aria-hidden="true" className="loading-heading skeleton-stack"><Skeleton kind="title" /><Skeleton /></div>
      <div className="loading-tabs" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <Skeleton kind="tab" key={i} />)}</div>
      <div className="row1"><div className="hero-left"><PlaceholderCard rows={2} /><PlaceholderCard rows={3} /></div>
        <div className="hero-right"><PlaceholderCard rows={account ? 3 : 6} /><PlaceholderCard rows={2} /></div>
      </div>
    </main>
  </>;
}

// Busy overlay (Oct 24, Felipe; Ongatu 1106:41629 desktop / 1106:41718 phones): saving a month's budget or many entries
// makes the app recalculate everything, and the screen can't be used for a few seconds. A modal <dialog> (top layer, so
// it covers open panels and modals too; the page behind is inert, Escape does nothing) on surface/modal with the Modal
// card: the Calculating illustration (72 high), the title in Heading/XL and "This may take a few seconds." in
// Body/Default/Regular, text/secondary, all centred.
export function BusyOverlay({ message, hint = 'This may take a few seconds.' }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute('open', ''); } }
    return () => { if (d && d.open) d.close(); };
  }, []);
  return <dialog ref={ref} className="ds-busy" id="busy-overlay" aria-busy="true" aria-labelledby="busy-overlay-title" onCancel={(e) => e.preventDefault()}>
    <div className="ds-busy-card" role="status">
      <div className="ds-busy-art"><Illustration art={calculating} width={BUSY_ART_W} /></div>
      <div className="ds-busy-text"><p className="ds-busy-title" id="busy-overlay-title">{message}</p><p className="ds-busy-hint">{hint}</p></div>
    </div>
  </dialog>;
}
const BUSY_ART_W = Math.round((72 * calculating.width / calculating.height) * 100) / 100; // 72 high

const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));

/** [overlay, run]: run(message, fn) shows the overlay, lets it paint, runs fn, and hides it once the result is drawn. */
export function useBusy() {
  const [message, setMessage] = useState(null);
  const run = useCallback(async (msg, fn) => {
    setMessage(msg);
    await nextPaint(); // the overlay is on screen before the heavy part starts
    try { return await fn(); }
    finally { await nextPaint(); await nextPaint(); setMessage(null); } // the recalculated screen is drawn first
  }, []);
  return [message ? <BusyOverlay message={message} /> : null, run];
}
