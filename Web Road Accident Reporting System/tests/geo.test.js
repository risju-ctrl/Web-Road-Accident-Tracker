import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, normalizeLocation, compareReports, rankOfficers, pickNearest, isStale } from '../utils/geo.js';

// Two points on MacArthur Highway, Calumpit, about 111 m apart (0.001 degree of latitude).
const A = { latitude: 14.9170, longitude: 120.7650 };
const B = { latitude: 14.9180, longitude: 120.7650 };
const FAR = { latitude: 14.9400, longitude: 120.7650 }; // ~2.5 km away

const rep = (over = {}) => ({
  accident_date: '2026-10-20', accident_time: '08:30', location: 'MacArthur Hwy, Calumpit',
  latitude: A.latitude, longitude: A.longitude, ...over
});

test('haversine gives roughly 111 m for 0.001 degree of latitude', () => {
  const d = haversineMeters(A, B);
  assert.ok(d > 105 && d < 117, `got ${d}`);
  assert.equal(Math.round(haversineMeters(A, A)), 0);
});

test('coordinates arriving as strings (Postgres numeric) still work', () => {
  const d = haversineMeters({ latitude: '14.9170', longitude: '120.7650' }, B);
  assert.ok(d > 105 && d < 117);
});

test('location text is compared without case, punctuation or spacing', () => {
  assert.equal(normalizeLocation('  Km 45 , MacArthur  Hwy. '), 'km 45 macarthur hwy');
});

test('same time, 111 m apart = duplicate, and the distance is reported', () => {
  const r = compareReports(rep({ ...B }), rep());
  assert.equal(r.match, true);
  assert.equal(r.reason, 'coordinates');
  assert.ok(r.distance_m > 105 && r.distance_m < 117);
});

test('same time but 2.5 km apart is a different accident', () => {
  assert.equal(compareReports(rep({ ...FAR }), rep()).match, false);
});

test('same place but hours apart is a different accident', () => {
  assert.equal(compareReports(rep({ accident_time: '14:00' }), rep()).match, false);
  assert.equal(compareReports(rep({ accident_time: '09:45' }), rep()).match, true);
});

test('crossing midnight is handled', () => {
  const late = rep({ accident_date: '2026-10-19', accident_time: '23:50' });
  const early = rep({ accident_date: '2026-10-20', accident_time: '00:20' });
  assert.equal(compareReports(late, early).match, true);
});

test('without coordinates the typed location decides', () => {
  const noPin = (loc) => rep({ latitude: undefined, longitude: undefined, location: loc });
  assert.equal(compareReports(noPin('MacArthur Hwy, Calumpit'), noPin('macarthur hwy calumpit')).match, true);
  assert.equal(compareReports(noPin('MacArthur Hwy'), noPin('MacArthur Hwy, Calumpit')).match, true);
  assert.equal(compareReports(noPin('MacArthur Hwy, Calumpit'), noPin('Plaridel Bypass Road')).match, false);
});

test('one report with a pin and one without falls back to the typed location', () => {
  const noPin = rep({ latitude: undefined, longitude: undefined });
  assert.equal(compareReports(noPin, rep()).match, true);
});

test('a very short location is not enough to call two reports the same', () => {
  const noPin = (loc) => rep({ latitude: undefined, longitude: undefined, location: loc });
  assert.equal(compareReports(noPin('Hwy'), noPin('Hwy')).match, false);
});

const NOW = Date.parse('2026-10-20T10:00:00Z');
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();
const officer = (id, over = {}) => ({
  id, name: `Officer ${id}`, open_cases: 0, on_duty: true,
  latitude: null, longitude: null, location_updated_at: null, ...over
});

test('officers are ranked nearest first and the nearest on-duty one is picked', () => {
  const ranked = rankOfficers([
    officer(1, { ...FAR, location_updated_at: minsAgo(5) }),
    officer(2, { ...B, location_updated_at: minsAgo(5) }),
    officer(3)
  ], A, { now: NOW });
  assert.deepEqual(ranked.map((o) => o.id), [2, 1, 3]);
  assert.equal(pickNearest(ranked).id, 2);
  assert.ok(ranked[0].distance_m < ranked[1].distance_m);
  assert.equal(ranked[2].distance_m, null);
});

test('an off-duty officer is never picked even if closest', () => {
  const ranked = rankOfficers([
    officer(1, { ...A, on_duty: false, location_updated_at: minsAgo(1) }),
    officer(2, { ...FAR, location_updated_at: minsAgo(1) })
  ], A, { now: NOW });
  assert.equal(pickNearest(ranked).id, 2);
  assert.equal(ranked[1].id, 1);
});

test('an old position is flagged and not picked while a fresh one exists', () => {
  const ranked = rankOfficers([
    officer(1, { ...A, location_updated_at: minsAgo(300) }),
    officer(2, { ...FAR, location_updated_at: minsAgo(2) })
  ], A, { now: NOW });
  assert.equal(ranked[0].id, 2);
  assert.equal(ranked[1].stale, true);
  assert.equal(pickNearest(ranked).id, 2);
});

test('a report without a pin gives no nearest officer and orders by workload', () => {
  const ranked = rankOfficers([
    officer(1, { open_cases: 4 }),
    officer(2, { open_cases: 1 })
  ], { latitude: null, longitude: null }, { now: NOW });
  assert.deepEqual(ranked.map((o) => o.id), [2, 1]);
  assert.equal(pickNearest(ranked), null);
});

test('equal distance is broken by the lighter caseload', () => {
  const ranked = rankOfficers([
    officer(1, { ...B, open_cases: 3, location_updated_at: minsAgo(1) }),
    officer(2, { ...B, open_cases: 0, location_updated_at: minsAgo(1) })
  ], A, { now: NOW });
  assert.equal(ranked[0].id, 2);
});

test('isStale treats a missing timestamp as stale', () => {
  assert.equal(isStale(null, NOW), true);
  assert.equal(isStale(minsAgo(10), NOW), false);
});

test('live means a position a few minutes old; older is only "last seen"', async () => {
  const { LIVE_WINDOW_MIN } = await import('../utils/geo.js');
  assert.equal(LIVE_WINDOW_MIN, 5);
  assert.equal(isStale(minsAgo(2), NOW, LIVE_WINDOW_MIN), false);
  assert.equal(isStale(minsAgo(6), NOW, LIVE_WINDOW_MIN), true);
});
