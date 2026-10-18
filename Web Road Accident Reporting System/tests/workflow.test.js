import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionError } from '../utils/helpers.js';
import { detectType } from '../utils/upload.js';

const report = (over = {}) => ({ status: 'submitted', assigned_to: null, reporter_id: 3, ...over });
const admin = { id: 1, role: 'admin' };
const officer = { id: 2, role: 'traffic_officer' };
const reporter = { id: 3, role: 'reporter' };

test('admin can start a review', () => {
  assert.equal(transitionError(report(), 'under_review', admin), null);
});

test('reporter cannot verify or review a report', () => {
  assert.match(transitionError(report({ status: 'under_review' }), 'verified', reporter), /may not change/);
});

test('skipping steps is rejected', () => {
  assert.match(transitionError(report(), 'resolved', admin), /cannot go from/);
});

test('rejecting needs a reason', () => {
  assert.match(transitionError(report({ status: 'under_review' }), 'rejected', admin, ''), /reason is required/);
  assert.equal(transitionError(report({ status: 'under_review' }), 'rejected', admin, 'Duplicate'), null);
});

test('only the assigned officer can move an assigned report', () => {
  const r = report({ status: 'assigned', assigned_to: 2 });
  assert.equal(transitionError(r, 'in_progress', officer), null);
  assert.match(transitionError(r, 'in_progress', { id: 9, role: 'traffic_officer' }), /may not change/);
});

test('reporter can answer a clarification request', () => {
  assert.equal(transitionError(report({ status: 'needs_clarification' }), 'under_review', reporter), null);
});

test('resolved and rejected are final', () => {
  assert.match(transitionError(report({ status: 'resolved' }), 'in_progress', admin), /cannot go from/);
  assert.match(transitionError(report({ status: 'rejected' }), 'under_review', admin), /cannot go from/);
});

test('upload type comes from file bytes, not the name', () => {
  assert.equal(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(detectType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(detectType(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(detectType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});
