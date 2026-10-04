// Client for this app's own API (same-origin, cookie-authenticated). Ported from public/legacy/claude-shim.js:
// the same db surface (collection().add/onSnapshot, doc().set/delete) and document reading (sample), so the
// tracker logic moved over unchanged. `window.claude` is kept too: tests and the legacy page use it.
const HEADERS = { 'content-type': 'application/json', 'x-requested-with': 'costs-tracker' };
// Data only changes through this page (one person per account), so no timed polling: reload on return to
// the tab, at most once a minute, and after this page's own writes.
const REFRESH_ON_FOCUS_MS = 60000;

function fail(status, body) {
  const e = (body && body.error) || {};
  if (status === 401) location.href = '/login';
  if (status === 403 && e.code === 'pending') location.href = '/pending';
  if (status === 403 && e.code === 'blocked') location.href = '/blocked';
  const err = new Error(e.message || `Request failed (${status})`);
  err.code = e.code || 'http_' + status;
  return err;
}

export async function api(method, path, body, signal) {
  let res;
  try {
    res = await fetch(path, { method, headers: HEADERS, credentials: 'same-origin', signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    if (e && e.name === 'AbortError') { const c = new Error('cancelled'); c.code = 'cancelled'; throw c; }
    const n = new Error('Network error'); n.code = 'network'; throw n;
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw fail(res.status, data);
  return data;
}

// ---------- db ----------
const listeners = {}; // collection -> [{ cb, err }]
const cache = {};     // collection -> last docs
const lastRefresh = {};
const snapshotOf = (docs) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })), size: docs.length, empty: docs.length === 0 });

// Leaving the page (the onboarding redirects): requests cut short by the navigation are not errors.
let leaving = false;
export function leavePage(url) { leaving = true; location.replace(url); }

async function refresh(name) {
  const subs = listeners[name] || [];
  if (!subs.length || leaving) return;
  lastRefresh[name] = Date.now();
  try {
    const r = await api('GET', '/api/db/' + encodeURIComponent(name));
    if (leaving || !r) return;
    cache[name] = r.docs;
    subs.slice().forEach((s) => { try { s.cb(snapshotOf(r.docs)); } catch (e) { console.error(e); } });
  } catch (e) {
    if (leaving) return;
    subs.slice().forEach((s) => { if (s.err) try { s.err(e); } catch (x) { console.error(x); } });
  }
}

let focusHooked = false;
function hookFocus() {
  if (focusHooked || typeof document === 'undefined') return;
  focusHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    Object.keys(listeners).forEach((n) => { if (Date.now() - (lastRefresh[n] || 0) > REFRESH_ON_FOCUS_MS) refresh(n); });
  });
}

export const db = {
  collection(name) {
    return {
      async add(data) { const r = await api('POST', '/api/db/' + encodeURIComponent(name), data); await refresh(name); return { id: r.id }; },
      onSnapshot(cb, err) {
        hookFocus();
        const sub = { cb, err };
        (listeners[name] = listeners[name] || []).push(sub);
        if (cache[name]) { const docs = cache[name]; Promise.resolve().then(() => cb(snapshotOf(docs))); }
        refresh(name);
        return () => { listeners[name] = (listeners[name] || []).filter((s) => s !== sub); };
      },
    };
  },
  doc(path) {
    const i = path.indexOf('/'); const name = path.slice(0, i), id = path.slice(i + 1);
    const url = '/api/db/' + encodeURIComponent(name) + '/' + encodeURIComponent(id);
    return {
      async set(data) { await api('PUT', url, data); await refresh(name); },
      async delete() { await api('DELETE', url); await refresh(name); },
    };
  },
};

// ---------- sample (document reading; nothing is stored server-side) ----------
const LIMITS = { maxPromptBytes: 65536, images: { mediaTypes: ['image/jpeg', 'image/png', 'image/webp'], maxCount: 6, maxInputBytes: 20 * 1048576 } };

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}
export async function sample(input, opts = {}) {
  if (typeof input !== 'string') { const e = new Error('string input only'); e.code = 'bad_input'; throw e; }
  const images = [];
  for (const b of opts.images || []) images.push({ mediaType: b.type || 'image/jpeg', data: await blobToBase64(b) });
  const r = await api('POST', '/api/read-document', { prompt: input, images }, opts.signal);
  return { text: r.text, truncated: false };
}
sample.json = async (input, opts) => {
  const r = await sample(input, opts);
  const t = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch {
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    const err = new Error('Claude did not return valid JSON'); err.code = 'bad_output'; throw err;
  }
};
sample.limits = async () => LIMITS;

// Same surface the legacy page had, for tests and tooling.
if (typeof window !== 'undefined') window.claude = { use: async (name) => (name === 'db' ? db : name === 'sample' ? sample : null) };

// ---------- account ----------
export const getMe = () => api('GET', '/api/me');
export const signOut = () => {
  try { sessionStorage.removeItem('ongatu.profile'); } catch { /* blocked */ }
  return fetch('/auth/signout', { method: 'POST', headers: HEADERS, credentials: 'same-origin' });
};
export const deleteMe = () => api('DELETE', '/api/me');           // erase everything and close the account
export const deleteMyData = () => api('DELETE', '/api/me/data');  // erase everything, keep the account
export const getSignIn = () => api('GET', '/api/account/sign-in');                  // { method: 'code' | 'password' }
export const setSignIn = (body) => api('POST', '/api/account/sign-in', body);         // { method, password?, current? }
export const listUsers = () => api('GET', '/api/admin/users');
export const setUserStatus = (id, act) => api('POST', '/api/admin/users/' + encodeURIComponent(id) + '/' + act);
