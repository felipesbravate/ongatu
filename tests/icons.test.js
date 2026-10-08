import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as icons from '../src/ui/icons.js';
import { iconFrame } from '../src/ui/iconFrame.js';

test('all 153 icon families and native artwork match the SVG exports', () => {
  execFileSync(process.execPath, ['scripts/sync-icons.mjs', '--check']);
  const names = Object.values(icons).map(icon => icon.name);
  assert.equal(names.length, 153);
  assert.equal(new Set(names).size, names.length);
  for (const icon of Object.values(icons)) {
    const svg = readFileSync(new URL('../public' + icon.asset.split('?')[0], import.meta.url), 'utf8');
    assert.match(svg, /<path\b/);
    for (const [size, frame] of Object.entries(icon.sizes)) {
      const [x, y, w, h] = frame.viewBox.split(' ').map(Number);
      assert.equal(w, Number(size)); assert.equal(h, Number(size));
      assert.ok(x >= 0 && y >= 0 && x + w <= icon.width && y + h <= icon.height, icon.name);
    }
  }
});

test('exact size frames, padded Security and differently ordered duplicate families', () => {
  assert.equal(iconFrame(icons.plus, 10).viewBox, '0 0 10 10');
  assert.equal(iconFrame(icons.plus, 12).viewBox, '26 0 12 12');
  assert.equal(iconFrame(icons.plus, 16).viewBox, '54 0 16 16');
  assert.equal(iconFrame(icons.plus, 20).viewBox, '86 0 20 20');
  assert.equal(iconFrame(icons.plus, 24).viewBox, '122 0 24 24');
  assert.equal(iconFrame(icons.euro, 32).viewBox, '162 0 32 32');
  assert.equal(iconFrame(icons.security, 20).viewBox, '94 8 20 20');
  assert.equal(iconFrame(icons.microphone2, 16).viewBox, '90 0 16 16');
  assert.equal(iconFrame(icons.microphone2, 20).viewBox, '54 0 20 20');
  assert.equal(iconFrame(icons.microphone2, 24).viewBox, '54 0 20 20');
  assert.equal(iconFrame(icons.plus, 32).viewBox, '122 0 24 24');
  assert.equal(iconFrame(icons.plus, 14).px, 20);
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
