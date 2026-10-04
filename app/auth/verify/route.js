import { cookies } from 'next/headers';
import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';
import { EMAIL_COOKIE, LOGIN_CTX_COOKIE, LOGIN_NAME_COOKIE, cleanCode, cleanEmail, cleanName } from '../../../src/lib/otp-login.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

// Step 2: check the typed code (6 digits). Attempts are limited per address and per IP (a code must not be
// guessable); Supabase also rate-limits verification on its side. A name typed on "Create account" is saved on the
// account (user_metadata.full_name); the tracker copies it into Account > Profile on the first visit.
export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const store = await cookies();
  const email = cleanEmail(store.get(EMAIL_COOKIE)?.value);
  if (!email) return back('/login');
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!deps.verifyLimiter.take(`em:${email}`) || !deps.verifyLimiter.take(`ip:${ip}`)) return back('/login?step=code&error=limit');
  const form = await request.formData();
  // `code` from the page's script, else the six boxes (`c`) as typed before the script ran.
  const code = cleanCode(form.get('code') || form.getAll('c').join(''));
  if (!code) return back('/login?step=code&error=code');
  const sb = await authClient();
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) { console.error('[verify] code rejected:', error.status, error.code || error.message); return back('/login?step=code&error=code'); }
  const name = cleanName(decodeURIComponent(store.get(LOGIN_NAME_COOKIE)?.value || ''));
  if (name) {
    const r = await sb.auth.updateUser({ data: { full_name: name } });
    if (r.error) console.error('[verify] name not saved:', r.error.status, r.error.message);
  }
  store.delete(EMAIL_COOKIE); store.delete(LOGIN_CTX_COOKIE); store.delete(LOGIN_NAME_COOKIE);
  return back('/');
}
