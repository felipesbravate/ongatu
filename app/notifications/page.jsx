// Notifications page (Ongatu 840:9143): the header bell's list in full, with All / Unread. Like the tracker, the HTML
// carries no data: everything loads from /api, which enforces sign-in and approval.
import { headers } from 'next/headers';
import NotificationsRoot from './NotificationsRoot.jsx';

export const metadata = { title: 'Notifications · Ongatu', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic'; // a fresh CSP nonce per response (middleware.js)

export default async function Page() {
  await headers();
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Martian+Mono:wght@300;400;500;600&display=swap" />
      <NotificationsRoot />
    </>
  );
}
