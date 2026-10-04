import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as ill from '../src/ui/illustrations.js';

// src/ui/illustrations.js is generated from the SVG exports in Illustrations/ (one file per Figma illustration).
test('illustrations.js is generated from the Illustrations folder', () => {
  execFileSync(process.execPath, ['scripts/sync-illustrations.mjs', '--check'], { stdio: 'pipe' });
});

test('every illustration has a 0 0 w h viewBox and at least one path', () => {
  assert.equal(ill.all.length, 111); // + Head, Success (Oct 2, onboarding)
  for (const a of ill.all) {
    assert.equal(a.viewBox, `0 0 ${a.width} ${a.height}`, a.name);
    assert.ok(a.paths.length > 0, a.name);
  }
  assert.ok(ill.trashCan, 'the delete modal uses trashCan');
});
