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

// ---------- active board (Oct 11) ----------
// Which board the app shows: the personal one ('' / null) or a shared board's id, remembered per browser. Switching
// reloads the page, so every listener and cache starts over on the new board. `settings` (name, picture, onboarding,
// notifications) are the person's own, so they always go to the personal board.
const BOARD_KEY = 'ongatu.board';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let activeBoard = null;
try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(BOARD_KEY) : null; activeBoard = v && UUID_RE.test(v) ? v : null; } catch { activeBoard = null; }
export const getActiveBoard = () => activeBoard;
/** Show another board: a shared board's id, or null for the personal board. `go` = where to land (default '/'). */
export function setActiveBoard(id, go = '/') {
  try { if (id) localStorage.setItem(BOARD_KEY, id); else localStorage.removeItem(BOARD_KEY); } catch { /* private mode: this tab only */ }
  activeBoard = id || null;
  if (go) location.assign(go);
}
const collectionBase = (name) => (activeBoard && name !== 'settings' ? `/api/boards/${activeBoard}/db/` : '/api/db/');
/** Where an import goes: the active board. */
export const importPath = () => (activeBoard ? `/api/boards/${activeBoard}/import/commit` : '/api/import/commit');

// ---------- db ----------
const listeners = {}; // collection -> [{ cb, err }]
const cache = {};     // collection -> last docs
const lastRefresh = {};
const snapshotOf = (docs) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })), size: docs.length, empty: docs.length === 0 });

// Leaving the page (the onboarding redirects): requests cut short by the navigation are not errors.
let leaving = false;
export function leavePage(url) { leaving = true; location.replace(url); }

// Batches (Oct 24): every write reloads its whole collection and redraws the app, so 40 budget rows meant 40 reloads
// and 40 full recalculations, the screen frozen in between. Inside db.batch() writes only mark their collection;
// each marked collection reloads once when the outermost batch ends.
let batchDepth = 0;
const dirty = new Set();
async function refresh(name) {
  if (batchDepth > 0) { dirty.add(name); return; }
  const subs = listeners[name] || [];
  if (!subs.length || leaving) return;
  lastRefresh[name] = Date.now();
  try {
    const r = await api('GET', collectionBase(name) + encodeURIComponent(name));
    if (leaving || !r) return;
    cache[name] = r.docs;
    subs.slice().forEach((s) => { try { s.cb(snapshotOf(r.docs)); } catch (e) { console.error(e); } });
  } catch (e) {
    if (leaving) return;
    subs.slice().forEach((s) => { if (s.err) try { s.err(e); } catch (x) { console.error(x); } });
  }
}

let focusHooked = false;
// On a shared board other members write too: refresh every 45 s while the tab is visible, and on return to it.
const SHARED_POLL_MS = 45000;
function hookFocus() {
  if (focusHooked || typeof document === 'undefined') return;
  focusHooked = true;
  if (activeBoard) setInterval(() => { if (document.visibilityState === 'visible') Object.keys(listeners).forEach((n) => { if (n !== 'settings') refresh(n); }); }, SHARED_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    Object.keys(listeners).forEach((n) => { if (Date.now() - (lastRefresh[n] || 0) > (activeBoard ? 10000 : REFRESH_ON_FOCUS_MS)) refresh(n); });
  });
}

export const db = {
  /** Runs fn(); the collections its writes touch reload once at the end, not after every write. */
  async batch(fn) {
    batchDepth++;
    try { return await fn(); }
    finally {
      batchDepth--;
      if (batchDepth === 0 && dirty.size) { const names = [...dirty]; dirty.clear(); await Promise.all(names.map((n) => refresh(n))); }
    }
  },
  collection(name) {
    return {
      async add(data) { const r = await api('POST', collectionBase(name) + encodeURIComponent(name), data); await refresh(name); return { id: r.id }; },
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
    const url = collectionBase(name) + encodeURIComponent(name) + '/' + encodeURIComponent(id);
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

// ---------- shared boards (Oct 11; server: src/lib/boards.js) ----------
const bpath = (id, rest = '') => `/api/boards/${encodeURIComponent(id)}${rest}`;
export const boardsApi = {
  list: () => api('GET', '/api/boards'),
  create: (name) => api('POST', '/api/boards', { name }),
  get: (id) => api('GET', bpath(id)),
  rename: (id, name) => api('PATCH', bpath(id), { name }),
  remove: (id) => api('DELETE', bpath(id)),
  setRole: (id, userId, role) => api('PATCH', bpath(id, '/members/' + encodeURIComponent(userId)), { role }),
  removeMember: (id, userId) => api('DELETE', bpath(id, '/members/' + encodeURIComponent(userId))),
  invites: (id) => api('GET', bpath(id, '/invites')),
  createInvite: (id, role, opts = {}) => api('POST', bpath(id, '/invites'), { role, ...opts }),
  revokeInvite: (id, inviteId) => api('DELETE', bpath(id, '/invites/' + encodeURIComponent(inviteId))),
  notifyInvite: (id, inviteId, token, email) => api('POST', bpath(id, '/invites/' + encodeURIComponent(inviteId) + '/notify'), { token, email }),
  preview: (token) => api('POST', '/api/invites/preview', { token }),
  accept: (token) => api('POST', '/api/invites/accept', { token }),
};
