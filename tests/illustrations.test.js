import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as ill from '../src/ui/illustrations.js';

// src/ui/illustrations.js is generated from the SVG exports in Illustrations/ (one file per Figma illustration).
test('illustrations.js is generated from the Illustrations folder', () => {
  execFileSync(process.execPath, ['scripts/sync-illustrations.mjs', '--check'], { stdio: 'pipe' });
});

test('every illustration has a 0 0 w h viewBox and a complete local SVG', () => {
  assert.equal(ill.all.length, 113); // + Head, Success (Oct 2, onboarding), Calendar (Oct 4, mobile year modal), Empty state (Oct 6, setup)
  for (const a of ill.all) {
    assert.equal(a.viewBox, `0 0 ${a.width} ${a.height}`, a.name);
    const svg = readFileSync(new URL('../public' + a.asset.split('?')[0], import.meta.url), 'utf8');
    assert.match(svg, /<path\b/, a.name);
  }
  assert.ok(ill.trashCan, 'the delete modal uses trashCan');
  assert.ok(ill.emptyState, 'the setup board empty state uses emptyState (Illustrations 3103:94)');
});
