// Web build (trial, Nov 25): signing in happens on the Next.js site (/login, httpOnly cookies), so there is no
// Supabase client in the page. This stands in for the three calls session.tsx makes: a "session" exists when the
// site's /api/me answers; signing out posts /auth/signout and returns to /login.
// @ts-ignore plain JS module shared with the Next.js app
import { getMe, signOut as webSignOut } from '../../../src/tracker/api.js';

type Listener = (event: string, session: any) => void;
const listeners = new Set<Listener>();
export const supabase = {
  auth: {
    async getSession() {
      try { const me = await getMe(); return { data: { session: me ? { user: { id: 'web', email: me.email } } : null } }; }
      catch { return { data: { session: null } }; }
    },
    onAuthStateChange(cb: Listener) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
    async signOut() { await webSignOut(); listeners.forEach((l) => l('SIGNED_OUT', null)); location.assign('/login'); },
  },
};
