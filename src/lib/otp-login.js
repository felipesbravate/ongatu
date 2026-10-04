// @ts-check
// Sign-in with a one-time code typed on the site (no link to click): link scanners and "opened in
// another browser" can't break it. Step 1 (/auth/login) emails the code and remembers the address in a
// short-lived httpOnly cookie; step 2 (/auth/verify) checks the code with Supabase.

export const EMAIL_COOKIE = 'ct_login_email';
export const EMAIL_COOKIE_MAX_AGE = 15 * 60; // seconds; Supabase codes expire sooner (1 h max)

/** Cookie options for the remembered address. @param {boolean} secure */
export const emailCookieOptions = (secure) => ({ httpOnly: true, secure, sameSite: /** @type {'lax'} */ ('lax'), path: '/', maxAge: EMAIL_COOKIE_MAX_AGE });

/** @param {unknown} v @returns {string|null} normalized email or null */
export function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase().slice(0, 254);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}
/** Digits only (people paste "123 456" or "123-456"); Ongatu's codes are 6 digits (Supabase Email OTP Length = 6). @param {unknown} v */
export function cleanCode(v) {
  const c = String(v || '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(c) ? c : null;
}

// What the sign-in pages show between steps, in a short-lived httpOnly cookie next to the address:
// { k: 'code' | 'password' | 'new', n: the greeting name }. And the full name typed on "Create account".
export const LOGIN_CTX_COOKIE = 'ct_login_ctx';
export const LOGIN_NAME_COOKIE = 'ct_login_name';

/** @param {{ k: string, n?: string }} c */
export const encodeCtx = (c) => Buffer.from(JSON.stringify({ k: c.k, n: String(c.n || '').slice(0, 80) })).toString('base64url');
/** @param {unknown} v @returns {{ k: 'code'|'password'|'new', n: string } | null} */
export function decodeCtx(v) {
  try {
    const c = JSON.parse(Buffer.from(String(v || ''), 'base64url').toString('utf8'));
    return c && ['code', 'password', 'new'].includes(c.k) ? { k: c.k, n: typeof c.n === 'string' ? c.n.slice(0, 80) : '' } : null;
  } catch { return null; }
}
export { cleanName, firstNameOf, greetingName } from './names.js';
