// Opening a shared-board invite link (Oct 11): /join#<token>. The token stays in the URL fragment (never sent to the
// server with the page); the page reads it in the browser and asks the API. Signed out: the API's 401 sends the person
// to sign in, and the link resumes afterwards (the token waits in sessionStorage).
import { headers } from 'next/headers';
import JoinRoot from './JoinRoot.jsx';

export const metadata = { title: 'Your invitation · Ongatu', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await headers(); // per-request rendering, so Next applies the CSP nonce to its scripts (middleware.js)
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Martian+Mono:wght@300;400;500;600&display=swap" />
      <JoinRoot />
    </>
  );
}
