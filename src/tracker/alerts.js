'use client';
// Over-budget alerts for the bell: Variable, Additional and Extra expense items whose entries add up to more than the
// item's budget (model.budgetAlerts). Which ones the user has seen is kept in the vault (settings/notifications), so
// the red dot is the same on every device.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from './api.js';
import { createModel, foldLegacyCustom, yearsFromDocs } from './model.js';

// `seen`: alerts the bell has shown (the red dot goes when the list is opened). `read`: alerts the user marked as read
// ("Mark as read" on the item, Ongatu 211:19682); a read alert no longer offers the link. Both live in settings/notifications.
export function useSeenAlerts() {
  const [state, setState] = useState(null); // { seen: Set, read: Set }, null while loading
  useEffect(() => db.collection('settings').onSnapshot((snap) => {
    const d = snap.docs.find((x) => x.id === 'notifications');
    const v = d ? d.data() : null;
    setState({ seen: new Set(v && Array.isArray(v.seen) ? v.seen : []), read: new Set(v && Array.isArray(v.read) ? v.read : []) });
  }), []);
  const save = useCallback((next) => {
    setState({ seen: new Set(next.seen), read: new Set(next.read) });
    db.doc('settings/notifications').set(next).catch(() => {});
  }, []);
  const markSeen = useCallback((ids) => {
    if (!state || ids.every((id) => state.seen.has(id))) return;
    save({ seen: [...new Set([...state.seen, ...ids])].slice(-300), read: [...state.read] });
  }, [state, save]);
  const markRead = useCallback((id) => {
    if (!state || state.read.has(id)) return;
    save({ seen: [...new Set([...state.seen, id])].slice(-300), read: [...state.read, id].slice(-300) });
  }, [state, save]);
  return [state ? state.seen : null, markSeen, state ? state.read : null, markRead];
}

const COLLECTIONS = ['years', 'entries', 'overrides', 'budgets', 'budgetDefaults'];
// For pages without the tracker's model (Account): loads what the alerts need and builds the model.
export function useBudgetAlertsStandalone() {
  const [data, setData] = useState({ years: [], entries: [], overrides: [], budgets: [], budgetDefaults: [] });
  useEffect(() => {
    const offs = COLLECTIONS.map((name) => db.collection(name).onSnapshot((snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setData((x) => ({ ...x, [name]: docs }));
    }));
    return () => offs.forEach((off) => off());
  }, []);
  return useMemo(() => { const f = foldLegacyCustom(data); return createModel({ data: yearsFromDocs(f.years), entries: f.entries, overrides: f.overrides, budgets: f.budgets, budgetDefaults: f.budgetDefaults }).budgetAlerts(); }, [data]);
}
