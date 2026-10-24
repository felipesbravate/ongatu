import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api, loadAll, loadSome, type Collections, type CollectionName } from './api';
import { createModel, yearsFromDocs } from './shared';

type Me = { email: string; status: 'approved' | 'pending' | 'blocked'; isAdmin: boolean; name: string | null };
// Writes (Oct 24, same rule as the web's db.batch): every add / set / delete inside write() only marks its collection;
// the marked collections reload once when write() ends, so the model is rebuilt once, not after every row.
export type Writer = {
  add: (col: CollectionName, doc: Record<string, unknown>) => Promise<string>;
  set: (col: CollectionName, id: string, doc: Record<string, unknown>) => Promise<void>;
  del: (col: CollectionName, id: string) => Promise<void>;
};
type Ctx = {
  session: Session | null; ready: boolean; me: Me | null; data: Collections | null; model: any; error: string | null;
  reload: () => Promise<void>; signOut: () => Promise<void>;
  /** Runs fn's writes, then reloads the collections they touched, once. Resolves with fn's result and the new data. */
  write: <T>(fn: (db: Writer) => Promise<T>) => Promise<{ result: T; data: Collections | null }>;
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
  const dataRef = useRef<Collections | null>(null); dataRef.current = data;

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
  const write = useCallback(async <T,>(fn: (db: Writer) => Promise<T>) => {
    const dirty = new Set<CollectionName>();
    const path = (col: CollectionName, id?: string) => '/api/db/' + col + (id ? '/' + encodeURIComponent(id) : '');
    const db: Writer = {
      add: async (col, doc) => { dirty.add(col); return (await api<{ id: string }>('POST', path(col), doc)).id; },
      set: async (col, id, doc) => { dirty.add(col); await api('PUT', path(col, id), doc); },
      del: async (col, id) => { dirty.add(col); await api('DELETE', path(col, id)); },
    };
    const refresh = async () => {
      if (!dirty.size) return;
      const fresh = await loadSome([...dirty]);
      const next = { ...(dataRef.current as Collections), ...fresh };
      dataRef.current = next; setData(next); setLoadedAt(Date.now());
    };
    let result: T;
    try { result = await fn(db); }
    catch (e) { await refresh().catch(() => {}); throw e; } // what did get saved still shows
    await refresh();
    return { result, data: dataRef.current }; // write() resolves before React redraws: callers can build a model from this
  }, []) as Ctx['write'];
  return <C.Provider value={{ session, ready, me, data, model, error, reload, signOut, write }}>{children}</C.Provider>;
}

export function useSession() { const c = useContext(C); if (!c) throw new Error('SessionProvider missing'); return c; }
