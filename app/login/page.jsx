// Sign in / create account (Ongatu 325:10734 and its steps 335:7580, 335:7542, 335:7606, 342:7702, 342:7885).
// The steps are plain forms posting to /auth/* (login, password, signup, verify); what a step shows comes from the
// short-lived httpOnly cookies those routes set. Someone already signed in goes straight to the tracker.
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginApp from '../../src/login/LoginApp.jsx';
import { currentUser } from '../../src/server/auth.js';
import { EMAIL_COOKIE, LOGIN_CTX_COOKIE, cleanEmail, decodeCtx } from '../../src/lib/otp-login.js';

export const metadata = { title: 'Sign in · Ongatu', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  email: { email: 'Enter a valid email address.', limit: 'Too many attempts. Wait a few minutes and try again.', 1: 'That sign-in link did not work. Enter your email to get a sign-in code instead.' },
  password: { password: "That password didn't work. Try again, or use Forgot the password?", limit: 'Too many attempts. Wait a few minutes and try again.' },
  code: { code: "That code didn't work. Check it, or re-send a new one (codes expire).", limit: 'Too many attempts. Wait a few minutes and try again.' },
  new: { name: 'Enter your name.', email: 'Enter a valid email address.', limit: 'Too many attempts. Wait a few minutes and try again.' },
};

export default async function Page({ searchParams }) {
  await headers(); // per-request rendering, so Next applies the CSP nonce to its scripts (middleware.js)
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (user) redirect('/');
  const q = (await searchParams) || {};
  const store = await cookies();
  const email = cleanEmail(store.get(EMAIL_COOKIE)?.value);
  const ctx = decodeCtx(store.get(LOGIN_CTX_COOKIE)?.value);
  let step = 'email';
  if (email && ctx) {
    if (q.step === 'password' && ctx.k === 'password') step = 'password';
    else if (q.step === 'code') step = 'code';
    else if (q.step === 'new' && ctx.k === 'new') step = 'new';
  }
  const err = typeof q.error === 'string' ? q.error : '';
  const message = (MESSAGES[step] && MESSAGES[step][err]) || null;
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Martian+Mono:wght@400;500;600&display=swap" />
      <LoginApp step={step} email={step === 'email' ? '' : email} kind={ctx ? ctx.k : 'code'} name={ctx ? ctx.n : ''}
        message={message} sent={q.sent === '1' && step === 'code'} />
    </>
  );
}
