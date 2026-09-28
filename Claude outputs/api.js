// @ts-check
// Framework-agnostic API. Both the Next.js route handlers and the mock dev server call `handle`.
//   handle(req, deps) -> { status, body }
// req  : { method, path (no query), headers (lower-case keys), body (parsed JSON or undefined), user ({id,email}|null) }
// deps : { vault, profiles, usage, ai, admins, appOrigin, limiter, dailyReadCap }
import { effectiveStatus, passesCsrf, safeError } from './security.js';
import { VaultError } from './vault.js';

const json = (/** @type {number} */ status, /** @type {any} */ body) => ({ status, body });

/**
 * ProfileStore: { get(userId), upsert({user_id,email,status}), list(), setStatus(userId,status) }
 * UsageStore  : { increment(userId, dayISO) -> new count }
 * AI          : { complete({system,prompt,images,maxTokens}) -> string }
 * @param {any} req @param {any} deps
 */
export async function handle(req, deps) {
  try {
    const { method, path } = req;
    if (!passesCsrf(req, deps.appOrigin)) return json(403, { error: { code: 'forbidden', message: 'Cross-site request refused' } });
    if (!req.user) return json(401, { error: { code: 'unauthenticated', message: 'Sign in first' } });

    const user = req.user;
    let profile = await deps.profiles.get(user.id);
    if (!profile) {
      profile = { user_id: user.id, email: user.email, status: 'pending' };
      await deps.profiles.upsert(profile);
    }
    const status = effectiveStatus(profile, deps.admins);
    const isAdmin = deps.admins.has((user.email || '').toLowerCase());

    if (method === 'GET' && path === '/api/me') return json(200, { email: user.email, status, isAdmin });
    if (status !== 'approved') return json(403, { error: { code: status === 'blocked' ? 'blocked' : 'pending', message: status === 'blocked' ? 'Account blocked' : 'Waiting for approval' } });

    // ---- document store ----
    const m = path.match(/^\/api\/db\/([A-Za-z]+)(?:\/([^/]+))?$/);
    if (m) {
      const collection = m[1];
      let id = m[2];
      if (id !== undefined) { try { id = decodeURIComponent(id); } catch { return json(400, { error: { code: 'bad_id', message: 'Invalid document id' } }); } }
      if (method === 'GET' && !id) {
        console.log(`[api] list ${collection} for user ${user.id}`);
        return json(200, { docs: await deps.vault.list(user.id, collection) });
      }
      if (method === 'POST' && !id) return json(201, await deps.vault.add(user.id, collection, req.body));
      if (method === 'PUT' && id) { await deps.vault.set(user.id, collection, id, req.body); return json(200, { id }); }
      if (method === 'DELETE' && id) { await deps.vault.remove(user.id, collection, id); return json(200, { id }); }
      return json(405, { error: { code: 'bad_method', message: 'Method not allowed' } });
    }

    // ---- receipt / statement reading (nothing is stored) ----
    if (method === 'POST' && path === '/api/read-document') {
      if (!deps.limiter.take(`read:${user.id}`)) return json(429, { error: { code: 'rate_limited', message: 'Too many requests, slow down' } });
      const { prompt, images } = req.body || {};
      if (typeof prompt !== 'string' || prompt.length === 0 || Buffer.byteLength(prompt) > 70_000) return json(400, { error: { code: 'bad_input', message: 'Invalid prompt' } });
      const imgs = Array.isArray(images) ? images : [];
      if (imgs.length > 6) return json(400, { error: { code: 'bad_input', message: 'Too many images' } });
      let total = 0;
      for (const im of imgs) {
        if (!im || typeof im.data !== 'string' || !/^image\/(jpeg|png|webp)$/.test(im.mediaType)) return json(400, { error: { code: 'bad_input', message: 'Invalid image' } });
        total += im.data.length;
      }
      if (total > 8_000_000) return json(413, { error: { code: 'too_large', message: 'Images too large' } });
      const day = new Date().toISOString().slice(0, 10);
      const used = await deps.usage.increment(user.id, day);
      if (used > deps.dailyReadCap) return json(429, { error: { code: 'rate_limited', message: `Daily limit of ${deps.dailyReadCap} document reads reached` } });
      const text = await deps.ai.complete({ prompt, images: imgs, maxTokens: 4000 });
      return json(200, { text });
    }

    // ---- account erase (crypto-shredding) ----
    if (method === 'DELETE' && path === '/api/me') {
      await deps.vault.eraseUser(user.id);
      await deps.profiles.setStatus(user.id, 'blocked');
      return json(200, { erased: true });
    }

    // ---- admin ----
    if (path.startsWith('/api/admin/')) {
      if (!isAdmin) return json(403, { error: { code: 'forbidden', message: 'Admins only' } });
      if (method === 'GET' && path === '/api/admin/users') {
        const list = await deps.profiles.list();
        return json(200, { users: list.map((/** @type {any} */ p) => ({ id: p.user_id, email: p.email, status: effectiveStatus(p, deps.admins), created_at: p.created_at })) });
      }
      const a = path.match(/^\/api\/admin\/users\/([A-Za-z0-9-]+)\/(approve|block)$/);
      if (method === 'POST' && a) {
        await deps.profiles.setStatus(a[1], a[2] === 'approve' ? 'approved' : 'blocked');
        return json(200, { id: a[1], status: a[2] === 'approve' ? 'approved' : 'blocked' });
      }
    }
    return json(404, { error: { code: 'not_found', message: 'Not found' } });
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err instanceof VaultError) return json(err.code === 'too_large' ? 413 : 400, { error: safeError(err) });
    console.error('[api] ERROR', {
      message: err && err.message,
      code: err && err.code,
      name: err && err.name,
      userId: user && user.id,
      path,
      stack: err && err.stack
    });
    return json(500, { error: safeError(err) });
  }
}

/**
 * Decides what a browser page request for the app shell should do.
 * @param {{id:string,email?:string|null}|null} user @param {any} deps
 * @returns {Promise<'login'|'pending'|'blocked'|'ok'>}
 */
export async function pageAccess(user, deps) {
  if (!user) return 'login';
  let profile = await deps.profiles.get(user.id);
  if (!profile) { profile = { user_id: user.id, email: user.email, status: 'pending' }; await deps.profiles.upsert(profile); }
  const st = effectiveStatus(profile, deps.admins);
  return st === 'approved' ? 'ok' : st === 'blocked' ? 'blocked' : 'pending';
}

/** In-memory profile/usage stores for tests + mock server. */
export function memoryProfiles() {
  /** @type {Map<string, any>} */ const m = new Map();
  return {
    async get(id) { return m.get(id) || null; },
    async upsert(p) { if (!m.has(p.user_id)) m.set(p.user_id, { created_at: new Date().toISOString(), ...p }); },
    async list() { return [...m.values()]; },
    async setStatus(id, status) { const p = m.get(id); if (p) p.status = status; },
  };
}
export function memoryUsage() {
  /** @type {Map<string, number>} */ const m = new Map();
  return { async increment(u, day) { const k = `${u}|${day}`; m.set(k, (m.get(k) || 0) + 1); return m.get(k); } };
}
