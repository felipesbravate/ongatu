// Members & board settings (Ongatu 938:33224 / 938:32167, Oct 13): one joint board's name, members and their access,
// and invitations. Like the Account page, the HTML carries no data: everything loads from /api, which enforces sign-in,
// approval and the member's role.
import { headers } from 'next/headers';
import BoardSettingsRoot from './BoardSettingsRoot.jsx';

export const metadata = { title: 'Board settings · Ongatu', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic'; // a fresh CSP nonce per response (middleware.js)

export default async function Page() {
  await headers();
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Inter:opsz,wght@14..32,100..900&family=Martian+Mono:wght@300;400;500;600&display=swap" />
      <BoardSettingsRoot />
    </>
  );
}
