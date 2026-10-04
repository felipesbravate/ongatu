// Account page (name, picture, sign-in method, data). Like the tracker, the HTML carries no data: everything loads
// from /api, which enforces sign-in and approval.
import { headers } from 'next/headers';
import Root from '../../src/tracker/Root.jsx';

export const metadata = { title: 'Account · Ongatu', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic'; // a fresh CSP nonce per response (middleware.js)

export default async function Page() {
  await headers();
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Martian+Mono:wght@400;500;600&display=swap" />
      <Root view="account" />
    </>
  );
}
