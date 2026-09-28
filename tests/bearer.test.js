import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken } from '../src/lib/security.js';

test('bearerToken reads only a well-formed Bearer header', () => {
  assert.equal(bearerToken('Bearer abc.def-ghi_jkl'), 'abc.def-ghi_jkl');
  assert.equal(bearerToken('bearer abc'), null);
  assert.equal(bearerToken('Bearer '), null);
  assert.equal(bearerToken('Bearer a b'), null);
  assert.equal(bearerToken('Basic xyz'), null);
  assert.equal(bearerToken(undefined), null);
});
