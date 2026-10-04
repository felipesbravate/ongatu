import { NextResponse } from 'next/server';
import { securityHeaders } from '../../../src/lib/headers.js';
import { currentUser, userFromBearer } from '../../../src/server/auth.js';
import { bearerToken } from '../../../src/lib/security.js';
import { getDeps, handle } from '../../../src/server/deps.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reading a long statement can take 20-40 s; give the function room (Vercel caps it by plan).
export const maxDuration = 60;

async function run(request) {
  const url = new URL(request.url).pathname; // raw, still percent-encoded; the API decodes and validates ids itself
  let body;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const raw = await request.text();
    if (raw.length > 12_000_000) return NextResponse.json({ error: { code: 'too_large', message: 'Too large' } }, { status: 413 });
    if (raw) { try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: { code: 'bad_input', message: 'Invalid JSON' } }, { status: 400 }); } }
  }
  const headers = Object.fromEntries(request.headers);
  // Native app sends a bearer token; the web app uses the session cookie. With a bearer header present the
  // cookie is ignored entirely, so one request never mixes both.
  const token = bearerToken(request.headers.get('authorization'));
  const authKind = token ? 'bearer' : 'cookie';
  const user = token ? await userFromBearer(token) : await currentUser();
  const r = await handle({ method: request.method, path: url, headers, body, user, authKind }, getDeps());
  return NextResponse.json(r.body, { status: r.status, headers: securityHeaders() });
}
export { run as GET, run as POST, run as PUT, run as DELETE };
