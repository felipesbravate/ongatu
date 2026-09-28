import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every Okara Design System variable (tests/figma-tokens.json, read from Figma) must be in the :root block of
// src/ui/okara.css with the same value, Color variables must point at the same Primitive as in Figma, and the
// app's short aliases must point at the right Figma variable.
const css = readFileSync(new URL('../src/ui/okara.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root{'), css.indexOf('*{ box-sizing'));
const decl = {};
for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim();
const figma = JSON.parse(readFileSync(new URL('./figma-tokens.json', import.meta.url), 'utf8'));
const kebab = (name) => name.toLowerCase().replace(/\//g, '-');
const cssName = (collection, name) => (collection === 'Primitives' ? '--primitive-' : '--') + kebab(name);
const FONT_FALLBACK = {
  'font/sans': 'system-ui, -apple-system, "Segoe UI", sans-serif',
  'font/mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

test('every Figma variable is in :root with the same value (aliases as var() to the same Primitive)', () => {
  for (const [collection, vars] of Object.entries(figma)) {
    if (collection.startsWith('_')) continue;
    if (collection === 'TextStyles') {
      for (const [name, s] of Object.entries(vars)) {
        const k = '--type-' + kebab(name);
        const want = { size: s.size + 'px', weight: String(s.weight), lh: s.lineHeight == null ? 'normal' : s.lineHeight + 'px', ls: s.letterSpacing ? s.letterSpacing / 100 + 'em' : '0' };
        for (const [p, v] of Object.entries(want)) assert.equal(decl[`${k}-${p}`], v, `${k}-${p}: code has ${decl[`${k}-${p}`]}, Figma ${name} has ${v}`);
      }
      continue;
    }
    for (const [name, value] of Object.entries(vars)) {
      const key = cssName(collection, name);
      const got = decl[key];
      assert.ok(got !== undefined, `${key} (Figma ${collection}/${name}) is missing`);
      let want;
      if (value && typeof value === 'object') want = `var(${cssName('Primitives', value.alias)})`;
      else if (typeof value === 'number') want = collection === 'Opacity' ? String(value > 1 ? value / 100 : value) : value + 'px';
      else if (collection === 'Typography') want = `"${value}", ${FONT_FALLBACK[name] || 'sans-serif'}`;
      else want = value;
      assert.equal(got.toLowerCase(), want.toLowerCase(), `${key}: code has ${got}, Figma has ${want}`);
    }
  }
});

test('app aliases point at their Figma variable', () => {
  const alias = {
    '--page': 'surface-body', '--surface': 'surface-primary', '--surface-2': 'surface-secondary', '--ink': 'text-primary',
    '--ink-2': 'text-secondary', '--ink-muted': 'text-muted', '--border-card': 'border-default', '--on-primary': 'action-secondary',
    '--accent': 'action-accent', '--accent-soft': 'surface-accent-light', '--critical': 'status-fail', '--good': 'status-success',
    '--state-ink-hover': 'action-primary-hover', '--state-ink-press': 'action-primary-press', '--state-surface2-hover': 'action-secondary-hover',
    '--state-surface2-press': 'action-secondary-press', '--state-border-hover': 'border-hover',
  };
  for (const [a, target] of Object.entries(alias)) assert.equal(decl[a], `var(--${target})`, a);
});

test('outside the token block, only Color variables and aliases are used (no Primitive, no hex copy of a token)', () => {
  const body = css.slice(css.indexOf('/* @tokens:end */'))
    .replace(/\/\*[\s\S]*?\*\//g, '');         // comments may quote old values
  const prims = [...body.matchAll(/var\((--primitive-[\w-]+)\)/g)].map((m) => m[1])// Primitives a DS component binds directly (no Color variable for them): allocation labels, the Notification dot, the progress fill.
    .filter((p) => !['--primitive-neutral-ink-muted', '--primitive-data-red-orange', '--primitive-data-green', '--primitive-data-green-light', '--primitive-brand-indigo', '--primitive-brand-mint', '--primitive-brand-mint-light'].includes(p));
  assert.deepEqual(prims, [], 'bind a Color variable instead of a Primitive');
  const colours = new Set(Object.values(figma.Primitives).map((v) => String(v).toLowerCase()));
  const hits = [...body.slice(body.indexOf('*{ box-sizing')).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()).filter((h) => colours.has(h) && h !== '#ffffff');
  assert.deepEqual(hits, [], 'use var(--…) instead of these hex literals');
});

test('every --type-* used in the CSS is a Figma text style', () => {
  const used = new Set([...css.matchAll(/var\((--type-[\w-]+)\)/g)].map((m) => m[1]));
  for (const v of used) assert.ok(decl[v] !== undefined, `${v} is used but not generated from a Figma text style`);
});
