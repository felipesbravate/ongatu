import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api, loadAll, type Collections } from './api';
import { createModel, yearsFromDocs } from './shared';

type Me = { email: string; status: 'approved' | 'pending' | 'blocked'; isAdmin: boolean; name: string | null };
type Ctx = {
  session: Session | null; ready: boolean; me: Me | null; data: Collections | null; model: any; error: string | null;
  reload: () => Promise<void>; signOut: () => Promise<void>;
};
const C = createContext<Ctx | null>(null);
const RELOAD_ON_FOCUS_MS = 60_000; // same rule as the web: reload on return, at most once a minute

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Collections | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const m = await api<Me>('GET', '/api/me');
      setMe(m);
      if (m.status === 'approved') { setData(await loadAll()); setLoadedAt(Date.now()); }
    } catch (e: any) { setError(e?.message ?? 'Something went wrong'); }
  }, []);

  useEffect(() => { if (session) reload(); else { setMe(null); setData(null); } }, [session?.user.id]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && session && Date.now() - loadedAt > RELOAD_ON_FOCUS_MS) reload(); });
    return () => sub.remove();
  }, [session, loadedAt]);

  const model = useMemo(() => data && createModel({ data: yearsFromDocs(data.years), entries: data.entries, overrides: data.overrides, budgets: data.budgets, budgetDefaults: data.budgetDefaults }), [data]);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);
  return <C.Provider value={{ session, ready, me, data, model, error, reload, signOut }}>{children}</C.Provider>;
}

export function useSession() { const c = useContext(C); if (!c) throw new Error('SessionProvider missing'); return c; }
