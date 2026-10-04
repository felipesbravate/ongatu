import test from 'node:test';
import assert from 'node:assert/strict';

// The design system's icon sets come in 10px, 12px and 20px. Nearly all are one drawing scaled; X (10px) and Euro / Dollar
// (10px and 12px) are redrawn per size and carry their own artwork (src/ui/icons.js). X is drawn at 10px and 12px.
import * as icons from '../src/ui/icons.js';
const lib = Object.fromEntries(Object.values(icons).map((ic) => [ic.name, ic]));

test('icons that are redrawn per size carry that size\'s artwork on its own frame', () => {
  const want = { x: ['10', '12'], euro: ['10', '12'], dollar: ['10', '12'] };
  for (const [name, sizes] of Object.entries(want)) {
    for (const s of sizes) {
      const a = lib[name].sizes && lib[name].sizes[s];
      assert.ok(a, `${name} has no ${s}px artwork`);
      assert.equal(a.viewBox, `0 0 ${s} ${s}`, `${name} ${s}px must be drawn on a ${s}x${s} frame`);
      const nums = [...a.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      assert.ok(nums.every((n) => n >= -0.01 && n <= Number(s) + 0.01), `${name} ${s}px has coordinates outside its frame`);
    }
  }
});

test('the 10px X is the small drawing: a 6x6 glyph centred in its 10px frame', () => {
  const nums = [...lib.x.sizes['10'].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [2, 8, 2, 8]);
});

// Sept 24 X update (DS 85:2863): 20px glyph 10x10 at 5..15; 12px glyph 8x8 at 2..10.
test('the 12px X is an 8x8 glyph centred in its 12px frame, the 20px X a 10x10 glyph (DS 85:2863)', () => {
  const nums = [...lib.x.sizes['12'].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  const r = (v) => Math.round(v * 100) / 100;
  assert.deepEqual([r(Math.min(...xs)), r(Math.max(...xs)), r(Math.min(...ys)), r(Math.max(...ys))], [2, 10, 2, 10]);
  const n20 = [...lib.x.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  assert.deepEqual([Math.min(...n20), Math.max(...n20)], [5, 15]);
});

test('file-type icons: Document and Image are drawn on the exact 20px frame', () => {
  for (const name of ['document', 'image']) {
    assert.ok(lib[name], `${name} is missing`);
    assert.equal(lib[name].viewBox, '0 0 20 20', `${name} must use the 20x20 frame`);
    const nums = [...lib[name].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    assert.ok(nums.every((n) => n >= -0.01 && n <= 20.01), `${name} has coordinates outside its frame`);
  }
  assert.notEqual(lib.image.d, lib.document.d);
});

test('every icon is exported once under its own name', () => {
  const names = Object.values(icons).map((ic) => ic.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length >= 140);
});

// Icon sizes are the DS sizes (10 / 12 / 20), set on the Icon, never by CSS.
test('every <Icon> in the app names its DS size, and CSS does not resize icons', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.jsx')) files.push(p); });
  walk(new URL('../src', import.meta.url).pathname);
  const missing = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<Icon\b[^>]*>/g)) if (!/\bsize=(\{|"(2xl|xl|lg|md|sm|tn)")/.test(m[0])) missing.push(f.split('/src/')[1] + ': ' + m[0]);
  }
  assert.deepEqual(missing, []);
  const css = readFileSync(new URL('../src/ui/okara.css', import.meta.url), 'utf8');
  const sized = [...css.matchAll(/([^{}]*svg)\s*\{([^}]*)\}/g)].filter((m) => !/svg text|trend/.test(m[1]) && /(^|;|\s)(width|height)\s*:/.test(m[2])).map((m) => m[1].trim());
  assert.deepEqual(sized, []);
  // Oct 2: the only icon sizing in CSS is .ico-xl / .ico-lg, and it reads the Figma icon-size variables.
  assert.match(css, /\.ico-xl\{ width:var\(--icon-size-xl\); height:var\(--icon-size-xl\); \}/);
  assert.match(css, /\.ico-lg\{ width:var\(--icon-size-lg\); height:var\(--icon-size-lg\); \}/);
  assert.match(css, /\.ico-2xl\{ width:var\(--icon-size-2xl\); height:var\(--icon-size-2xl\); \}/);
});

// Oct 4: Euro Size=32px (793:1079) has its own drawing on a 32 frame; icon-size/2xl is 32 on Mobile, 24 on Desktop.
test('Euro 32px draws its own 32 frame', async () => {
  const { iconFrame } = await import('../src/ui/iconFrame.js');
  const f = iconFrame(icons.euro, 32);
  assert.equal(f.px, 32); assert.equal(f.viewBox, '0 0 32 32'); assert.match(f.drawing.d, /^M17\.2383 28C/);
});

test('Icon draws the Figma frames: 20 = 0 0 20 20, 12/10 = 1 1 18 18, redrawn X/Euro/Dollar on their own frame', async () => {
  const { iconFrame } = await import('../src/ui/iconFrame.js');
  assert.equal(iconFrame(icons.plus, 20).viewBox, '0 0 20 20');
  assert.equal(iconFrame(icons.plus, 12).viewBox, '1 1 18 18');
  assert.equal(iconFrame(icons.plus, 10).viewBox, '1 1 18 18');
  assert.equal(iconFrame(icons.x, 12).viewBox, '0 0 12 12');
  assert.equal(iconFrame(icons.euro, 10).viewBox, '0 0 10 10');
  assert.equal(iconFrame(icons.plus, 16).viewBox, '0 0 20 20');
  assert.equal(iconFrame(icons.plus, 24).px, 24);
  assert.equal(iconFrame(icons.plus, 14).px, 20);
});
