import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DEVICES, startupImages } from '../src/lib/home-screen.js';
import { trackerCsp } from '../src/lib/headers.js';
import manifest from '../app/manifest.js';

test('every iPhone launch image exists, light and dark', () => {
  for (const l of startupImages(null)) assert.ok(existsSync('public' + l.href), l.href);
  assert.equal(startupImages(null).length, DEVICES.length * 2);
});

test('a saved theme only offers its own launch images, without the colour-scheme query', () => {
  const dark = startupImages('dark');
  assert.equal(dark.length, DEVICES.length);
  assert.ok(dark.every((l) => l.href.endsWith('-dark.png') && !l.media.includes('prefers-color-scheme')));
});

test('the manifest launches full screen at / with any + maskable icons that exist', () => {
  const m = manifest();
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(existsSync('public' + i.src), i.src);
});

test('the page CSP allows the manifest', () => {
  assert.match(trackerCsp('n'), /manifest-src 'self'/);
});
