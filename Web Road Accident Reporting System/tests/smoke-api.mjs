// Read-only API smoke harness. It starts the app against whatever database .env
// currently points at, replays one fixed set of requests, and either records the
// responses or compares them with a recorded baseline.
//
//   node tests/smoke-api.mjs record    # write tests/baseline-mysql.json
//   node tests/smoke-api.mjs compare   # re-play and diff against the baseline
//
// Only one POST is used per account (sign-in) and every other request is a GET, so
// running it never changes data. Account passwords come from the SEED_* variables
// in .env. Three sign-ins are far below the 20-per-15-minute auth rate limit, so the
// two runs this is normally used for are safe; a tight loop of runs is not.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(APP_DIR, 'tests', 'baseline-mysql.json');
const PORT = process.env.SMOKE_PORT || '5099';
const BASE_URL = `http://localhost:${PORT}`;

dotenv.config({ path: path.join(APP_DIR, '.env') });

// Date-only columns: mysql2 returns DATE as local midnight, node-postgres as UTC
// midnight, so the same calendar day serialises as 2026-10-14T16:00:00.000Z and
// 2026-10-15T00:00:00.000Z. Compare those as the server's local calendar day.
const DATE_ONLY_KEYS = ['accident_date'];
// Boolean columns: MySQL returns 1/0, Postgres true/false. Compared as 1/0.
const BOOL_KEYS = ['is_active', 'is_read'];

const ACCOUNTS = [
  ['admin', 'admin@local.test', process.env.SEED_ADMIN_PASSWORD],
  ['officer', 'officer@local.test', process.env.SEED_OFFICER_PASSWORD],
  ['reporter', 'reporter@local.test', process.env.SEED_REPORTER_PASSWORD]
];

const PLAN = [
  ['admin', '/api/summaries/dashboard/summary'],
  ['admin', '/api/summaries/dashboard/stats?year=2026'],
  ['admin', '/api/summaries/dashboard/map'],
  ['admin', '/api/summaries/reports/summaries'],
  ['admin', '/api/summaries/reports/export?format=csv'],
  ['admin', '/api/dashboard'],
  ['admin', '/api/users'],
  ['admin', '/api/users?role=traffic_officer&is_active=1'],
  ['admin', '/api/audit-logs'],
  ['admin', '/api/accident-categories'],
  ['admin', '/api/reports'],
  ['admin', '/api/reports?status=resolved&q=RA-2026'],
  ['admin', '/api/reports/1'],
  ['admin', '/api/reports/5'],
  ['admin', '/api/reports/5/status-history'],
  ['admin', '/api/reports/3/evidence/1'],
  ['reporter', '/api/reports'],
  ['reporter', '/api/reports/2'],
  ['officer', '/api/reports/2'],
  ['officer', '/api/traffic-officer/reports'],
  ['reporter', '/api/notifications'],
  ['reporter', '/api/notifications/unread-count'],
  ['reporter', '/api/notifications?unread=1&page=2&limit=5']
];

async function waitForHealth(child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}\n${child.stderrText}`);
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not become healthy in 30s\n${child.stderrText}`);
}

async function get(url, token) {
  const res = await fetch(`${BASE_URL}${url}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  // The evidence route streams the file from disk, not from the database, so only its
  // status is recorded. The status still proves the database-backed authorization ran.
  if (/\/evidence\/\d+$/.test(url)) body = null;
  return { url, status: res.status, body };
}

async function collect() {
  const tokens = {};
  const out = [];
  for (const [role, email, password] of ACCOUNTS) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (body && typeof body === 'object' && body.token) {
      tokens[role] = body.token;
      // Never write a signed token into the recorded baseline.
      body = { ...body, token: '<redacted>' };
    }
    out.push({ url: `POST /api/auth/login ${email}`, status: res.status, body });
  }
  for (const [role, url] of PLAN) out.push(await get(url, tokens[role]));
  return out;
}

// The CSV export renders the accident_date column through a JS Date's toString(),
// which differs between drivers by time of day. Comparing the scope line, the header
// and the set of report references still proves the same rows came back.
function csvSummary(text) {
  if (typeof text !== 'string') return text;
  const lines = text.split('\n');
  return { scope: lines[0], header: lines[1], refs: lines.slice(2).map((l) => l.split(',')[0]).filter(Boolean).sort() };
}

const normalise = (entry) => (entry.url.includes('format=csv') ? { ...entry, body: csvSummary(entry.body) } : entry);

function localDay(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-CA');
}

// Returns a human-readable difference, or null when the two values count as equal.
const hasId = (row) => Boolean(row) && typeof row === 'object' && !Array.isArray(row) && 'id' in row;
const byId = (a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0);

function difference(path, a, b) {
  const key = path.slice(path.lastIndexOf('.') + 1).replace(/\[\d+\]$/, '');
  if (a === b) return null;
  if (a === null || b === null || a === undefined || b === undefined) {
    return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    if (!BOOL_KEYS.includes(key)) return `${path}: boolean ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
    return Number(a) === Number(b) ? null : `${path}: boolean ${a} vs ${b}`;
  }
  if (DATE_ONLY_KEYS.includes(key) && typeof a === 'string' && typeof b === 'string') {
    return localDay(a) === localDay(b) ? null : `${path}: date-only ${localDay(a)} vs ${localDay(b)}`;
  }
  if (typeof a !== typeof b) return `${path}: type ${typeof a} vs ${typeof b} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: array length ${a.length} vs ${b.length}`;
    // Two rows can share a sort key (report 2 has two status changes in the same
    // second), and ties have no guaranteed order, so arrays of records with ids are
    // compared by id instead of by position.
    const [x, y] = a.every(hasId) && b.every(hasId)
      ? [[...a].sort(byId), [...b].sort(byId)]
      : [a, b];
    for (let i = 0; i < a.length; i++) {
      const d = difference(`${path}[${i}]`, x[i], y[i]);
      if (d) return d;
    }
    return null;
  }
  if (typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = difference(path ? `${path}.${k}` : k, a[k], b[k]);
      if (d) return d;
    }
    return null;
  }
  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

function compareAll(baseline, fresh) {
  if (baseline.length !== fresh.length) return `recorded ${baseline.length} responses, replayed ${fresh.length}`;
  for (let i = 0; i < baseline.length; i++) {
    const b = normalise(baseline[i]);
    const f = normalise(fresh[i]);
    if (b.url !== f.url) return `response ${i} is for ${f.url}, baseline has ${b.url}`;
    if (b.status !== f.status) return `${b.url}: status ${b.status} vs ${f.status}`;
    if (b.body === null || f.body === null) continue;
    const d = difference(b.url, b.body, f.body);
    if (d) return d;
  }
  return null;
}

async function main() {
  const mode = process.argv[2];
  if (!['record', 'compare'].includes(mode)) {
    console.error('usage: node tests/smoke-api.mjs record|compare');
    process.exit(2);
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: APP_DIR,
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderrText = '';
  child.stderr.on('data', (d) => { child.stderrText += d.toString(); });
  child.stdout.on('data', () => {});

  let code = 0;
  try {
    await waitForHealth(child);
    const fresh = await collect();

    if (mode === 'record') {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(fresh, null, 2)}\n`);
      const notOk = fresh.filter((r) => r.status !== 200 && !r.url.startsWith('POST'));
      console.log(`recorded ${fresh.length} responses to ${BASELINE_PATH}`);
      if (notOk.length) console.log(`warning: ${notOk.length} non-200 response(s):\n${notOk.map((r) => `  ${r.status} ${r.url}`).join('\n')}`);
      console.log(`logins: ${fresh.slice(0, 3).map((r) => `${r.status} ${r.url.split(' ').pop()}`).join(', ')}`);
    } else {
      if (!existsSync(BASELINE_PATH)) {
        console.error('FAIL — no baseline found. Run: node tests/smoke-api.mjs record');
        code = 1;
        return;
      }
      const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
      const diff = compareAll(baseline, fresh);
      if (diff) {
        console.error(`FAIL — first difference:\n  ${diff}`);
        code = 1;
      } else {
        console.log(`PASS — ${fresh.length}/${fresh.length} responses match ${path.basename(BASELINE_PATH)}`);
      }
    }
  } catch (err) {
    console.error(`FAIL — ${err.message}`);
    code = 1;
  } finally {
    child.kill();
  }
  process.exit(code);
}

main();
