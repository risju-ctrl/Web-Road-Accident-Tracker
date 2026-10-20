# Web Road Accident Reporting System

IT 305 Advance Web Development, Project 3. Express + Postgres (Supabase) API with a React (Vite) web client.

## Setup

The database is Postgres on Supabase. The schema and the migrated rows already live in that
project, so there is nothing to load locally.

1. Copy `.env.example` to `.env` and fill it in. `DATABASE_URL` is the connection string from
   the Supabase dashboard under **Connect** — use the session pooler on port 5432, not the
   transaction pooler on 6543. `JWT_SECRET` is required (32+ characters); the server will not
   start without it. Also set the three `SEED_*_PASSWORD` values.
2. Install and seed demo accounts, then start the API:
   ```
   npm install
   npm run seed
   npm run dev
   ```
3. Start the client (separate terminal):
   ```
   cd client
   npm install
   npm run dev
   ```
   Add `client/.env` with your Mapbox public token if you use the Mapbox map (see `client/src/components/MapView.jsx`).

Demo accounts: `admin@local.test`, `officer@local.test`, `reporter@local.test` (passwords are whatever you set in `.env`).

## Database migration for duplicate detection and nearest officer

Run `database/migrations/004_duplicates_and_officer_location.sql` once in the Supabase SQL editor
(it is safe to run again). It adds `reports.duplicate_of` and the officer location columns
(`users.latitude`, `longitude`, `location_updated_at`, `on_duty`). The API will not work until it has run.

## Duplicate reports

When a report is submitted, the server looks for a report about the same accident: same
accident time (within `DUPLICATE_WINDOW_MIN`, default 120 min) and the same place (within
`DUPLICATE_RADIUS_M`, default 200 m when both have a map position, otherwise the same typed
location). Rejected reports and reports that are already duplicates are ignored.

- The reporter's own earlier report: blocked (`409 DUPLICATE_OWN_REPORT`). Edit that report instead.
- Someone else's report: the form shows the match (`409 POSSIBLE_DUPLICATE`). The reporter either
  sends `duplicate_of: <id>` (same accident, the report is saved and linked to the original) or
  `confirm_distinct: true` (different accident, saved normally).
- Admins see the link on both reports and can reject the duplicate with a reason.

## Nearest officer

Officers use the **On duty** switch in the toolbar. While it is on, their browser shares its position
(needs https or localhost, and the officer must allow location). When an admin clicks **Assign officer**,
`GET /api/reports/:id/nearest-officers` ranks officers by distance to the report, preselects the nearest
on-duty officer with a recent position, and shows distance and open cases. The admin can still pick anyone;
choosing someone other than the nearest is recorded in the audit log (`was_nearest`, `distance_m`).
Reports without a map position cannot be ranked by distance, so officers are listed by fewest open cases.

## Going back to MySQL

The local MySQL database is still installed and still holds its own copy of the data. It is no
longer reachable by changing `.env` alone, because `config/db.js` now talks Postgres: revert
the commit that ported the app, run `npm install mysql2`, and point the `DB_*` values in `.env`
at it again.

## Tests

`npm test` (status workflow rules and upload type detection).

## Roles

| Role | Can do |
| --- | --- |
| Reporter | Submit and edit own reports (until review), attach photos, track status, notifications |
| Traffic officer | See assigned reports, update investigation status, add findings and evidence |
| Admin | Review and verify, assign officers, manage users and categories, dashboard, audit log, CSV/PDF export |

Report statuses: submitted, under_review, needs_clarification, verified, assigned, in_progress, resolved, rejected. Transitions are enforced in `utils/helpers.js`.

## API summary

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` |
| Reports | `GET/POST /api/reports`, `GET/PATCH /api/reports/:id`, `POST /api/reports/:id/evidence`, `GET /api/reports/:id/evidence/:evidenceId` |
| Report list filters | `status`, `date_from`, `date_to`, `category_id`, `location`, `q` |
| Admin | `PATCH /api/reports/:id/verify`, `GET /api/reports/:id/nearest-officers`, `/api/users`, `/api/audit-logs`, `/api/dashboard` |
| Officer | `/api/traffic-officer/reports`, `PATCH .../:id/status`, `POST .../:id/findings`, `GET/PUT /api/traffic-officer/location` |
| Summaries | `/api/summaries/dashboard/stats`, `/reports/summaries?period=daily|weekly|monthly|annual`, `/reports/export?format=csv|pdf` |

Evidence uploads accept JPG, PNG, WebP and PDF up to 10 MB; the type is checked from the file contents.
