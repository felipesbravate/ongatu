// The tracker. The HTML carries no data: everything loads from /api, which enforces sign-in and approval,
// and the page sends signed-out, pending and blocked visitors to /login, /pending and /blocked.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Root from '../src/tracker/Root.jsx';

export const metadata = { title: 'Ongatu - Smart finance', icons: { icon: 'data:,' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic'; // a fresh CSP nonce per response (middleware.js)

export default async function Page({ searchParams }) {
  // If Supabase falls back to the Site URL, an old sign-in link lands here: hand its code to the callback.
  const code = (await searchParams)?.code;
  if (typeof code === 'string' && code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  await headers(); // per-request rendering, so Next applies the nonce to its scripts
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Martian+Mono:wght@400;500;600&display=swap" />
      <Root />
    </>
  );
}
