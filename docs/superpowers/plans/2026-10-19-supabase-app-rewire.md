# Supabase App Rewire (MySQL → Supabase Postgres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the running application read and write the Supabase Postgres database instead of local MySQL, with no change to API responses that the React client already depends on.

**Architecture:** Keep the app's existing data layer (raw SQL in `models/` + `routes/`, `pool.query(sql, params)` returning `[rows, fields]`) and replace only the driver. `config/db.js` becomes a thin `pg`-backed adapter that preserves the mysql2 contract: `?` placeholders become `$n`, inserts gain `returning id`, `insertId`/`affectedRows` are synthesised, and MySQL error codes are mapped from Postgres SQLSTATE. The handful of genuinely MySQL-only SQL expressions are rewritten in place. Nothing else in the app changes: no ORM, no query builder, no new layers.

**Tech Stack:** Node 20 ESM, Express 4, `pg` (node-postgres) as the only new dependency, Supabase Postgres 15 (session pooler), `node --test` for tests.

**Spec:** `Web Road Accident Reporting System/PRODUCT.md` (line 19 currently says "a real API + MySQL database" and must be updated by Task 5).

## Global Constraints

- Exactly one new dependency: `pg`. Do not add `supabase-js`, an ORM, or a query builder.
- Do not edit `.env` (owner-managed, contains secrets). Only `.env.example` may be edited.
- MySQL stays installed and its data untouched, so it remains the rollback path. Do not run `mysql2` removal or destructive SQL in this plan.
- Keep the mysql2 call-site contract: `const [rows] = await pool.query(sql, params)` and `const [result] = await pool.query(sql, params)` with `result.insertId` / `result.affectedRows`.
- Every query parameter stays a bound parameter. Never interpolate values into SQL.
- API response bodies must stay compatible with `client/src` (`is_active` / `is_read` are consumed by truthiness, so `true|false` and `1|0` both render correctly; numbers must not become numeric strings).
- Postgres connection: session pooler (port 5432) or direct, never the transaction pooler (6543) — the app uses unnamed prepared statements.
- Work in the "Web Road Accident Reporting System" folder. Commands below run from that folder.

## Review Focus

- **Client-sent `is_active: 0|1`** (`client/src/pages/AdminUsers.jsx:106,136`, `client/src/pages/ReportDetail.jsx:102`) must still filter/toggle. Postgres rejects `0` for `boolean` with `invalid input syntax for type boolean`, so the boundary must coerce.
- **`COUNT(*)` and `SUM(...)`** are `bigint`/`numeric` in Postgres and node-postgres returns them as **strings**. Un-cast aggregates put `"5"` where the client shows a number, breaking the dashboard charts and notification badges.
- **Migrated timestamps are 8 hours off as instants.** MySQL's session time zone is `SYSTEM` = UTC+8 (verified: `NOW()` 2026-10-19 01:45:27 vs `UTC_TIMESTAMP()` 2026-10-18 17:45:27; machine `Singapore Standard Time`). The data migration copied local wall-clock strings into `timestamptz` as if they were UTC, so every displayed time would jump 8 hours forward.
- **Duplicate `report_reference` under concurrency** (`models/Report.js:70` retries on `ER_DUP_ENTRY`) must keep working, now arriving as SQLSTATE `23505`.
- **Empty and boundary result sets**: `[[{ total }]]` double-destructuring (`models/AuditLog.js:13`, `models/Notification.js:22,38`) assumes mysql2's `[rows, fields]` envelope, and `LIMIT ? OFFSET ?` (`models/Notification.js:19`, `models/AuditLog.js:10`) receives numbers from query strings.
- **`updated_at` on a no-op update**: MySQL's `ON UPDATE CURRENT_TIMESTAMP` leaves the column alone when nothing changed; the Supabase trigger fires on any `UPDATE` statement. So a PATCH that changes no values now bumps `updated_at`. Harmless for the app, but it is a real difference, and Task 4's hand-written write test should confirm the client does not display `updated_at` as "last activity".

---

### Task 1: Re-anchor migrated timestamps in Supabase

**Files:** none (database-only change via Supabase MCP `execute_sql`).

**Interfaces:**
- Consumes: the 2026-10-19 data migration already in Supabase (7 tables, 171 rows).
- Produces: `timestamptz` columns holding the true instants, so Task 4's smoke comparison matches the MySQL baseline.

Affected columns (all `timestamptz`): `users.created_at`, `users.updated_at`, `accident_categories.created_at`, `reports.created_at`, `reports.updated_at`, `reports.verified_at`, `report_evidence.uploaded_at`, `report_status_history.changed_at`, `notifications.created_at`, `notifications.read_at`, `audit_logs.created_at`.

- [ ] **Step 1: Record the wrong value first**

Run via MCP `execute_sql`:

```sql
select id, created_at from audit_logs where id = 75;
```

Expected: `2026-10-19 00:25:03+00` — the local wall clock, stored as UTC. This is the value being corrected.

- [ ] **Step 2: Re-anchor every timestamp column from local (+08) to a real instant**

**Trap:** `users` and `reports` carry a `BEFORE UPDATE` trigger (`users_updated_at`, `reports_updated_at` → `set_updated_at()`) that overwrites `updated_at` with `now()` on any UPDATE, which destroys the re-anchored `updated_at` values. Drop both triggers first, restore `updated_at` afterwards from the MySQL truth (values below), then recreate them.

Run via MCP `apply_migration` named `reanchor_timestamps_to_manila`. The `AT TIME ZONE 'UTC'` step makes the result independent of the session's time zone:

```sql
drop trigger users_updated_at on users;
drop trigger reports_updated_at on reports;

update users set created_at = created_at at time zone 'UTC' at time zone 'Asia/Manila',
                 updated_at = updated_at at time zone 'UTC' at time zone 'Asia/Manila';
update accident_categories set created_at = created_at at time zone 'UTC' at time zone 'Asia/Manila';
update reports set created_at = created_at at time zone 'UTC' at time zone 'Asia/Manila',
                   updated_at = updated_at at time zone 'UTC' at time zone 'Asia/Manila',
                   verified_at = verified_at at time zone 'UTC' at time zone 'Asia/Manila';
update report_evidence set uploaded_at = uploaded_at at time zone 'UTC' at time zone 'Asia/Manila';
update report_status_history set changed_at = changed_at at time zone 'UTC' at time zone 'Asia/Manila';
update notifications set created_at = created_at at time zone 'UTC' at time zone 'Asia/Manila',
                        read_at = read_at at time zone 'UTC' at time zone 'Asia/Manila';
update audit_logs set created_at = created_at at time zone 'UTC' at time zone 'Asia/Manila';

-- The trigger clobbered these; restore the MySQL wall-clock values as instants.
update users set updated_at = '2026-10-18 18:19:53' at time zone 'Asia/Manila';
update reports set updated_at = case id
  when 1 then '2026-10-15 15:44:59' at time zone 'Asia/Manila'
  when 2 then '2026-10-15 16:14:08' at time zone 'Asia/Manila'
  when 3 then '2026-10-15 21:35:58' at time zone 'Asia/Manila'
  when 4 then null
  when 5 then '2026-10-19 00:25:03' at time zone 'Asia/Manila'
end;

create trigger users_updated_at before update on users for each row execute function set_updated_at();
create trigger reports_updated_at before update on reports for each row execute function set_updated_at();
```

`NULL` values stay `NULL` (report 4's `verified_at` and `updated_at`).

- [ ] **Step 3: Verify the corrected instants**

```sql
select id, created_at from audit_logs where id = 75;
select id, is_read, read_at from notifications where is_read order by id;
select id, created_at, updated_at from users order by id;
select id, created_at, updated_at from reports order by id;
```

Expected: `audit_logs.id 75 → 2026-10-18 16:25:03+00` (00:25:03 on Oct 19, +08). `notifications` id 1 → `2026-10-15 13:39:00+00`, id 49 → `2026-10-18 16:16:03+00`. `users.created_at` → `2026-10-15 07:41:29+00`, `users.updated_at` → `2026-10-18 10:19:53+00`. `reports` 1 `updated_at` → `2026-10-15 07:44:59+00`, report 4 → both `NULL`, report 5 `updated_at` → `2026-10-18 16:25:03+00`. Report 4's `updated_at` being non-NULL means the trigger was not really dropped.

- [ ] **Step 4: Verify row counts are unchanged**

```sql
select (select count(*) from users) as u, (select count(*) from reports) as r,
       (select count(*) from notifications) as n, (select count(*) from audit_logs) as a;
```

Expected: `u 3, r 5, n 53, a 75`.

---

### Task 2: Capture the MySQL baseline through the API

**Files:**
- Create: `Web Road Accident Reporting System/tests/smoke-api.mjs`
- Create (generated): `Web Road Accident Reporting System/tests/baseline-mysql.json`

**Interfaces:**
- Consumes: the running app on MySQL (`config/db.js` still uses mysql2), `SEED_ADMIN_PASSWORD` / `SEED_OFFICER_PASSWORD` / `SEED_REPORTER_PASSWORD` from `.env`, and `GET /api/health` (`server.js:36`).
- Produces: `node tests/smoke-api.mjs record` writes the baseline file; `node tests/smoke-api.mjs compare` re-runs the same requests against whatever database the app is currently configured for and exits non-zero listing the first differing endpoint. Task 4 and Task 5 depend on both modes.

- [ ] **Step 1: Write the harness**

`tests/smoke-api.mjs` must: spawn `node server.js` with `PORT=5099` in its environment, poll `GET http://localhost:5099/api/health` until it returns `{status:'ok'}` (30 s timeout, then fail with the child's stderr); then issue exactly these requests in this order, using a fake IP so the rate limiter at `server.js:41` is not tripped by the 6 login calls; then kill the child on exit.

Read-only requests only — this harness must never write:

| Request | Token |
|---|---|
| `POST /api/auth/login {email, password}` for `admin@local.test`, `officer@local.test`, `reporter@local.test` | — |
| `GET /api/summaries/dashboard/summary` | admin |
| `GET /api/summaries/dashboard/stats?year=2026` | admin |
| `GET /api/summaries/dashboard/map` | admin |
| `GET /api/summaries/reports/summaries` | admin |
| `GET /api/summaries/reports/export?format=csv` | admin |
| `GET /api/dashboard` | admin |
| `GET /api/users` | admin |
| `GET /api/users?role=traffic_officer&is_active=1` | admin |
| `GET /api/audit-logs` | admin |
| `GET /api/accident-categories` | admin |
| `GET /api/reports` | admin |
| `GET /api/reports?status=resolved&q=RA-2026` | admin |
| `GET /api/reports/1` | admin |
| `GET /api/reports/5` | admin |
| `GET /api/reports/5/status-history` | admin |
| `GET /api/reports/3/evidence/1` | admin |
| `GET /api/reports` | reporter |
| `GET /api/reports/2` | reporter |
| `GET /api/reports/2` | officer |
| `GET /api/traffic-officer/reports` | officer |
| `GET /api/notifications` | reporter |
| `GET /api/notifications/unread-count` | reporter |
| `GET /api/notifications?unread=1&page=2&limit=5` | reporter |

Record for each: `{ url, status, body }`, where `body` is the parsed JSON (or the raw text for the CSV URL). A login that returns non-200 records `{ url, status, body }` rather than aborting, so a partial database still produces a usable baseline. Three details matter, all found while writing it:

- **The signed JWT must never be recorded.** Every login issues a unique token (`jwtid: randomUUID()`), so it differs on every run and would break the comparison — and the baseline is committed, so a real token would leak into git. Record it as `<redacted>` and keep it in memory only.
- **The evidence route streams the file from disk, not from the database**, so only its status is compared. The status still proves the database-backed authorization ran.
- **Arrays of records that carry an `id` are compared by id, not by position.** Report 2 has two status changes in the same second (`changed_at` 16:14:08), and ties in `ORDER BY sh.changed_at DESC` have no guaranteed order.

Comparison rule for `compare` mode (write it down as a comment, it is the reason the two drivers can agree):

- Values containing `T` (datetime fields: `created_at`, `updated_at`, `read_at`, `changed_at`, `uploaded_at`, `verified_at`) compare **exactly**, byte for byte. An 8-hour offset is a failure — this is what proves Task 1 worked.
- Values that are date-only (`accident_date`) compare as the server's local calendar day (`toLocaleDateString('en-CA')`), because mysql2 returns `DATE` as a local-midnight `Date` and node-postgres as a UTC-midnight `Date`, so the same calendar day serialises as `2026-10-14T16:00:00.000Z` and `2026-10-15T00:00:00.000Z` respectively. Comparing the first 10 characters would wrongly compare `2026-10-14` with `2026-10-15`.
- `true`/`false` compares equal to `1`/`0` for boolean columns only (`is_active`, `is_read`).
- The CSV export body is compared as its two header lines plus the sorted set of report references, because it renders `accident_date` through `Date.toString()`, which embeds the process time zone (`… GMT+0800 …` vs `… GMT+0000 …`). Same rows, different rendering.
- Everything else compares exactly: numbers must be numbers (not `"5"`), nulls must stay nulls, array lengths must match, and arrays without ids keep their order.

- [ ] **Step 2: Record the MySQL baseline**

Run: `node tests/smoke-api.mjs record`
Expected: exits 0, writes `tests/baseline-mysql.json`, and prints the request count (23).

- [ ] **Step 3: Sanity-check the baseline content**

Open the file and confirm the entries that prove the DB really answered: `/api/users` status 200 with 3 users each carrying `is_active: 1`; `/api/summaries/dashboard/summary` with `total: 5`; `/api/notifications/unread-count` with a number, not a string; `/api/summaries/dashboard/stats?year=2026` with numeric `kpis.submitted.value`. Confirm no field contains a JWT (`grep eyJ tests/baseline-mysql.json` must find nothing).

Then prove the harness can actually fail: back up the baseline, edit one recorded `status` to `999`, run `compare` (it must report that difference and exit 1), restore the backup and run `compare` again (it must pass). A harness that passes against a wrong baseline proves nothing.

Expected failure to fix here: if a login returns 403, the seed passwords in `.env` are wrong or the accounts are inactive — stop and ask the owner rather than changing the data.

- [ ] **Step 4: Commit**

```bash
git add "Web Road Accident Reporting System/tests/smoke-api.mjs" "Web Road Accident Reporting System/tests/baseline-mysql.json"
git commit -m "test: capture MySQL API baseline before the Supabase switch"
```

---

### Task 3: Swap the driver — `pg`-backed adapter in `config/db.js`

**Files:**
- Modify: `Web Road Accident Reporting System/package.json` (add `pg`)
- Modify: `Web Road Accident Reporting System/config/db.js` (the whole file)
- Modify: `Web Road Accident Reporting System/.env.example`
- Create: `Web Road Accident Reporting System/tests/db.adapter.test.js`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` (preferred) or `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.
- Produces: the default export stays the app's only database handle and must expose exactly:
  - `query(sql: string, params?: unknown[]) => Promise<[rows: object[] | { insertId: number|null, affectedRows: number }, fields: unknown[]]>` — selects resolve to the row array (mysql2 shape), inserts/updates/deletes resolve to a header object carrying `insertId` and `affectedRows`.
  - `end() => Promise<void>` (used by `database/seed.js:30`).
- Consumed by: all 11 existing `pool.query` call sites, unchanged.

- [ ] **Step 1: Write the failing adapter test**

`tests/db.adapter.test.js`, run with `node --test`. Skips itself with a printed notice when `DATABASE_URL` is unset (so `npm test` still works for the owner without Supabase credentials). Asserts:

```js
// 1. ? placeholders become $n and values bind in order
const [rows] = await pool.query('select ?::int + ?::int as sum', [2, 3]);
assert.equal(rows[0].sum, 5);

// 2. inserts expose insertId (RETURNING id) and the row is reachable
const [ins] = await pool.query('insert into accident_categories (name, description) values (?, ?)', ['zz-adapter-test', 'temp']);
assert.ok(Number.isInteger(ins.insertId) && ins.insertId > 0);
const [found] = await pool.query('select name from accident_categories where id = ?', [ins.insertId]);
assert.equal(found[0].name, 'zz-adapter-test');

// 3. updates report affectedRows, and 0 when nothing matched
const [upd] = await pool.query('update accident_categories set description = ? where id = ?', ['temp2', ins.insertId]);
assert.equal(upd.affectedRows, 1);
const [none] = await pool.query('update accident_categories set description = ? where id = ?', ['x', -1]);
assert.equal(none.affectedRows, 0);

// 4. unique violation arrives as the MySQL code the app already retries on
const dup = await pool.query('insert into users (name, email, password_hash, role) values (?, ?, ?, ?)', ['dup', 'admin@local.test', 'x', 'reporter'])
  .then(() => null, (err) => err);
assert.equal(dup.code, 'ER_DUP_ENTRY');

// 5. aggregates are strings unless cast — pins the rule Task 4 depends on
const [uncast] = await pool.query('select count(*) as total from users');
assert.equal(typeof uncast[0].total, 'string');
const [cast] = await pool.query('select count(*)::int as total from users');
assert.equal(typeof cast[0].total, 'number');

// 6. boolean columns come back as JS booleans
const [act] = await pool.query('select is_active from users where id = ?', [1]);
assert.equal(act[0].is_active, true);
assert.strictEqual((await pool.query('select is_active from users where id = ?', [1]))[0][0].is_active, true);

// 6. clean up the row this test created
await pool.query('delete from accident_categories where id = ?', [ins.insertId]);
```

Note: the test deliberately writes one row and deletes it (leaves an id gap in `accident_categories`) — that is the cheapest way to prove `insertId` and `affectedRows` against the real server.

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/db.adapter.test.js`
Expected: FAIL — `pg` is not installed / `pool.query` is not a function.

- [ ] **Step 3: Install `pg` and rewrite `config/db.js`**

Run: `npm install pg` (owner approval is part of accepting this plan).

`config/db.js` keeps `dotenv.config()` and the same default export, built like this:

- Connection: when `DATABASE_URL` is set use `{ connectionString: process.env.DATABASE_URL }`, otherwise `{ host, port: Number(DB_PORT)||5432, user, password, database }` with `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` defaults unchanged from the current file. Both forms add `ssl: { rejectUnauthorized: false }` (Supabase requires TLS) and `max: 10` (the old `connectionLimit`).
- `query(sql, params = [])`:
  1. Replace each `?` with `$1`, `$2`, … in order (a running counter, not a regex index — the module has no `??` identifier placeholders, so a plain sequential substitution is correct).
  2. If the statement starts with `insert` and contains no `returning`, append ` returning id`.
  3. `const result = await pool.query(text, params)`.
  4. Resolve `[result.command === 'SELECT' ? result.rows : { insertId: result.rows[0]?.id ?? null, affectedRows: result.rowCount }, result.fields]`.
  5. On error, translate SQLSTATE before rethrowing so existing handlers keep working: `23505 → ER_DUP_ENTRY` (`models/Report.js:70`, `middleware/errorHandler.js:13`), `23503 → ER_NO_REFERENCED_ROW_2` (`middleware/errorHandler.js:16`). One comment must say these codes are kept for the app's existing handlers.
- `end()` forwards to `pool.end()`.
- Do **not** register custom type parsers. node-postgres's defaults give `Date` objects for `date`/`timestamp`/`timestamptz` (serialised to ISO strings by Express) and strings for `numeric`/`bigint`/`time`, which is the shape the current client and the Task 2 baseline already expect.

- [ ] **Step 4: Document the connection in `.env.example`**

Add below the existing `DB_*` lines, so both local MySQL and Supabase are describable:

```
# Supabase (Postgres) connection. DATABASE_URL wins when set — copy it from
# Dashboard -> Connect (session pooler, port 5432, or direct). Never use the
# transaction pooler (6543) with this app.
DATABASE_URL=
DB_PORT=5432
```

- [ ] **Step 5: Point the app at Supabase (owner action)**

Ask the owner to set `DATABASE_URL` in `.env` to the session-pooler URI (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`) and to leave the `DB_*` lines in place for rollback. Do not create or edit `.env` yourself.

- [ ] **Step 6: Run the adapter test against Supabase, and the existing suite**

Run: `node --test tests/db.adapter.test.js`
Expected: all assertions PASS, exits 0. If it reports a TLS or `tenant/user not found` error, the connection string is the wrong pooler host or the password is wrong — fix `.env` with the owner, do not retry blindly.

Then run: `npm test`
Expected: PASS (`node --test tests/workflow.test.js` never touches the database).

- [ ] **Step 7: Commit**

```bash
git add "Web Road Accident Reporting System/config/db.js" "Web Road Accident Reporting System/package.json" "Web Road Accident Reporting System/package-lock.json" "Web Road Accident Reporting System/.env.example" "Web Road Accident Reporting System/tests/db.adapter.test.js"
git commit -m "feat: talk to Supabase Postgres through a mysql2-compatible pg adapter"
```

---

### Task 4: Postgres-dialect fixes and the API comparison

**Files:**
- Modify: `Web Road Accident Reporting System/middleware/auth.js:33,53`
- Modify: `Web Road Accident Reporting System/routes/admin.js:26-27,77,177`
- Modify: `Web Road Accident Reporting System/routes/auth.js:40`
- Modify: `Web Road Accident Reporting System/models/User.js:29-32`
- Modify: `Web Road Accident Reporting System/models/Notification.js:18,22,30,34,38`
- Modify: `Web Road Accident Reporting System/models/AuditLog.js:13`
- Modify: `Web Road Accident Reporting System/utils/helpers.js:8`
- Modify: `Web Road Accident Reporting System/routes/summaries.js:126,128,184-188,191-199`
- Modify: `Web Road Accident Reporting System/database/seed.js:24-26`

**Interfaces:**
- Consumes: the adapter from Task 3 and the baseline from Task 2.
- Produces: identical API responses on Supabase and MySQL. No signature changes anywhere; `is_active` becomes a real boolean through the API and `0|1` from old clients continues to be accepted.

- [ ] **Step 1: Booleans: `is_active` and `is_read`**

- `middleware/auth.js:33` → `if (!rows[0].is_active) {`; line 53 → `if (req.user && req.user.is_active) return next();`
- `routes/auth.js:40` → `if (!user.is_active) {`
- `routes/admin.js:26` → `const isActive = req.query.is_active === undefined ? undefined : Number(req.query.is_active) === 1;` (line 27 unchanged); line 77 → `update.is_active = Number(is_active) === 1;`; line 177 → `if (!officer || officer.role !== 'traffic_officer' || !officer.is_active) {`
- `models/User.js:29-32` unchanged — it already passes a truthy/undefined filter and must now receive a boolean (from the `routes/admin.js` change above). Keep it as is.
- `models/Notification.js`: line 18 → `' AND n.is_read = false'`; line 22 → `AND is_read = false` inside the conditional and `SELECT COUNT(*)::int as total`; line 30 → `SET is_read = true, read_at = NOW()`; line 34 → `SET is_read = true, read_at = NOW() ... AND is_read = false`; line 38 → `SELECT COUNT(*)::int as count`.

Rationale for the shape: the API keeps serving `true|false`, which the client consumes by truthiness (`AdminUsers.jsx:235`, `Notifications.jsx:161`), and the client's `0|1` input is coerced at the route boundary where it is parsed.

- [ ] **Step 2: Aggregates must stay numbers**

- `models/AuditLog.js:13` → `SELECT COUNT(*)::int as total FROM audit_logs`
- `routes/summaries.js:191` → `COUNT(*)::int as count`. Lines 192-199 stay **uncast**: MySQL already returned `SUM()` as a DECIMAL *string* (the recorded baseline has `"submitted":"1"`), so leaving Postgres's `bigint` as a string keeps the API byte-identical. `SUM` must *not* be cast — doing so silently changes the response type that `client/src/components/Charts.jsx:119` feeds straight to Recharts.

- [ ] **Step 3: MySQL-only SQL expressions**

- `utils/helpers.js:8` → `SELECT MAX(CAST(SUBSTRING(report_reference FROM ?) AS integer)) AS maxn FROM reports WHERE report_reference LIKE ?` (`SUBSTRING(x, n)` becomes `substring(x from n)`; `UNSIGNED` → `integer`).
- `routes/summaries.js` group-by switch (lines 183-188):
  - `daily` → `r.created_at::date`
  - `weekly` → `to_char(r.created_at, 'IYYY-IW')` (ISO week; MySQL `YEARWEEK` used a Sunday-start week, so week labels shift — flag this to the owner, it is a labelling change, not a data change)
  - `annual` → `EXTRACT(YEAR FROM r.created_at)::int`
  - default → `to_char(r.created_at, 'YYYY-MM')`
- `routes/summaries.js:128` → `SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS y FROM reports ORDER BY y DESC`
- `routes/summaries.js:248-249` → the two `!= "rejected"` / `= "rejected"` filters become single-quoted. **This one is a hard error, not a difference:** Postgres reads `"rejected"` as an identifier, so the export fails with `column "rejected" does not exist`. `reports.status` is `text` in Supabase, so nothing else about it needs to change.

**Step 3b: two differences the smokesheet cannot see**

- **`LIKE` is case-sensitive in Postgres and was case-insensitive in MySQL**, so every search driven by user input becomes `ILIKE`: `models/Report.js:174,176` (location filter, and the `q` search over reference/title/location) and `routes/summaries.js:93,247` (location filters). `utils/helpers.js:8` keeps `LIKE` — it matches a generated `RA-<year>-%` prefix whose case is fixed. Without this, searching `quezon` stops finding `Quezon City`, and no recorded baseline entry covers a lower-case search.
- Session time zone: `config/db.js` sets `set time zone 'Asia/Manila'` on every connection, because MySQL ran with `timezone=SYSTEM` (Asia/Manila) and the summaries group by day/week/month in SQL. Left at UTC, a report filed at 00:30 Manila time counts as the previous day (and the previous month on the 1st). No current row crosses a boundary, so the comparison cannot catch this — it must be set deliberately. (`EXTRACT` yields `numeric`, which node-postgres returns as a string, and line 131 hands `r.y` straight to the client's year picker).
- `routes/summaries.js:191-199` — no change beyond the `::int` casts from Step 2; `SUM(CASE WHEN …)` is portable.
- `database/seed.js:24-26` →

```sql
INSERT INTO users (name, email, password_hash, role, phone, is_active)
VALUES (?, ?, ?, ?, ?, true)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true
```

(`users.email` carries the UNIQUE constraint; MySQL's `VALUES(col)` has no Postgres equivalent, `EXCLUDED` does.)

- [ ] **Step 4: Run the comparison**

Run: `node tests/smoke-api.mjs compare`
Expected: `PASS — 23/23 responses match tests/baseline-mysql.json`.

If a response differs, read the diff rather than loosening the comparison rule from Task 2. `created_at` and friends must match exactly (Task 1 re-anchored them); aggregate fields must be numbers on both sides; boolean columns are the only `true|false` vs `1|0` tolerance.

- [ ] **Step 5: Exercise the write paths by hand (the harness is read-only)**

With the server running against Supabase: log in as the reporter, submit a report (expect `201`, a `RA-2026-0000NN` reference, and a `submitted` status), as admin verify it, as officer move it to `in_progress` then `resolved`, upload a small image as evidence, then mark a notification read.

Expected: every step returns 200/201; the report's `status_history` grows by one row per change; `notifications` gains rows; a duplicate reference is retried rather than surfacing as a 500. Then confirm in Supabase, and note that these test rows now exist in both databases.

- [ ] **Step 6: Run the existing test suite**

Run: `npm test`
Expected: PASS (the workflow test does not touch the database).

- [ ] **Step 7: Commit**

```bash
git add -A "Web Road Accident Reporting System"
git commit -m "fix: port MySQL-only SQL and boolean handling to Postgres"
```

---

### Task 5: Documentation and retiring the MySQL path

**Files:**
- Modify: `Web Road Accident Reporting System/PRODUCT.md:19`
- Modify: `Web Road Accident Reporting System/README.md` (setup and database sections)
- Modify: `Web Road Accident Reporting System/.env.example` (comment out or drop the `DB_*` block once the owner confirms)
- Modify: `Web Road Accident Reporting System/package.json` (remove `mysql2`, update the description)
- Modify: `docs/superpowers/plans/2026-10-19-supabase-app-rewire.md` (tick the boxes)

**Interfaces:** none.

This task is gated on the owner explicitly confirming, after Task 4, that the Supabase-backed app is the one they want to keep.

- [ ] **Step 1: Update the docs**

`PRODUCT.md:19` "a real API + MySQL database" → "a real API + Postgres (Supabase) database". `README.md`: replace the XAMPP/MySQL setup steps with the Supabase connection steps (`DATABASE_URL`, `npm install`, `npm run seed`, `npm run dev`) and add one line stating the rollback path (restore `DB_*` + `npm install mysql2`). `.env.example`: **done differently on purpose** — the `DB_*` block stays, because `config/db.js` still reads it as the fallback and it documents the rollback path; only the comment and `DB_PORT` were added.

- [ ] **Step 2: Remove the MySQL driver**

Run: `npm uninstall mysql2`
Expected: `package.json` no longer lists `mysql2`; `grep -rn "mysql2" "Web Road Accident Reporting System" --include=*.js` returns nothing.

- [ ] **Step 3: Confirm nothing regressed**

Run: `npm test` then `node tests/smoke-api.mjs compare`
Expected: both pass. Note that after Step 2 the MySQL baseline can no longer be reproduced without reinstalling mysql2 and restoring `.env` — which is exactly why the MySQL *data* is left untouched.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record the Supabase database switch and retire the MySQL driver"
```
