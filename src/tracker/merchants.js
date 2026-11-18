// Remembered merchants (Nov 18, Felipe). Receipts and bank statements carry the business's registered name
// ("MERCAT DE SANTS 0234 BARCELONA"), not the one people use ("Carrefour"), and the reader's category guess is often
// not the one the person keeps. Every row read from a document and saved is remembered: the name it was saved with
// (when the person changed it) and its type and category. The next time the same name is read, the row arrives with
// that name and category (and a "Was: …" note when renamed). Pure functions; the list lives in the person's own
// settings (settings/merchants), encrypted like everything else, kept under the 32 KB a document may hold.
export const MERCHANTS_DOC = 'merchants';
export const MAX_NAMES = 400;
export const MAX_BYTES = 30000; // the vault refuses documents over 32 KB; the least recently saved go first past this

/** The comparable form of a read name: lower case, no accents, no punctuation, no words with digits (store numbers,
 *  card references, dates), single spaces. "MERCAT DE SANTS, 0234 Barcelona" -> "mercat de sants barcelona". */
export function merchantKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter((w) => w && !/\d/.test(w))
    .join(' ')
    .slice(0, 80);
}

const same = (a, b) => merchantKey(a) === merchantKey(b);

// Stored entries are short-keyed to fit more of them: d name (only when renamed), t type, g group, c category,
// i item, a last saved (YYYY-MM-DD), n times saved. Entries from the first version ({name,type,…,at}) still read.
function entry(m) {
  if (!m || typeof m !== 'object') return null;
  if ('name' in m || 'type' in m) {
    return { name: m.name || null, type: m.type || null, group: m.group || null, category: m.category || null, item: m.item || null, at: String(m.at || '').slice(0, 10), n: m.n || 1 };
  }
  return { name: m.d || null, type: m.t || null, group: m.g || null, category: m.c || null, item: m.i || null, at: m.a || '', n: m.n || 1 };
}
function pack(e) {
  const o = {};
  if (e.name) o.d = e.name;
  if (e.type) o.t = e.type;
  if (e.group) o.g = e.group;
  if (e.category) o.c = e.category;
  if (e.item) o.i = e.item;
  o.a = e.at;
  o.n = e.n;
  return o;
}

/** The stored list as { key: entry } with long field names, whatever version wrote it. */
export function readMerchants(doc) {
  const raw = doc && typeof doc.map === 'object' && doc.map ? doc.map : {};
  const map = {};
  for (const k of Object.keys(raw)) { const e = entry(raw[k]); if (e) map[k] = e; }
  return map;
}

/** Rows as read -> rows with remembered names and categories applied. A row keeps `readDescription` (the name on the
 *  document) so saving can learn from it; `renamedFrom` is set when the name was replaced (the "Was: …" note).
 *  The type and category are taken only when they still exist in the year of the row's date. */
export function applyMerchants(rows, store, model) {
  const map = readMerchants(store);
  return rows.map((r) => {
    const read = r.readDescription != null ? r.readDescription : r.description;
    const base = { ...r, readDescription: read };
    const m = merchantKey(read) ? map[merchantKey(read)] : null;
    if (!m) return base;
    const out = { ...base };
    if (m.name && !same(m.name, read)) Object.assign(out, { description: m.name, renamedFrom: read });
    if (m.type && m.item && model && fits(model, r.date, m)) {
      Object.assign(out, { type: m.type, group: m.group || null, category: m.type === 'expense' ? m.category || null : null, item: m.item, guess: false });
    }
    return out;
  });
}

function fits(model, date, m) {
  const year = /^\d{4}/.test(String(date || '')) ? String(date).slice(0, 4) : null;
  if (!year || !model.catOptions) return false;
  return model.catOptions(m.type, m.group || null, year).some((o) => o.item === m.item && (o.category || null) === (m.category || null));
}

const sig = (e) => [e.name || '', e.type || '', e.group || '', e.category || '', e.item || ''].join('|');

/** The list after a save: every saved row read from a document is remembered with the name it was saved under (kept
 *  only when it differs from the document's) and its type and category; the latest save wins. A name read twice in
 *  the same save with different names or categories (a generic "Bizum" or "Transfer" line) is left as it was, since
 *  no single answer fits it. Returns { store, changed }. `now` is an ISO time. */
export function learnMerchants(store, savedRows, now) {
  const map = readMerchants(store);
  const day = String(now || '').slice(0, 10);
  const seen = {};
  for (const r of savedRows) {
    if (r.readDescription == null) continue; // typed by hand, not read from a document
    const key = merchantKey(r.readDescription);
    const name = String(r.description || '').trim();
    if (!key || !name) continue;
    const next = { name: same(name, r.readDescription) ? null : name.slice(0, 80), type: r.type || null, group: r.group || null, category: r.type === 'expense' ? r.category || null : null, item: r.item || null };
    if (!next.name && !next.item) continue; // nothing to bring back next time
    if (seen[key] === undefined) seen[key] = next;
    else if (seen[key] && sig(seen[key]) !== sig(next)) seen[key] = null; // conflicting answers for one name
  }
  // The same merchant can arrive under several document names ("MERCAT DE SANTS", "CARREFOUR EXPRESS 12") that the
  // person calls the same thing: a new category for one is the new category for all of them.
  for (const key of Object.keys(seen)) {
    const next = seen[key];
    if (!next || !next.item) continue;
    const shown = merchantKey(next.name || key);
    for (const k of Object.keys(map)) {
      if (k === key || seen[k] !== undefined) continue;
      const e = map[k];
      if (merchantKey(e.name || k) !== shown) continue;
      map[k] = { ...e, type: next.type, group: next.group, category: next.category, item: next.item };
    }
  }
  const shape = (m) => Object.keys(m).sort().map((k) => k + '=' + sig(m[k])).join(';');
  const before = shape(readMerchants(store));
  let changed = !!(store && store.v !== 2 && Object.keys(map).length && Object.keys(seen).length); // upgrade old lists
  for (const key of Object.keys(seen)) {
    const next = seen[key];
    if (!next) continue;
    const cur = map[key];
    if (!cur || sig(cur) !== sig(next) || cur.at !== day) changed = true; // recency refreshed at most once a day
    map[key] = { ...next, at: day, n: ((cur && cur.n) || 0) + 1 };
  }
  // Newest first; past the count or size limit, the least recently saved go.
  const keys = Object.keys(map).sort((a, b) => String(map[b].at).localeCompare(String(map[a].at)) || (map[b].n - map[a].n));
  const packed = {};
  let count = 0;
  let bytes = 20;
  for (const k of keys) {
    const p = pack(map[k]);
    const size = JSON.stringify(k).length + JSON.stringify(p).length + 2;
    if (count >= MAX_NAMES || bytes + size > MAX_BYTES) { changed = true; continue; }
    packed[k] = p;
    count += 1;
    bytes += size;
  }
  if (!changed && shape(readMerchants({ map: packed })) !== before) changed = true; // a merchant elsewhere followed
  return { store: { v: 2, map: packed }, changed };
}

/** Entries typed in the Add form teach the same way, under the name typed: the next document that reads that name
 *  (or any document name the person renamed to it) arrives with the category chosen. */
export function typedRows(entries) {
  return entries.filter((e) => e && e.description && e.item).map((e) => ({ ...e, readDescription: e.description }));
}

/** A sub-category renamed in the board (rename.js) is renamed in the list too, so remembered merchants keep fitting. */
export function renameMerchantGroup(store, type, from, to) {
  const map = readMerchants(store);
  let changed = false;
  for (const k of Object.keys(map)) {
    if (map[k].type === type && map[k].group === from) { map[k] = { ...map[k], group: to }; changed = true; }
  }
  const packed = {};
  for (const k of Object.keys(map)) packed[k] = pack(map[k]);
  return { store: { v: 2, map: packed }, changed };
}
