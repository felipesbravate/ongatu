// @ts-check
// Security headers for every response, and the Content-Security-Policy of the tracker page.

/** Baseline headers for every response. @param {string} [csp] */
export function securityHeaders(csp) {
  /** @type {Record<string,string>} */
  const h = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'cache-control': 'no-store',
  };
  if (csp) h['content-security-policy'] = csp;
  return h;
}

/**
 * CSP for the tracker page. Scripts run only with this response's nonce (Next puts it on its own scripts;
 * 'strict-dynamic' lets those load the app's chunks and pdf.js). 'unsafe-inline' for styles is needed by
 * inline style attributes. No third-party script hosts.
 * @param {string} nonce @param {{ dev?: boolean }} [o] dev adds what `next dev` needs (eval, websocket)
 */
export function trackerCsp(nonce, o = {}) {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    `connect-src 'self'${o.dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * CSP for the Expo web build under /rn (trial, Nov 25). Its index.html is a static export, so it cannot carry a
 * per-request nonce; the bundle is a same-origin file, so 'self' allows exactly it (and pdf.js from /vendor). Styles:
 * react-native-web injects <style> tags at runtime ('unsafe-inline', as the tracker page). Fonts are bundled files.
 */
export function rnCsp() {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
