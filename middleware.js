// Content-Security-Policy with a per-request nonce for the tracker page. Next reads the nonce from the request
// header and puts it on its own scripts; nothing else can run.
import { NextResponse } from 'next/server';
import { trackerCsp } from './src/lib/headers.js';

export function middleware(request) {
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
