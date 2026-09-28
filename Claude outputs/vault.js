// @ts-check
// Vault: the only place that turns plaintext user documents into ciphertext rows and back.
// It talks to two tiny storage interfaces so it can run against Supabase in production and
// against in-memory maps in tests / the mock dev server.
//
// KeyStore : { get(userId) -> {kekVersion, wrapped} | null, put(userId, {kekVersion, wrapped}) -> void, remove(userId) }
// DocStore : { list(userId, collection) -> Row[], get(userId, collection, id) -> Row | null,
//              put(row) -> void, remove(userId, collection, id) -> void, removeAll(userId) -> void }
// Row      : { user_id, collection, doc_id, payload (base64 ciphertext), updated_at (ISO) }
import { randomUUID } from 'node:crypto';
import { decryptJson, encryptJson } from './crypto.js';
import { DekCache, newDek, unwrapDek, wrapDek } from './keyring.js';

/** Collections the app is allowed to use. Anything else is rejected before touching storage. */
export const COLLECTIONS = Object.freeze(['entries', 'years', 'overrides', 'budgets', 'budgetDefaults', 'settings']);
const ID_RE = /^[A-Za-z0-9_.~:@+-]{1,200}$/; // superset of what the app's own id slugs produce
const BAD_ID_RE = /^\.{1,2}$/;

/** @param {string} collection @param {string} id */
export function assertRef(collection, id) {
  if (!COLLECTIONS.includes(collection)) throw new VaultError('bad_collection', `Unknown collection "${collection}"`);
  if (id !== undefined && (!ID_RE.test(id) || BAD_ID_RE.test(id))) throw new VaultError('bad_id', 'Invalid document id');
}

export class VaultError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

// AAD binds a ciphertext to (user, collection, doc id). A row copied to another user, collection
// or id (by a DB admin, a bug, or an attacker with write access) fails authentication.
const docAad = (/** @type {string} */ u, /** @type {string} */ c, /** @type {string} */ id) => `doc|${u}|${c}|${id}`;

const MAX_DOC_BYTES = 32 * 1024;

export class Vault {
  /**
   * @param {{ master: import('./keyring.js').MasterKeys, keys: any, docs: any, cache?: DekCache }} deps
   */
  constructor({ master, keys, docs, cache }) {
    this.master = master; this.keys = keys; this.docs = docs;
    this.cache = cache || new DekCache();
  }

  /** @param {string} userId @returns {Promise<Buffer>} */
  async dekFor(userId) {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    let rec = await this.keys.get(userId);
    if (!rec) {
      const dek = newDek();
      rec = wrapDek(this.master, userId, dek);
      await this.keys.put(userId, rec);
      this.cache.set(userId, dek);
      return dek;
    }
    const dek = unwrapDek(this.master, userId, rec.kekVersion, rec.wrapped);
    this.cache.set(userId, dek);
    return dek;
  }

  /** @param {string} userId @param {string} collection @returns {Promise<{id:string, data:any}[]>} */
  async list(userId, collection) {
    assertRef(collection, 'x');
    console.log(`[vault] list: fetching DEK for user ${userId}`);
    const dek = await this.dekFor(userId);
    console.log(`[vault] list: got DEK, fetching rows for ${collection}`);
    const rows = await this.docs.list(userId, collection);
    console.log(`[vault] list: decrypting ${rows.length} rows`);
    return rows.map((/** @type {any} */ r) => {
      try {
        const data = decryptJson(dek, r.payload, docAad(userId, collection, r.doc_id));
        return { id: r.doc_id, data };
      } catch (e) {
        console.error(`[vault] decrypt failed for ${collection}/${r.doc_id}:`, e && e.message);
        throw e;
      }
    });
  }

  /** @param {string} userId @param {string} collection @param {string} id */
  async get(userId, collection, id) {
    assertRef(collection, id);
    const r = await this.docs.get(userId, collection, id);
    if (!r) return null;
    const dek = await this.dekFor(userId);
    return { id, data: decryptJson(dek, r.payload, docAad(userId, collection, id)) };
  }

  /** Create with a server-generated id. @returns {Promise<{id:string}>} */
  async add(userId, collection, data) {
    const id = randomUUID().replace(/-/g, '').slice(0, 20);
    await this.set(userId, collection, id, data);
    return { id };
  }

  /** Create or replace. */
  async set(userId, collection, id, data) {
    assertRef(collection, id);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new VaultError('bad_doc', 'Document must be an object');
    const size = Buffer.byteLength(JSON.stringify(data));
    if (size > MAX_DOC_BYTES) throw new VaultError('too_large', 'Document too large');
    const dek = await this.dekFor(userId);
    await this.docs.put({
      user_id: userId, collection, doc_id: id,
      payload: encryptJson(dek, data, docAad(userId, collection, id)),
      updated_at: new Date().toISOString(),
    });
  }

  async remove(userId, collection, id) {
    assertRef(collection, id);
    await this.docs.remove(userId, collection, id);
  }

  /**
   * Crypto-shredding: deleting the wrapped key alone makes every backup of the user's rows
   * unreadable; rows are removed too.
   */
  async eraseUser(userId) {
    await this.docs.removeAll(userId);
    await this.keys.remove(userId);
    this.cache.delete(userId);
  }

  /** Re-wrap every user's DEK under the active master key (data is untouched). */
  async rewrapUser(userId) {
    const rec = await this.keys.get(userId);
    if (!rec || rec.kekVersion === this.master.active) return false;
    const dek = unwrapDek(this.master, userId, rec.kekVersion, rec.wrapped);
    await this.keys.put(userId, wrapDek(this.master, userId, dek));
    this.cache.delete(userId);
    return true;
  }
}

/** In-memory stores: used by tests and the mock dev server. */
export function memoryStores() {
  /** @type {Map<string, any>} */ const keyMap = new Map();
  /** @type {Map<string, any>} */ const docMap = new Map();
  const k = (/** @type {string} */ u, /** @type {string} */ c, /** @type {string} */ i) => `${u}\u0000${c}\u0000${i}`;
  return {
    keyMap, docMap,
    keys: {
      async get(u) { return keyMap.get(u) || null; },
      async put(u, rec) { keyMap.set(u, rec); },
      async remove(u) { keyMap.delete(u); },
    },
    docs: {
      async list(u, c) { return [...docMap.values()].filter((r) => r.user_id === u && r.collection === c); },
      async get(u, c, i) { return docMap.get(k(u, c, i)) || null; },
      async put(row) { docMap.set(k(row.user_id, row.collection, row.doc_id), row); },
      async remove(u, c, i) { docMap.delete(k(u, c, i)); },
      async removeAll(u) { for (const [key, r] of docMap) if (r.user_id === u) docMap.delete(key); },
    },
  };
}
