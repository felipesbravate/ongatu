// @ts-check
// Shared boards (Oct 11, backend only; no designs yet).
//
// A shared board is a third board, next to each person's own: its own years, entries, budgets and categories, its own
// data key, and members with a role. Everyone keeps their personal board; the app shows one board at a time.
//
//   co_owner : everything an owner does: edit, rename, invite, change roles, remove members, delete the board.
//              The person who creates a board is its first co-owner. A board always keeps at least one.
//   editor   : reads and writes the board's data (entries, years, budgets, overrides, budget defaults).
//   viewer   : reads only.
//
// Invites are links: a co-owner creates one for a role (single use by default, 7 days), copies it, shares it in a
// messenger from their phone, or has Ongatu email it. Only the SHA-256 of the token is stored, so a database dump does
// not hold usable links. The token travels in the URL fragment (`/join#<token>`) and in POST bodies, never in a path
// or query string, so it stays out of server logs and Referer headers.
//
// Storage: board data goes through the same Vault (envelope encryption) as personal data, with its own key store and
// document store (board_keys, board_documents). Inside the Vault a board is addressed as `board:<uuid>`, so its key
// and every document are bound (AAD) to the board, never to a person.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { COLLECTIONS, VaultError } from './vault.js';
import { validateImportBatch } from './import-commit.js';

export const ROLES = Object.freeze(['viewer', 'editor', 'co_owner']);
const RANK = { viewer: 0, editor: 1, co_owner: 2 };
export const MAX_BOARDS_PER_USER = 10;
export const MAX_MEMBERS = 20;
const MAX_ACTIVE_INVITES = 20;
const INVITE_DAYS = { min: 1, max: 30, default: 7 };
const INVITE_USES = { min: 1, max: 20, default: 1 };
const MAX_EMAILS_PER_INVITE = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export const boardSpace = (/** @type {string} */ boardId) => `board:${boardId}`;
export const hashToken = (/** @type {string} */ t) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const inviteUrl = (/** @type {string} */ origin, /** @type {string} */ token) => `${String(origin).replace(/\/$/, '')}/join#${token}`;

/** Board name: 1 to 60 characters, trimmed, no control characters. @param {unknown} v */
export function cleanBoardName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 60 ? s : null;
}
const can = (/** @type {string} */ role, /** @type {string} */ need) => RANK[role] >= RANK[need];
const json = (/** @type {number} */ status, /** @type {any} */ body) => ({ status, body });
const err = (/** @type {number} */ status, /** @type {string} */ code, /** @type {string} */ message) => json(status, { error: { code, message } });
const clampInt = (/** @type {unknown} */ v, /** @type {{min:number,max:number,default:number}} */ r) => {
  if (v === undefined || v === null || v === '') return r.default;
  const n = Number(v);
  return Number.isInteger(n) && n >= r.min && n <= r.max ? n : null;
};

/**
 * Board data stores for the Vault: the board's key and documents, addressed as `board:<uuid>`.
 * @param {any} store  the BoardStore (see memoryBoards / supabaseStores().boards)
 */
export function boardVaultStores(store) {
  const id = (/** @type {string} */ space) => { if (!space.startsWith('board:')) throw new VaultError('bad_space', 'Not a board'); return space.slice(6); };
  return {
    keys: {
      get: (/** @type {string} */ s) => store.keys.get(id(s)),
      create: (/** @type {string} */ s, /** @type {any} */ rec) => store.keys.create(id(s), rec),
      put: (/** @type {string} */ s, /** @type {any} */ rec) => store.keys.put(id(s), rec),
      remove: (/** @type {string} */ s) => store.keys.remove(id(s)),
    },
    docs: {
      list: (/** @type {string} */ s, /** @type {string} */ c) => store.docs.list(id(s), c).then((rows) => rows.map((r) => ({ ...r, user_id: s }))),
      get: (/** @type {string} */ s, /** @type {string} */ c, /** @type {string} */ i) => store.docs.get(id(s), c, i).then((r) => (r ? { ...r, user_id: s } : null)),
      put: (/** @type {any} */ row) => store.docs.put({ ...row, board_id: id(row.user_id), user_id: undefined }),
      putMany: (/** @type {any[]} */ rows) => store.docs.putMany(rows.map((row) => ({ ...row, board_id: id(row.user_id), user_id: undefined }))),
      remove: (/** @type {string} */ s, /** @type {string} */ c, /** @type {string} */ i) => store.docs.remove(id(s), c, i),
      removeAll: (/** @type {string} */ s) => store.docs.removeAll(id(s)),
    },
  };
}

/**
 * Everything under /api/boards and /api/invites. Called by api.js after sign-in and approval are checked.
 * Returns null when the path is not a board route.
 * deps.boards: BoardStore; deps.boardVault: Vault over boardVaultStores; deps.mailer (optional): { send({to,subject,text}) }
 * @param {any} req @param {any} deps @param {{ user: any }} ctx
 */
export async function handleBoards(req, deps, { user }) {
  const { method, path } = req;
  if (!path.startsWith('/api/boards') && !path.startsWith('/api/invites')) return null;
  if (!deps.boards || !deps.boardVault) return err(501, 'not_available', 'Shared boards are not available on this server');
  const B = deps.boards, V = deps.boardVault;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const now = () => new Date().toISOString();
  const displayName = () => (typeof user.name === 'string' && user.name.trim() ? user.name.trim().slice(0, 80) : null);

  /** The caller's membership of a board, or an error response (404 when not a member: the board's existence is not revealed). */
  const membership = async (/** @type {string} */ boardId, /** @type {string} */ need = 'viewer') => {
    if (!UUID_RE.test(boardId)) return { res: err(404, 'not_found', 'Board not found') };
    const m = await B.members.get(boardId, user.id);
    if (!m) return { res: err(404, 'not_found', 'Board not found') };
    if (!can(m.role, need)) return { res: err(403, 'forbidden', need === 'co_owner' ? 'Only co-owners can do this' : 'You can only view this board') };
    return { m };
  };
  const boardName = async (/** @type {string} */ boardId) => {
    const d = await V.get(boardSpace(boardId), 'settings', 'board').catch(() => null);
    return (d && d.data && d.data.name) || 'Shared board';
  };
  const memberView = async (/** @type {any} */ m) => {
    const p = await deps.profiles.get(m.user_id);
    return { userId: m.user_id, email: p ? p.email : null, name: m.display_name || null, role: m.role, joinedAt: m.created_at, you: m.user_id === user.id };
  };
  const coOwnerCount = async (/** @type {string} */ boardId) => (await B.members.list(boardId)).filter((x) => x.role === 'co_owner').length;
  /** Crypto-shredding: documents and key, then invites, members and the board row. */
  const destroy = async (/** @type {string} */ boardId) => {
    await V.eraseUser(boardSpace(boardId));
    await B.invites.removeAll(boardId);
    await B.members.removeAll(boardId);
    await B.remove(boardId);
  };

  // ---------------------------------------------------------------- boards
  if (path === '/api/boards') {
    if (method === 'GET') {
      const mine = await B.members.forUser(user.id);
      const boards = await Promise.all(mine.map(async (m) => ({
        id: m.board_id, name: await boardName(m.board_id), role: m.role, joinedAt: m.created_at,
        members: (await B.members.list(m.board_id)).length,
      })));
      return json(200, { boards });
    }
    if (method === 'POST') {
      if (!deps.limiter.take(`boards:${user.id}`)) return err(429, 'rate_limited', 'Too many requests, slow down');
      const name = cleanBoardName(body.name);
      if (!name) return err(400, 'bad_input', 'Give the board a name (up to 60 characters)');
      if ((await B.members.forUser(user.id)).length >= MAX_BOARDS_PER_USER) return err(409, 'limit', `You can be on up to ${MAX_BOARDS_PER_USER} shared boards`);
      const id = randomUUID();
      const at = now();
      await B.create({ id, created_by: user.id, created_at: at });
      await B.members.put({ board_id: id, user_id: user.id, role: 'co_owner', display_name: displayName(), created_at: at });
      await V.set(boardSpace(id), 'settings', 'board', { name, createdAt: at, createdBy: user.id });
      return json(201, { id, name, role: 'co_owner', members: 1, joinedAt: at });
    }
    return err(405, 'bad_method', 'Method not allowed');
  }

  const bm = path.match(/^\/api\/boards\/([^/]+)(\/.*)?$/);
  if (bm) {
    const boardId = bm[1], rest = bm[2] || '';

    // ---- the board itself ----
    if (rest === '') {
      if (method === 'GET') {
        const { m, res } = await membership(boardId); if (res) return res;
        const members = await Promise.all((await B.members.list(boardId)).map(memberView));
        return json(200, { id: boardId, name: await boardName(boardId), role: m.role, members });
      }
      if (method === 'PATCH') {
        const { res } = await membership(boardId, 'co_owner'); if (res) return res;
        const name = cleanBoardName(body.name);
        if (!name) return err(400, 'bad_input', 'Give the board a name (up to 60 characters)');
        const cur = await V.get(boardSpace(boardId), 'settings', 'board');
        await V.set(boardSpace(boardId), 'settings', 'board', { ...(cur ? cur.data : {}), name, updatedAt: now(), updatedBy: user.id });
        return json(200, { id: boardId, name });
      }
      if (method === 'DELETE') {
        const { res } = await membership(boardId, 'co_owner'); if (res) return res;
        await destroy(boardId);
        return json(200, { id: boardId, deleted: true });
      }
      return err(405, 'bad_method', 'Method not allowed');
    }

    // ---- members: change a role, remove someone, or leave ----
    const mm = rest.match(/^\/members\/([^/]+)$/);
    if (mm) {
      const targetId = decodeURIComponent(mm[1]);
      const self = targetId === user.id;
      const { res } = await membership(boardId, self && method === 'DELETE' ? 'viewer' : 'co_owner'); if (res) return res;
      const target = await B.members.get(boardId, targetId);
      if (!target) return err(404, 'not_found', 'Member not found');
      if (method === 'PATCH') {
        if (!ROLES.includes(body.role)) return err(400, 'bad_input', 'Role must be viewer, editor or co_owner');
        if (target.role === 'co_owner' && body.role !== 'co_owner' && (await coOwnerCount(boardId)) <= 1) return err(409, 'last_co_owner', 'A board needs at least one co-owner. Make someone else a co-owner first.');
        await B.members.put({ ...target, role: body.role });
        return json(200, await memberView({ ...target, role: body.role }));
      }
      if (method === 'DELETE') {
        if (target.role === 'co_owner' && (await coOwnerCount(boardId)) <= 1) {
          const others = (await B.members.list(boardId)).filter((x) => x.user_id !== targetId);
          return others.length
            ? err(409, 'last_co_owner', 'A board needs at least one co-owner. Make someone else a co-owner first, or delete the board.')
            : err(409, 'last_member', 'You are the only member. Delete the board instead.');
        }
        await B.members.remove(boardId, targetId);
        return json(200, { userId: targetId, removed: true, left: self });
      }
      return err(405, 'bad_method', 'Method not allowed');
    }

    // ---- invite links (co-owners) ----
    if (rest === '/invites') {
      const { res } = await membership(boardId, 'co_owner'); if (res) return res;
      if (method === 'GET') {
        const t = Date.now();
        const list = (await B.invites.list(boardId)).filter((i) => !i.revoked_at && Date.parse(i.expires_at) > t && i.uses < i.max_uses);
        return json(200, { invites: list.map(inviteView) });
      }
      if (method === 'POST') {
        if (!deps.limiter.take(`invite:${user.id}`)) return err(429, 'rate_limited', 'Too many requests, slow down');
        if (!ROLES.includes(body.role)) return err(400, 'bad_input', 'Role must be viewer, editor or co_owner');
        const days = clampInt(body.expiresInDays, INVITE_DAYS), uses = clampInt(body.maxUses, INVITE_USES);
        if (days === null) return err(400, 'bad_input', `expiresInDays must be ${INVITE_DAYS.min} to ${INVITE_DAYS.max}`);
        if (uses === null) return err(400, 'bad_input', `maxUses must be ${INVITE_USES.min} to ${INVITE_USES.max}`);
        const t = Date.now();
        const active = (await B.invites.list(boardId)).filter((i) => !i.revoked_at && Date.parse(i.expires_at) > t && i.uses < i.max_uses);
        if (active.length >= MAX_ACTIVE_INVITES) return err(409, 'limit', 'Too many open invite links. Revoke some first.');
        const token = newToken();
        const inv = {
          id: randomUUID(), board_id: boardId, token_hash: hashToken(token), role: body.role, created_by: user.id,
          created_at: new Date(t).toISOString(), expires_at: new Date(t + days * 86_400_000).toISOString(), max_uses: uses, uses: 0, emails_sent: 0, revoked_at: null,
        };
        await B.invites.create(inv);
        const name = await boardName(boardId);
        const url = inviteUrl(deps.appOrigin, token);
        // The token is shown once. `share` is what the app puts in the share sheet / copies.
        return json(201, { ...inviteView(inv), token, url, share: shareText(displayName() || user.email, name, inv.role, url) });
      }
      return err(405, 'bad_method', 'Method not allowed');
    }
    const im = rest.match(/^\/invites\/([^/]+)(\/notify)?$/);
    if (im) {
      const { res } = await membership(boardId, 'co_owner'); if (res) return res;
      const inv = await B.invites.get(boardId, decodeURIComponent(im[1]));
      if (!inv) return err(404, 'not_found', 'Invite not found');
      if (!im[2] && method === 'DELETE') { await B.invites.revoke(inv.id, now()); return json(200, { id: inv.id, revoked: true }); }
      if (im[2] && method === 'POST') {
        // "Notify by email": the link is only sent if the caller holds it (the token matches), so a co-owner can't
        // re-send someone else's link they never saw, and the server never stores a usable token.
        if (!deps.mailer) return err(501, 'not_available', 'Email is not set up on this server. Copy the link instead.');
        if (!deps.limiter.take(`invite-mail:${user.id}`)) return err(429, 'rate_limited', 'Too many requests, slow down');
        const token = typeof body.token === 'string' ? body.token : '';
        if (!TOKEN_RE.test(token) || hashToken(token) !== inv.token_hash) return err(400, 'bad_input', 'This link does not belong to that invite');
        const to = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!EMAIL_RE.test(to) || to.length > 254) return err(400, 'bad_input', 'Enter a valid email address');
        if (!inviteOpen(inv)) return err(410, 'gone', 'This invite link has expired or was already used');
        if ((inv.emails_sent || 0) >= MAX_EMAILS_PER_INVITE) return err(409, 'limit', 'This link was already emailed several times. Create a new one.');
        const name = await boardName(boardId);
        const who = displayName() || user.email;
        await deps.mailer.send({ to, subject: `${who} invited you to “${name}” on Ongatu`, text: inviteEmail(who, name, inv, inviteUrl(deps.appOrigin, token)) });
        await B.invites.countEmail(inv.id);
        return json(200, { id: inv.id, sentTo: to });
      }
      return err(405, 'bad_method', 'Method not allowed');
    }

    // ---- the board's documents: same shape as /api/db for the personal board ----
    const dm = rest.match(/^\/db\/([A-Za-z]+)(?:\/([^/]+))?$/);
    if (dm) {
      const collection = dm[1];
      let id = dm[2];
      if (id !== undefined) { try { id = decodeURIComponent(id); } catch { return err(400, 'bad_id', 'Invalid document id'); } }
      if (!COLLECTIONS.includes(collection)) return err(400, 'bad_collection', `Unknown collection "${collection}"`);
      // The board's own settings (its name) change through PATCH /api/boards/:id, so co-owners only write there.
      const need = method === 'GET' ? 'viewer' : collection === 'settings' ? 'co_owner' : 'editor';
      const { res } = await membership(boardId, need); if (res) return res;
      const space = boardSpace(boardId);
      if (method === 'GET' && !id) return json(200, { docs: await V.list(space, collection) });
      if (method === 'GET' && id) { const d = await V.get(space, collection, id); return d ? json(200, d) : err(404, 'not_found', 'Not found'); }
      if (method === 'POST' && !id) return json(201, await V.add(space, collection, stamp(req.body, user.id, true)));
      if (method === 'PUT' && id) {
        if (collection === 'settings' && id === 'board') return err(400, 'bad_input', 'Rename the board with PATCH /api/boards/:id');
        await V.set(space, collection, id, stamp(req.body, user.id, false)); return json(200, { id });
      }
      if (method === 'DELETE' && id) {
        if (collection === 'settings' && id === 'board') return err(400, 'bad_input', 'Delete the board with DELETE /api/boards/:id');
        await V.remove(space, collection, id); return json(200, { id });
      }
      return err(405, 'bad_method', 'Method not allowed');
    }

    // ---- import into a board (editors), same rules as /api/import/commit ----
    if (rest === '/import/commit' && method === 'POST') {
      const { res } = await membership(boardId, 'editor'); if (res) return res;
      if (!deps.limiter.take(`import:${user.id}`)) return err(429, 'rate_limited', 'Too many requests, slow down');
      const v = validateImportBatch(req.body);
      if (!v.ok) return json(400, { error: { code: 'bad_input', message: v.error }, rows: v.rows || [] });
      const space = boardSpace(boardId);
      const have = new Set((await V.list(space, 'years')).map((d) => String(d.data.year)));
      const newYears = [...new Set(v.docs.map((d) => d.year))].filter((y) => !have.has(y)).sort();
      const createdAt = now();
      if (newYears.length) await V.addMany(space, 'years', newYears.map((year) => ({ year, currency: 'EUR', createdAt, source: 'import' })));
      const ids = await V.addMany(space, 'entries', v.docs.map((d) => ({ ...d, createdBy: user.id })));
      return json(201, { saved: ids.length, yearsCreated: newYears });
    }
    return err(404, 'not_found', 'Not found');
  }

  // ---------------------------------------------------------------- opening an invite link
  if (method === 'POST' && (path === '/api/invites/preview' || path === '/api/invites/accept')) {
    if (!deps.limiter.take(`join:${user.id}`)) return err(429, 'rate_limited', 'Too many requests, slow down');
    const token = typeof body.token === 'string' ? body.token : '';
    if (!TOKEN_RE.test(token)) return err(404, 'not_found', 'This invite link is not valid');
    const inv = await B.invites.byHash(hashToken(token));
    if (!inv || inv.revoked_at) return err(404, 'not_found', 'This invite link is not valid');
    const existing = await B.members.get(inv.board_id, user.id);
    const open = inviteOpen(inv);
    const name = await boardName(inv.board_id);
    if (path === '/api/invites/preview') {
      const by = await B.members.get(inv.board_id, inv.created_by);
      const byProfile = await deps.profiles.get(inv.created_by);
      return json(200, {
        boardId: inv.board_id, boardName: name, role: inv.role, expiresAt: inv.expires_at,
        invitedBy: (by && by.display_name) || (byProfile && byProfile.email) || null,
        alreadyMember: !!existing, yourRole: existing ? existing.role : null, open,
      });
    }
    // Accept. Someone already on the board keeps their role (a link never demotes, nor promotes, a member).
    if (existing) return json(200, { boardId: inv.board_id, boardName: name, role: existing.role, alreadyMember: true });
    if (!open) return err(410, 'gone', 'This invite link has expired or was already used');
    if ((await B.members.forUser(user.id)).length >= MAX_BOARDS_PER_USER) return err(409, 'limit', `You can be on up to ${MAX_BOARDS_PER_USER} shared boards`);
    if ((await B.members.list(inv.board_id)).length >= MAX_MEMBERS) return err(409, 'limit', `A board can have up to ${MAX_MEMBERS} members`);
    // Taking a use is atomic in the store (two people opening a single-use link at once: only one gets in).
    if (!(await B.invites.use(inv.id, now()))) return err(410, 'gone', 'This invite link has expired or was already used');
    await B.members.put({ board_id: inv.board_id, user_id: user.id, role: inv.role, display_name: displayName(), invited_by: inv.created_by, created_at: now() });
    return json(201, { boardId: inv.board_id, boardName: name, role: inv.role, alreadyMember: false });
  }
  return err(404, 'not_found', 'Not found');
}

/** Before an account is deleted: leave every board. A board left without a co-owner gets one (the longest-standing
 * member, editors first); a board left with nobody is shredded. @param {any} deps @param {string} userId */
export async function leaveAllBoards(deps, userId) {
  if (!deps.boards || !deps.boardVault) return;
  for (const m of await deps.boards.members.forUser(userId)) {
    const others = (await deps.boards.members.list(m.board_id)).filter((x) => x.user_id !== userId);
    if (!others.length) {
      await deps.boardVault.eraseUser(boardSpace(m.board_id));
      await deps.boards.invites.removeAll(m.board_id);
      await deps.boards.members.removeAll(m.board_id);
      await deps.boards.remove(m.board_id);
      continue;
    }
    if (m.role === 'co_owner' && !others.some((x) => x.role === 'co_owner')) {
      const next = others.slice().sort((a, b) => RANK[b.role] - RANK[a.role] || String(a.created_at).localeCompare(String(b.created_at)))[0];
      await deps.boards.members.put({ ...next, role: 'co_owner' });
    }
    await deps.boards.members.remove(m.board_id, userId);
  }
}

function inviteOpen(/** @type {any} */ inv) { return !inv.revoked_at && Date.parse(inv.expires_at) > Date.now() && inv.uses < inv.max_uses; }
function inviteView(/** @type {any} */ i) { return { id: i.id, role: i.role, createdAt: i.created_at, expiresAt: i.expires_at, maxUses: i.max_uses, uses: i.uses }; }
const ROLE_WORDS = { viewer: 'view', editor: 'view and edit', co_owner: 'co-own' };
function shareText(/** @type {string} */ who, /** @type {string} */ board, /** @type {string} */ role, /** @type {string} */ url) {
  return `${who} invited you to ${ROLE_WORDS[role]} “${board}” on Ongatu: ${url}`;
}
function inviteEmail(/** @type {string} */ who, /** @type {string} */ board, /** @type {any} */ inv, /** @type {string} */ url) {
  const until = new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    `${who} invited you to ${ROLE_WORDS[inv.role]} the shared board “${board}” on Ongatu.`,
    '', `Open the invite: ${url}`, '',
    `The link works until ${until}${inv.max_uses === 1 ? ' and only once' : ''}. Sign in or create an account with any email to join.`,
    '', 'If you were not expecting this, ignore this email.',
  ].join('\n');
}
/** Who added or last changed a board document (shown as "added by …" later). Callers can't set these themselves. */
function stamp(/** @type {any} */ data, /** @type {string} */ userId, /** @type {boolean} */ created) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data; // the Vault rejects it
  const { createdBy, updatedBy, ...rest } = data;
  void updatedBy;
  return created ? { ...rest, createdBy: userId } : { ...rest, ...(createdBy ? { createdBy } : {}), updatedBy: userId };
}

/** In-memory BoardStore: tests and the mock dev server. Same contract as supabaseStores().boards. */
export function memoryBoards() {
  /** @type {Map<string, any>} */ const boards = new Map();
  /** @type {Map<string, any>} */ const members = new Map();
  /** @type {Map<string, any>} */ const invites = new Map();
  /** @type {Map<string, any>} */ const keyMap = new Map();
  /** @type {Map<string, any>} */ const docMap = new Map();
  const mk = (/** @type {string} */ b, /** @type {string} */ u) => `${b}\u0000${u}`;
  const dk = (/** @type {string} */ b, /** @type {string} */ c, /** @type {string} */ i) => `${b}\u0000${c}\u0000${i}`;
  return {
    boardsMap: boards, membersMap: members, invitesMap: invites, docMap, keyMap,
    async create(/** @type {any} */ b) { boards.set(b.id, { ...b }); },
    async get(/** @type {string} */ id) { return boards.get(id) || null; },
    async remove(/** @type {string} */ id) { boards.delete(id); },
      members: {
        async get(/** @type {string} */ b, /** @type {string} */ u) { const m = members.get(mk(b, u)); return m ? { ...m } : null; },
        async list(/** @type {string} */ b) { return [...members.values()].filter((m) => m.board_id === b).map((m) => ({ ...m })); },
        async forUser(/** @type {string} */ u) { return [...members.values()].filter((m) => m.user_id === u).map((m) => ({ ...m })); },
        async put(/** @type {any} */ m) { members.set(mk(m.board_id, m.user_id), { ...m }); },
        async remove(/** @type {string} */ b, /** @type {string} */ u) { members.delete(mk(b, u)); },
        async removeAll(/** @type {string} */ b) { for (const [k, m] of members) if (m.board_id === b) members.delete(k); },
      },
      invites: {
        async create(/** @type {any} */ i) { invites.set(i.id, { ...i }); },
        async get(/** @type {string} */ b, /** @type {string} */ id) { const i = invites.get(id); return i && i.board_id === b ? { ...i } : null; },
        async byHash(/** @type {string} */ h) { const i = [...invites.values()].find((x) => x.token_hash === h); return i ? { ...i } : null; },
        async list(/** @type {string} */ b) { return [...invites.values()].filter((i) => i.board_id === b).map((i) => ({ ...i })); },
        async revoke(/** @type {string} */ id, /** @type {string} */ at) { const i = invites.get(id); if (i) i.revoked_at = at; },
        async use(/** @type {string} */ id) { const i = invites.get(id); if (!i || !inviteOpen(i)) return false; i.uses += 1; return true; },
        async countEmail(/** @type {string} */ id) { const i = invites.get(id); if (i) i.emails_sent = (i.emails_sent || 0) + 1; },
        async removeAll(/** @type {string} */ b) { for (const [k, i] of invites) if (i.board_id === b) invites.delete(k); },
      },
      keys: {
        async get(/** @type {string} */ b) { return keyMap.get(b) || null; },
        async create(/** @type {string} */ b, /** @type {any} */ rec) { if (!keyMap.has(b)) keyMap.set(b, rec); },
        async put(/** @type {string} */ b, /** @type {any} */ rec) { keyMap.set(b, rec); },
        async remove(/** @type {string} */ b) { keyMap.delete(b); },
      },
      docs: {
        async list(/** @type {string} */ b, /** @type {string} */ c) { return [...docMap.values()].filter((r) => r.board_id === b && r.collection === c).map((r) => ({ ...r })); },
        async get(/** @type {string} */ b, /** @type {string} */ c, /** @type {string} */ i) { const r = docMap.get(dk(b, c, i)); return r ? { ...r } : null; },
        async put(/** @type {any} */ row) { const { user_id, ...r } = row; void user_id; docMap.set(dk(r.board_id, r.collection, r.doc_id), r); },
        async putMany(/** @type {any[]} */ rows) { for (const row of rows) { const { user_id, ...r } = row; void user_id; docMap.set(dk(r.board_id, r.collection, r.doc_id), r); } },
        async remove(/** @type {string} */ b, /** @type {string} */ c, /** @type {string} */ i) { docMap.delete(dk(b, c, i)); },
        async removeAll(/** @type {string} */ b) { for (const [k, r] of docMap) if (r.board_id === b) docMap.delete(k); },
      },
  };
}

/** Optional mailer (Resend's HTTP API) when RESEND_API_KEY and MAIL_FROM are set; otherwise null. @param {Record<string,string|undefined>} env */
export function mailerFromEnv(env) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return null;
  return {
    async send(/** @type {{to:string, subject:string, text:string}} */ m) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
      });
      if (!r.ok) throw Object.assign(new Error('The email could not be sent'), { code: 'mail_failed' });
    },
  };
}
