// @ts-check
// Supabase (service-role) implementations of the store interfaces used by Vault and the API.
// UNVERIFIED against a live project: written to the documented supabase-js v2 API.
// `sb` is a supabase-js client created with the SERVICE ROLE key, server-side only.

/** @param {any} r */
const ok = (r) => { if (r.error) throw new Error(`db: ${r.error.message}`); return r.data; };

/** @param {any} sb */
export function supabaseStores(sb) {
  return {
    keys: {
      async get(/** @type {string} */ u) {
        const d = ok(await sb.from('user_keys').select('kek_version,wrapped').eq('user_id', u).maybeSingle());
        return d ? { kekVersion: d.kek_version, wrapped: d.wrapped } : null;
      },
      // A new account's key: insert, and if another request got there first (unique user_id), keep theirs.
      async create(/** @type {string} */ u, /** @type {any} */ rec) {
        const r = await sb.from('user_keys').insert({ user_id: u, kek_version: rec.kekVersion, wrapped: rec.wrapped });
        if (r.error && r.error.code !== '23505') throw new Error(`db: ${r.error.message}`);
      },
      async put(/** @type {string} */ u, /** @type {any} */ rec) {
        // Re-wrapping an existing key (master key rotation). New keys go through create().
        const existing = ok(await sb.from('user_keys').select('user_id').eq('user_id', u).maybeSingle());
        if (existing) ok(await sb.from('user_keys').update({ kek_version: rec.kekVersion, wrapped: rec.wrapped }).eq('user_id', u));
        else ok(await sb.from('user_keys').insert({ user_id: u, kek_version: rec.kekVersion, wrapped: rec.wrapped }));
      },
      async remove(/** @type {string} */ u) { ok(await sb.from('user_keys').delete().eq('user_id', u)); },
    },
    docs: {
      // PostgREST caps every response (default 1000 rows), silently. Page through in a stable order
      // until a page comes back empty, so the result is complete whatever the project's cap is.
      async list(/** @type {string} */ u, /** @type {string} */ c) {
        const out = [];
        for (let from = 0; ; ) {
          const page = ok(await sb.from('documents').select('*').eq('user_id', u).eq('collection', c)
            .order('doc_id', { ascending: true }).range(from, from + 999)) || [];
          if (!page.length) break;
          out.push(...page); from += page.length;
        }
        return out;
      },
      async get(/** @type {string} */ u, /** @type {string} */ c, /** @type {string} */ i) { return ok(await sb.from('documents').select('*').eq('user_id', u).eq('collection', c).eq('doc_id', i).maybeSingle()); },
      async put(/** @type {any} */ row) { ok(await sb.from('documents').upsert(row, { onConflict: 'user_id,collection,doc_id' })); },
      async putMany(/** @type {any[]} */ rows) {
        for (let i = 0; i < rows.length; i += 250) ok(await sb.from('documents').upsert(rows.slice(i, i + 250), { onConflict: 'user_id,collection,doc_id' }));
      },
      async remove(/** @type {string} */ u, /** @type {string} */ c, /** @type {string} */ i) { ok(await sb.from('documents').delete().eq('user_id', u).eq('collection', c).eq('doc_id', i)); },
      async removeAll(/** @type {string} */ u) { ok(await sb.from('documents').delete().eq('user_id', u)); },
    },
    profiles: {
      async get(/** @type {string} */ u) { return ok(await sb.from('profiles').select('*').eq('user_id', u).maybeSingle()); },
      async byEmail(/** @type {string} */ e) { return ok(await sb.from('profiles').select('user_id,email').eq('email', String(e).toLowerCase()).limit(1).maybeSingle()); },
      async upsert(/** @type {any} */ p) { ok(await sb.from('profiles').upsert({ user_id: p.user_id, email: p.email }, { onConflict: 'user_id', ignoreDuplicates: true })); },
      async list() { return ok(await sb.from('profiles').select('*').order('created_at', { ascending: false })) || []; },
      async setStatus(/** @type {string} */ u, /** @type {string} */ s) { ok(await sb.from('profiles').update({ status: s }).eq('user_id', u)); },
    },
    usage: {
      async increment(/** @type {string} */ u, /** @type {string} */ day) { return ok(await sb.rpc('increment_usage', { p_user: u, p_day: day })); },
    },
  };
}
