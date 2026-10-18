// Pure helpers for the map's replay, insights and danger warnings. Nothing here
// touches React or the DOM except downloadCsv, so the logic stays easy to check.

export const DAY = 24 * 3600e3;

export function startOfDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function parseDate(value) {
  if (!value) return null;

  // A bare YYYY-MM-DD is read as a local calendar day, not as UTC midnight, so it
  // cannot slip into the neighbouring day in some time zones.
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

// When the accident happened, not when it was reported. accident_date and
// accident_time are what the reporter entered; created_at is the fallback for rows
// that have no usable date. `timed` says whether a time of day is really known.
export function occurredAt(report) {
  const day = parseDate(report.accident_date);

  if (day) {
    const local = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const match = /^(\d{1,2}):(\d{2})/.exec(String(report.accident_time || ''));

    if (match) {
      local.setHours(Number(match[1]), Number(match[2]));
      return { ms: local.getTime(), timed: true };
    }

    return { ms: local.getTime(), timed: false };
  }

  const created = parseDate(report.created_at);
  return { ms: created ? created.getTime() : NaN, timed: false };
}

// ---------- Road names ----------

// Reports store free-text locations, so the road is the first part before a comma
// with any leading house number removed. It is a best guess, which is why the
// ranking shows the name as typed rather than pretending to match real roads.
export function roadOf(location) {
  const text = String(location || '').trim();
  const first = text.split(',')[0].trim();
  const label = first.replace(/^\d+[\w-]*\s+/, '').replace(/\s+/g, ' ').trim() || text || 'Unknown location';
  const key = label.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim() || 'unknown';
  return { key, label };
}

// ---------- Periods and tallies ----------

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SEV_ORDER = ['fatal', 'major', 'moderate', 'minor'];

export const INSIGHT_PERIODS = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: Infinity }
];

// Splits reports into the chosen window and the equally long window before it.
// `when` maps a report id to its occurrence time.
export function splitPeriods(reports, when, anchorMs, days) {
  const current = [];
  const previous = [];

  reports.forEach(report => {
    const t = when.get(report.id)?.ms;
    if (!Number.isFinite(t) || t > anchorMs) return;

    if (days === Infinity) {
      current.push(report);
    } else if (t > anchorMs - days * DAY) {
      current.push(report);
    } else if (t > anchorMs - 2 * days * DAY) {
      previous.push(report);
    }
  });

  return { current, previous };
}

export function weekdayCounts(reports, when) {
  const out = Array(7).fill(0);

  reports.forEach(report => {
    const t = when.get(report.id)?.ms;
    if (Number.isFinite(t)) out[(new Date(t).getDay() + 6) % 7] += 1;
  });

  return out;
}

// Only reports with a real time of day count here, so a date-only report is not
// quietly filed under midnight.
export function hourCounts(reports, when) {
  const out = Array(24).fill(0);
  let timed = 0;

  reports.forEach(report => {
    const stamp = when.get(report.id);
    if (!stamp || !stamp.timed || !Number.isFinite(stamp.ms)) return;
    out[new Date(stamp.ms).getHours()] += 1;
    timed += 1;
  });

  return { counts: out, timed };
}

export function roadRanking(current, previous, when, limit = 8) {
  const rows = new Map();

  const touch = report => {
    const road = roadOf(report.location);
    if (!rows.has(road.key)) {
      rows.set(road.key, { key: road.key, label: road.label, now: 0, before: 0, worst: 'unknown', latest: null, latestMs: -Infinity });
    }
    return rows.get(road.key);
  };

  current.forEach(report => {
    const row = touch(report);
    row.now += 1;

    const sev = report.severity || 'unknown';
    const rank = value => (SEV_ORDER.indexOf(value) === -1 ? 99 : SEV_ORDER.indexOf(value));
    if (rank(sev) < rank(row.worst)) row.worst = sev;

    const t = when.get(report.id)?.ms ?? -Infinity;
    if (t >= row.latestMs) {
      row.latestMs = t;
      row.latest = report;
    }
  });

  previous.forEach(report => { touch(report).before += 1; });

  return [...rows.values()]
    .filter(row => row.now > 0)
    .sort((a, b) => b.now - a.now || b.latestMs - a.latestMs)
    .slice(0, limit);
}

// "+25%" style change. Returns null when there is nothing to compare against.
export function changeLabel(now, before) {
  if (before === 0) return now > 0 ? 'new' : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

// ---------- Geometry for danger warnings ----------

// Distance in km from a point to a polyline of [lat, lng] pairs, plus the index of
// the closest segment. A flat local projection is accurate enough at city scale.
export function distanceToPath(lat, lng, path) {
  if (!path || path.length === 0) return { km: Infinity, at: -1 };

  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const px = lng * kx;
  const py = lat * ky;

  let best = Infinity;
  let at = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const ax = Number(path[i][1]) * kx;
    const ay = Number(path[i][0]) * ky;
    const bx = Number(path[i + 1][1]) * kx;
    const by = Number(path[i + 1][0]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const dist = Math.hypot(px - (ax + u * dx), py - (ay + u * dy));

    if (dist < best) {
      best = dist;
      at = i;
    }
  }

  if (path.length === 1) {
    best = Math.hypot(px - Number(path[0][1]) * kx, py - Number(path[0][0]) * ky);
  }

  return { km: best, at };
}

// Danger zones a route passes through, in the order the route meets them.
// A zone counts when the road comes within its radius plus a small margin.
export function zonesOnRoute(path, zones, marginKm = 0.05) {
  if (!path || path.length < 2) return [];

  return zones
    .map(item => ({ zone: item, ...distanceToPath(item.lat, item.lng, path) }))
    .filter(hit => hit.km <= hit.zone.radiusM / 1000 + marginKm)
    .sort((a, b) => a.at - b.at)
    .map(hit => hit.zone);
}

// ---------- CSV ----------

// Report text is typed by users, so a cell that starts with = + - or @ would be run
// as a formula by Excel. A leading apostrophe keeps it as plain text.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);

  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  // The byte-order mark makes Excel read the file as UTF-8.
  return `﻿${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dayLabel(ms, withYear = true) {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {})
  });
}

export function isoDay(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
