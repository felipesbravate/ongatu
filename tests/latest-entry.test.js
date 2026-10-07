import test from 'node:test';
import assert from 'node:assert/strict';
import { latestEntry } from '../src/tracker/latest-entry.js';
const scope = { year: '2026', monthIndex: 9, type: 'expense' };
const fixed = { ...scope, id: 'fixed', group: 'Fixed', date: '2026-10-06', createdAt: '2026-10-06T12:00:00Z' };
const variable = { ...scope, id: 'variable', group: 'Variable', date: '2026-10-01', createdAt: '2026-10-07T12:00:00Z' };
const entries = [variable, fixed, { ...variable, id: 'other-month', monthIndex: 10, createdAt: '2026-11-01' }, { ...variable, type: 'income' }];
test('last update follows creation time, including backdated entries, without mutating entries', () => {
  assert.equal(latestEntry(entries, scope), variable);
  assert.equal(entries[0], variable);
});
test('last update narrows to the selected sub-category and returns no entry for empty scopes', () => {
  assert.equal(latestEntry(entries, { ...scope, group: 'Fixed' }), fixed);
  assert.equal(latestEntry(entries, { ...scope, group: 'Extra' }), null);
  assert.equal(latestEntry(entries, { ...scope, year: '2025' }), null);
});
test('older entries without creation timestamps use their transaction dates', () => {
  const older = { ...scope, date: '2026-10-01' };
  const newer = { ...scope, date: '2026-10-03' };
  assert.equal(latestEntry([newer, older], scope), newer);
});
