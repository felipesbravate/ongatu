import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Supabase client bound to the request cookies (anon key: it can only run auth calls, the tables are locked). */
export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* called from a read-only context */ } },
    },
  });
}

/** Verified user or null. getUser() re-validates the JWT with Supabase; never trust getSession() alone on the server. */
export async function currentUser() {
  const sb = await authClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  const full = data.user.user_metadata && data.user.user_metadata.full_name;
  return { id: data.user.id, email: data.user.email ?? null, name: typeof full === 'string' ? full.slice(0, 80) : null };
}

/**
 * Native app: the access token arrives as `Authorization: Bearer <jwt>` instead of a cookie.
 * Same rule as above: getUser(jwt) re-validates it with Supabase. Returns the user or null.
 * @param {string} token
 */
export async function userFromBearer(token) {
  if (!token || token.length > 4096) return null;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const full = data.user.user_metadata && data.user.user_metadata.full_name;
  return { id: data.user.id, email: data.user.email ?? null, name: typeof full === 'string' ? full.slice(0, 80) : null };
}

