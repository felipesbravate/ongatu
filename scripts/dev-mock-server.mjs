// Dependency-free local server that runs the SAME api/vault/CSP code as production, with
// in-memory storage and a fake sign-in (pick any email). For development and e2e tests only.
// It refuses to start when NODE_ENV=production.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, memoryAccounts, memoryProfiles, memoryUsage, pageAccess } from '../src/lib/api.js';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { RateLimiter, parseAdminEmails } from '../src/lib/security.js';
import { securityHeaders } from '../src/lib/headers.js';
import { EMAIL_COOKIE, LOGIN_CTX_COOKIE, LOGIN_NAME_COOKIE, cleanCode, cleanEmail, cleanName, encodeCtx, greetingName } from '../src/lib/otp-login.js';

if (process.env.NODE_ENV === 'production') { console.error('mock server must not run in production'); process.exit(1); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3100);
const ORIGIN = process.env.APP_ORIGIN || `http://127.0.0.1:${PORT}`;
const stores = memoryStores();
export const state = { aiCalls: [], stores };
const deps = {
  vault: new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: stores.keys, docs: stores.docs }),
  profiles: memoryProfiles(), usage: memoryUsage(),
  ai: { async complete(a) { state.aiCalls.push(a); if (a.prompt.includes('CERTAIN SHOP')) return '[{"type":"expense","group":"Variable","category":"Food","item":"Groceries","certainty":"sure","description":"Mock certain shop","amount":23.4,"date":"2026-09-01"}]'; return process.env.MOCK_AI_REPLY || '[{"type":"expense","group":"Variable","category":"Food","item":"Groceries","description":"Mock supermarket","amount":23.4,"date":"2026-09-01"}]'; } },
  admins: parseAdminEmails(process.env.ADMIN_EMAILS || 'admin@example.com'),
  // The mock keeps the approval step (the e2e test covers it) unless REQUIRE_APPROVAL=0.
  requireApproval: process.env.REQUIRE_APPROVAL !== '0',
  appOrigin: ORIGIN, limiter: new RateLimiter(60, 60_000), dailyReadCap: Number(process.env.DAILY_READ_CAP || 50),
};
deps.accounts = memoryAccounts(deps.profiles);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const cookieUser = (h) => { const m = /(?:^|; )mock_user=([^;]+)/.exec(h.cookie || ''); if (!m) return null; const email = decodeURIComponent(m[1]).toLowerCase(); return { id: 'u-' + Buffer.from(email).toString('hex').slice(0, 24), email, name: deps.accounts.names.get(email) || null }; };
const cookieOf = (h, name) => { const m = new RegExp('(?:^|; )' + name + '=([^;]+)').exec(h.cookie || ''); return m ? decodeURIComponent(m[1]) : null; };
const setC = (name, value) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`;
const clearC = (name) => `${name}=; Path=/; Max-Age=0`;
// The mock's sign-in code (the real one is emailed by Supabase).
const MOCK_CODE = '123456';
const readBody = (req) => new Promise((res, rej) => { const c = []; let n = 0; req.on('data', (d) => { n += d.length; if (n > 12e6) { rej(new Error('too big')); req.destroy(); } else c.push(d); }); req.on('end', () => res(Buffer.concat(c).toString('utf8'))); req.on('error', rej); });
const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...securityHeaders(), ...headers }); res.end(body); };

// The tracker page itself comes from a running Next server (UI_ORIGIN, e.g. `npx next start -p 3300`); the API,
// sign-in and data stay here, in memory.
const UI_ORIGIN = process.env.UI_ORIGIN || 'http://127.0.0.1:3300';
async function proxy(req, res, target) {
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const requestHeaders = { cookie: req.headers.cookie || '', accept: req.headers.accept || '*/*', 'accept-encoding': 'identity' };
  // Preserve App Router requests so local navigation tests receive RSC, not a new HTML document.
  for (const key of ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url']) {
    if (req.headers[key]) requestHeaders[key] = req.headers[key];
  }
  const r = await fetch(UI_ORIGIN + target, { method: req.method, headers: requestHeaders, body, redirect: 'manual' });
  const headers = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) headers[k] = v; });
  res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
}

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN); const path = url.pathname; const user = cookieUser(req.headers);
    if (path.startsWith('/_next/') || path.startsWith('/__nextjs')) return proxy(req, res, req.url);
    if (path.startsWith('/api/')) {
      let body; const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : '';
      if (raw) { try { body = JSON.parse(raw); } catch { return send(res, 400, '{"error":{"code":"bad_input","message":"Invalid JSON"}}', { 'content-type': 'application/json' }); } }
      const r = await handle({ method: req.method, path, headers: req.headers, body, user }, deps);
      return send(res, r.status, JSON.stringify(r.body), { 'content-type': 'application/json' });
    }
    if (path === '/auth/signout' && req.method === 'POST') return send(res, 200, '{}', { 'content-type': 'application/json', 'set-cookie': 'mock_user=; Path=/; Max-Age=0' });
    // Sign-in steps: the page itself is the real Next page (/login); these handlers stand in for app/auth/* with the
    // same cookies and redirects, a fixed code (123456) and in-memory accounts.
    if (path === '/login') {
      if (user) return send(res, 303, '', { location: '/' });
      return proxy(req, res, path + url.search);
    }
    if (req.method === 'POST' && ['/auth/login', '/auth/signup', '/auth/verify', '/auth/password'].includes(path)) {
      const f = new URLSearchParams(await readBody(req));
      const go = (location, cookies = []) => send(res, 303, '', { location, 'set-cookie': cookies });
      const signedIn = (email) => go('/', [`mock_user=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax`, clearC(EMAIL_COOKIE), clearC(LOGIN_CTX_COOKIE), clearC(LOGIN_NAME_COOKIE)]);
      const cur = cleanEmail(cookieOf(req.headers, EMAIL_COOKIE));
      if (path === '/auth/login') {
        const email = cleanEmail(f.get('email')); if (!email) return go('/login?error=email');
        const resend = !!f.get('send_code');
        const who = await deps.accounts.lookup(email);
        const n = greetingName(who.name, email);
        if (who.exists && who.method === 'password' && !resend) return go('/login?step=password', [setC(EMAIL_COOKIE, email), setC(LOGIN_CTX_COOKIE, encodeCtx({ k: 'password', n }))]);
        const k = resend ? (f.get('from') === 'new' ? 'new' : 'code') : (who.exists ? 'code' : 'new');
        return go(k === 'new' && !resend ? '/login?step=new' : `/login?step=code${resend ? '&sent=1' : ''}`, [setC(EMAIL_COOKIE, email), setC(LOGIN_CTX_COOKIE, encodeCtx({ k, n }))]);
      }
      if (!cur) return go('/login');
      if (path === '/auth/signup') {
        const name = cleanName(f.get('name')), email = cleanEmail(f.get('email'));
        if (!name) return go('/login?step=new&error=name'); if (!email) return go('/login?step=new&error=email');
        return go('/login?step=code', [setC(EMAIL_COOKIE, email), setC(LOGIN_NAME_COOKIE, name), setC(LOGIN_CTX_COOKIE, encodeCtx({ k: 'new', n: greetingName(name, email) }))]);
      }
      if (path === '/auth/verify') {
        if (cleanCode(f.get('code') || f.getAll('c').join('')) !== MOCK_CODE) return go('/login?step=code&error=code');
        const name = cleanName(cookieOf(req.headers, LOGIN_NAME_COOKIE)); if (name) deps.accounts.names.set(cur, name);
        return signedIn(cur);
      }
      return (await deps.accounts.checkPassword(cur, f.get('password') || '')) ? signedIn(cur) : go('/login?step=password&error=password');
    }
    if (path === '/pending') return send(res, 200, '<!doctype html><link rel="icon" href="data:,"><title>Pending</title><h1>Waiting for approval</h1><p>An administrator has to approve your account before you can use the tracker.</p>', { 'content-type': 'text/html' });
    if (path === '/' || path === '/account' || path === '/welcome') {
      const access = await pageAccess(user, deps);
      if (access === 'login') return send(res, 303, '', { location: '/login' });
      if (access !== 'ok') return send(res, 303, '', { location: '/pending' });
      return proxy(req, res, path + url.search);
    }
    if (path === '/__test/state' && process.env.MOCK_TEST_ENDPOINTS === '1') {
      return send(res, 200, JSON.stringify({ aiCalls: state.aiCalls.map((c) => ({ prompt: c.prompt.slice(0, 4000), images: (c.images || []).length })), rows: [...stores.docMap.values()], keys: [...stores.keyMap.keys()] }), { 'content-type': 'application/json' });
    }
    const file = normalize(join(root, 'public', path));
    if (!file.startsWith(join(root, 'public') + '/')) return send(res, 404, 'Not found');
    try { return send(res, 200, await readFile(file), { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); }
    catch { return send(res, 404, 'Not found'); }
  } catch (e) { console.error(e); send(res, 500, 'error'); }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, '127.0.0.1', () => console.log(`mock server on ${ORIGIN} (admin: ${[...deps.admins].join(', ')})`));
