'use client';
// Oct 9: instead of Next's blank "Application error" page, say what broke and offer a reload. The message and the
// first lines of the stack are shown so a crash on a phone (no console there) can be reported from a screenshot.
import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  const detail = [error && error.name && error.message ? `${error.name}: ${error.message}` : String(error), error && error.digest ? `digest ${error.digest}` : null,
    error && error.stack ? String(error.stack).split('\n').slice(0, 8).join('\n') : null].filter(Boolean).join('\n');
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f9f9f7', color: '#16150f', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '64px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: '#747167', fontSize: 14, lineHeight: '20px' }}>Ongatu hit an error while loading. Reloading usually fixes it. If it keeps happening, send a screenshot of the details below.</p>
          <button type="button" onClick={() => { try { reset(); } catch { /* fall through */ } location.reload(); }}
            style={{ alignSelf: 'flex-start', border: 0, borderRadius: 999, padding: '12px 24px', background: '#16150f', color: '#fff', fontSize: 16 }}>Reload</button>
          <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: '#efeee9', fontSize: 11, lineHeight: '15px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail}</pre>
        </main>
      </body>
    </html>
  );
}
