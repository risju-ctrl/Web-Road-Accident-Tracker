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
| Admin | `PATCH /api/reports/:id/verify`, `/api/users`, `/api/audit-logs`, `/api/dashboard` |
| Officer | `/api/traffic-officer/reports`, `PATCH .../:id/status`, `POST .../:id/findings` |
| Summaries | `/api/summaries/dashboard/stats`, `/reports/summaries?period=daily|weekly|monthly|annual`, `/reports/export?format=csv|pdf` |

Evidence uploads accept JPG, PNG, WebP and PDF up to 10 MB; the type is checked from the file contents.
