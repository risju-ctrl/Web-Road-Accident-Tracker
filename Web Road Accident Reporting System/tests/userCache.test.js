import test from 'node:test';
import assert from 'node:assert/strict';
import { getCachedUser, cacheUser, invalidateUser } from '../utils/userCache.js';

test('a cached user is returned until it is invalidated', () => {
  cacheUser(7, { id: 7, role: 'reporter', is_active: true });
  assert.equal(getCachedUser(7).role, 'reporter');
  invalidateUser(7);
  assert.equal(getCachedUser(7), null);
});

test('an unknown user is a cache miss', () => {
  assert.equal(getCachedUser(999999), null);
});
