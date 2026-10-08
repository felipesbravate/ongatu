'use client';
import { useTheme } from '../../../src/ui/Theme.jsx';
import { Toggle } from '../../../src/ui/Brand.jsx';
import { CASES } from '../../../src/ui/gallery/cases.jsx';

// A case's `context` recreates the ancestors whose CSS applies to it on the real page (e.g. #add-panel .field).
const wrap = (ctx, el) => (ctx || []).slice().reverse().reduce((inner, w) => <div id={w.id} className={w.className} style={w.style}>{inner}</div>, el);

export default function Gallery() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="wrap" style={{ paddingTop: 24 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Martian+Mono:wght@400;500;600&display=swap" />
      <h1 className="app-title">Okara components</h1>
      <Toggle on={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} label="Dark mode" />
      {CASES.map((c) => (
        <section key={c.id} style={{ marginTop: 40 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>{c.id}{c.legacy ? ' · parity' : ''}</div>
          {wrap(c.context, <div data-case={c.id} data-legacy={c.legacy?.selector} data-state={c.legacy?.state} data-open={c.open} data-compare={c.compare}>{c.render()}</div>)}
        </section>
      ))}
    </div>
  );
}
