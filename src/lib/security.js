// @ts-check
// Request-level defences that do not depend on any framework.

/**
 * CSRF defence for cookie-authenticated JSON APIs: state-changing requests must (a) carry a custom
 * header, which browsers will not attach cross-site without a CORS preflight we never grant, and
 * (b) come from our own origin when the browser tells us its origin.
 * @param {{ method: string, headers: Record<string,string|undefined> }} req
 * @param {string} appOrigin e.g. "https://costs.example.com"
 * @returns {boolean}
 */
export function passesCsrf(req, appOrigin) {
  const m = req.method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (req.headers['x-requested-with'] !== 'costs-tracker') return false;
  const origin = req.headers['origin'];
  if (origin && origin !== appOrigin) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

/**
 * CSRF check for plain HTML form posts (login / sign-out): the browser always sends Origin on POST.
 * @param {{ method: string, headers: Record<string,string|undefined> }} req @param {string} appOrigin
 */
export function passesFormCsrf(req, appOrigin) {
  if (req.method.toUpperCase() !== 'POST') return false;
  // Sec-Fetch-Site is set by the browser itself and cannot be forged by page scripts. Origin alone is not
  // reliable here: under Referrer-Policy: no-referrer browsers send "Origin: null" even for same-origin forms.
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  return req.headers['origin'] === appOrigin;
}

/** @param {string | undefined} raw comma-separated env list @returns {Set<string>} */
export function parseAdminEmails(raw) {
  return new Set((raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Approval policy. Admins (ADMIN_EMAILS) are always approved; a blocked account stays blocked.
 * Since Oct 4 sign-up is open by default: everyone else is approved on sign-up. With approval
 * required (REQUIRE_APPROVAL=1 on the server) a new account waits for an admin instead.
 * @param {{ email?: string|null, status?: string|null }} profile
 * @param {Set<string>} admins
 * @param {boolean} [requireApproval]
 */
export function effectiveStatus(profile, admins, requireApproval = true) {
  const email = (profile.email || '').toLowerCase();
  if (email && admins.has(email)) return 'approved';
  if (profile.status === 'approved' || profile.status === 'blocked') return profile.status;
  return requireApproval ? 'pending' : 'approved';
}
/** The status a new account is stored with. @param {any} deps */
export const newAccountStatus = (deps) => (deps.requireApproval === false ? 'approved' : 'pending');

/** Fixed-window in-memory limiter (per instance; the DB-backed daily cap is the hard limit). */
export class RateLimiter {
  /** @param {number} limit @param {number} windowMs */
  constructor(limit, windowMs) {
    this.limit = limit; this.windowMs = windowMs;
    /** @type {Map<string,{n:number,reset:number}>} */ this.hits = new Map();
  }
  /** @param {string} key @param {number} [now] */
  take(key, now = Date.now()) {
    let h = this.hits.get(key);
    if (!h || now >= h.reset) { h = { n: 0, reset: now + this.windowMs }; this.hits.set(key, h); }
    h.n += 1;
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (now >= v.reset) this.hits.delete(k);
    return h.n <= this.limit;
  }
}

/** Never echo internals to clients. */
export function safeError(/** @type {any} */ e) {
  if (e && typeof e.code === 'string' && /^(bad_|too_|not_|rate_|forbidden|pending|blocked|unauth)/.test(e.code)) {
    return { code: e.code, message: String(e.message).slice(0, 200) };
  }
  return { code: 'internal', message: 'Something went wrong' };
}

/** Bearer token from an Authorization header (native app), or null. @param {string | null | undefined} header */
export function bearerToken(header) {
  const m = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header || '');
  return m ? m[1] : null;
}
