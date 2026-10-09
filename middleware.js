// Content-Security-Policy with a per-request nonce for the tracker page. Next reads the nonce from the request
// header and puts it on its own scripts; nothing else can run.
import { NextResponse } from 'next/server';
import { trackerCsp } from './src/lib/headers.js';

// Oct 9: a visitor with no session cookie at all goes straight to /login, so a signed-out visit never shows the
// dashboard's loading skeleton before the 401 sends it there. Only the cookie's presence is checked here; the page and
// /api still verify the session (an expired cookie still ends on /login, a step later). `mock_user` is the local
// mock server's session cookie (scripts/dev-mock-server.mjs).
const SESSION_COOKIE = /^(sb-.+-auth-token(\.\d+)?|mock_user)$/;
const PRIVATE_PAGES = new Set(['/', '/account', '/welcome']);

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;
  if (PRIVATE_PAGES.has(pathname) && !searchParams.has('code') && !request.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name) && c.value)) {
    const to = request.nextUrl.clone(); to.pathname = '/login'; to.search = '';
    return NextResponse.redirect(to, 307);
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = trackerCsp(nonce, { dev: process.env.NODE_ENV !== 'production' });
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('content-security-policy', csp);
  res.headers.set('cache-control', 'no-store');
  return res;
}

export const config = { matcher: ['/', '/account', '/login', '/welcome'] };
