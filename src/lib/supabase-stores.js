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
    // Shared boards (0002_shared_boards.sql). Same contract as memoryBoards() in boards.js.
    boards: {
      async create(/** @type {any} */ b) { ok(await sb.from('boards').insert({ id: b.id, created_by: b.created_by, created_at: b.created_at })); },
      async get(/** @type {string} */ id) { return ok(await sb.from('boards').select('*').eq('id', id).maybeSingle()); },
      async remove(/** @type {string} */ id) { ok(await sb.from('boards').delete().eq('id', id)); },
      members: {
        async get(/** @type {string} */ b, /** @type {string} */ u) { return ok(await sb.from('board_members').select('*').eq('board_id', b).eq('user_id', u).maybeSingle()); },
        async list(/** @type {string} */ b) { return ok(await sb.from('board_members').select('*').eq('board_id', b).order('created_at', { ascending: true })) || []; },
        async forUser(/** @type {string} */ u) { return ok(await sb.from('board_members').select('*').eq('user_id', u).order('created_at', { ascending: true })) || []; },
        async put(/** @type {any} */ m) {
          ok(await sb.from('board_members').upsert({ board_id: m.board_id, user_id: m.user_id, role: m.role, display_name: m.display_name ?? null, invited_by: m.invited_by ?? null, created_at: m.created_at }, { onConflict: 'board_id,user_id' }));
        },
        async remove(/** @type {string} */ b, /** @type {string} */ u) { ok(await sb.from('board_members').delete().eq('board_id', b).eq('user_id', u)); },
        async removeAll(/** @type {string} */ b) { ok(await sb.from('board_members').delete().eq('board_id', b)); },
      },
      invites: {
        async create(/** @type {any} */ i) { ok(await sb.from('board_invites').insert(i)); },
        async get(/** @type {string} */ b, /** @type {string} */ id) { return ok(await sb.from('board_invites').select('*').eq('board_id', b).eq('id', id).maybeSingle()); },
        async byHash(/** @type {string} */ h) { return ok(await sb.from('board_invites').select('*').eq('token_hash', h).maybeSingle()); },
        async list(/** @type {string} */ b) { return ok(await sb.from('board_invites').select('*').eq('board_id', b).order('created_at', { ascending: false })) || []; },
        async revoke(/** @type {string} */ id, /** @type {string} */ at) { ok(await sb.from('board_invites').update({ revoked_at: at }).eq('id', id)); },
        async use(/** @type {string} */ id) { return !!ok(await sb.rpc('use_board_invite', { p_id: id })); },
        async countEmail(/** @type {string} */ id) { ok(await sb.rpc('count_board_invite_email', { p_id: id })); },
        async setRole(/** @type {string} */ id, /** @type {string} */ role) { ok(await sb.from('board_invites').update({ role }).eq('id', id)); },
        async forEmail(/** @type {string} */ email) { return ok(await sb.from('board_invites').select('*').eq('email', email).order('created_at', { ascending: false })) || []; },
        async decline(/** @type {string} */ id, /** @type {string} */ at) { ok(await sb.from('board_invites').update({ declined_at: at }).eq('id', id)); ok(await sb.from('board_invites').update({ revoked_at: at }).eq('id', id).is('revoked_at', null)); },
        async removeAll(/** @type {string} */ b) { ok(await sb.from('board_invites').delete().eq('board_id', b)); },
      },
      keys: {
        async get(/** @type {string} */ b) { const d = ok(await sb.from('board_keys').select('kek_version,wrapped').eq('board_id', b).maybeSingle()); return d ? { kekVersion: d.kek_version, wrapped: d.wrapped } : null; },
        async create(/** @type {string} */ b, /** @type {any} */ rec) {
          const r = await sb.from('board_keys').insert({ board_id: b, kek_version: rec.kekVersion, wrapped: rec.wrapped });
          if (r.error && r.error.code !== '23505') throw new Error(`db: ${r.error.message}`);
        },
        async put(/** @type {string} */ b, /** @type {any} */ rec) { ok(await sb.from('board_keys').upsert({ board_id: b, kek_version: rec.kekVersion, wrapped: rec.wrapped }, { onConflict: 'board_id' })); },
        async remove(/** @type {string} */ b) { ok(await sb.from('board_keys').delete().eq('board_id', b)); },
      },
      docs: {
        async list(/** @type {string} */ b, /** @type {string} */ c) {
          const out = [];
          for (let from = 0; ; ) {
            const page = ok(await sb.from('board_documents').select('*').eq('board_id', b).eq('collection', c).order('doc_id', { ascending: true }).range(from, from + 999)) || [];
            if (!page.length) break;
            out.push(...page); from += page.length;
          }
          return out;
        },
        async get(/** @type {string} */ b, /** @type {string} */ c, /** @type {string} */ i) { return ok(await sb.from('board_documents').select('*').eq('board_id', b).eq('collection', c).eq('doc_id', i).maybeSingle()); },
        async put(/** @type {any} */ row) { const { user_id, ...r } = row; void user_id; ok(await sb.from('board_documents').upsert(r, { onConflict: 'board_id,collection,doc_id' })); },
        async putMany(/** @type {any[]} */ rows) {
          const clean = rows.map(({ user_id, ...r }) => { void user_id; return r; });
          for (let i = 0; i < clean.length; i += 250) ok(await sb.from('board_documents').upsert(clean.slice(i, i + 250), { onConflict: 'board_id,collection,doc_id' }));
        },
        async remove(/** @type {string} */ b, /** @type {string} */ c, /** @type {string} */ i) { ok(await sb.from('board_documents').delete().eq('board_id', b).eq('collection', c).eq('doc_id', i)); },
        async removeAll(/** @type {string} */ b) { ok(await sb.from('board_documents').delete().eq('board_id', b)); },
      },
    },
    usage: {
      async increment(/** @type {string} */ u, /** @type {string} */ day) { return ok(await sb.rpc('increment_usage', { p_user: u, p_day: day })); },
    },
  };
}
