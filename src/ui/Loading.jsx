'use client';
import { AppHeader, Logo } from './Brand.jsx';
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
