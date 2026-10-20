// Distance and matching helpers for duplicate detection and nearest-officer lookup.
// Pure functions only (no database), so they are covered by tests/geo.test.js.

const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;

// Postgres returns numeric columns as strings and the forms send strings, so every
// coordinate goes through here. Returns null for anything that is not a real coordinate.
export function toCoord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function hasCoords(point) {
  if (!point) return false;
  const lat = toCoord(point.latitude);
  const lng = toCoord(point.longitude);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Great-circle distance in metres between two { latitude, longitude } points.
export function haversineMeters(a, b) {
  const lat1 = toRad(toCoord(a.latitude));
  const lat2 = toRad(toCoord(b.latitude));
  const dLat = lat2 - lat1;
  const dLng = toRad(toCoord(b.longitude) - toCoord(a.longitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// "  Km 45 , MacArthur Hwy " and "km 45, macarthur hwy" are the same place.
export function normalizeLocation(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Combines the accident date (YYYY-MM-DD or a Date) and time (HH:MM[:SS]) into minutes
// since epoch. Both sides of a comparison are read the same way, so the zone cancels out.
export function accidentMinutes(date, time) {
  const day = date instanceof Date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : String(date || '').slice(0, 10);
  const t = String(time || '00:00').slice(0, 5);
  const ms = Date.parse(`${day}T${t}:00Z`);
  return Number.isNaN(ms) ? null : ms / 60000;
}

export const DUPLICATE_RADIUS_M = Number(process.env.DUPLICATE_RADIUS_M) || 200;
export const DUPLICATE_WINDOW_MIN = Number(process.env.DUPLICATE_WINDOW_MIN) || 120;

// Decides whether `incoming` (a report being submitted) looks like the same accident as
// `existing`. Returns { match, distance_m, reason } so the caller can show why.
//
// Same scenario means: reported for about the same time AND the same place.
//   - Both have coordinates: within DUPLICATE_RADIUS_M metres.
//   - Otherwise: the typed location is identical once normalised, or one contains the
//     other ("Km 45 MacArthur Hwy" inside "Km 45 MacArthur Hwy, Calumpit").
export function compareReports(incoming, existing, opts = {}) {
  const radius = opts.radiusM ?? DUPLICATE_RADIUS_M;
  const windowMin = opts.windowMin ?? DUPLICATE_WINDOW_MIN;

  const t1 = accidentMinutes(incoming.accident_date, incoming.accident_time);
  const t2 = accidentMinutes(existing.accident_date, existing.accident_time);
  if (t1 === null || t2 === null || Math.abs(t1 - t2) > windowMin) {
    return { match: false, distance_m: null, reason: 'time' };
  }

  if (hasCoords(incoming) && hasCoords(existing)) {
    const distance_m = Math.round(haversineMeters(incoming, existing));
    return distance_m <= radius
      ? { match: true, distance_m, reason: 'coordinates' }
      : { match: false, distance_m, reason: 'distance' };
  }

  const a = normalizeLocation(incoming.location);
  const b = normalizeLocation(existing.location);
  if (a.length >= 5 && b.length >= 5 && (a === b || a.includes(b) || b.includes(a))) {
    return { match: true, distance_m: null, reason: 'location_text' };
  }
  return { match: false, distance_m: null, reason: 'location' };
}

// An officer counts as "live" on the map while their last position is this fresh. The
// officer's browser sends a position every 30 seconds, so a few minutes of silence means
// the page was closed or the connection dropped.
export const LIVE_WINDOW_MIN = Number(process.env.OFFICER_LIVE_WINDOW_MIN) || 5;

export const LOCATION_STALE_MIN = Number(process.env.OFFICER_LOCATION_STALE_MIN) || 120;

// An officer's shared location is only trustworthy for a while. After that they have
// probably moved, so the admin is told the position is old instead of being misled.
export function isStale(updatedAt, now = Date.now(), staleMin = LOCATION_STALE_MIN) {
  if (!updatedAt) return true;
  const t = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt);
  return Number.isNaN(t) || now - t > staleMin * 60000;
}

// Orders officers for assignment. `point` is the report's { latitude, longitude }.
//   tier 0  on duty, position known and recent  -> nearest first
//   tier 1  on duty, position known but old     -> nearest first
//   tier 2  on duty, no position (or the report has none) -> fewest open cases first
//   tier 3  off duty
export function rankOfficers(officers, point, opts = {}) {
  const reportHasPoint = hasCoords(point);
  const rows = officers.map((o) => {
    const located = reportHasPoint && hasCoords(o);
    const stale = hasCoords(o) ? isStale(o.location_updated_at, opts.now) : false;
    const onDuty = o.on_duty !== false;
    const tier = !onDuty ? 3 : !located ? 2 : stale ? 1 : 0;
    return {
      ...o,
      distance_m: located ? Math.round(haversineMeters(point, o)) : null,
      stale,
      tier
    };
  });
  rows.sort((x, y) =>
    x.tier - y.tier
    || (x.distance_m ?? 0) - (y.distance_m ?? 0)
    || (x.open_cases || 0) - (y.open_cases || 0)
    || String(x.name).localeCompare(String(y.name)));
  return rows;
}

// The officer the system would send: the closest one who is on duty with a recent position.
export function pickNearest(ranked) {
  return ranked.find((o) => o.tier === 0) || null;
}
