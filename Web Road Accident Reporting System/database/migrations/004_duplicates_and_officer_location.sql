-- Postgres (Supabase). Run once in the Supabase SQL editor. Safe to re-run.
--
-- 1. Duplicate reports: a report that describes an accident someone else already
--    reported is linked to the original instead of standing on its own.
-- 2. Nearest officer: officers share a location (and an on-duty switch) so the admin
--    can be shown who is closest to a report.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS duplicate_of integer REFERENCES reports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_duplicate_of ON reports (duplicate_of);
-- The duplicate check looks reports up by accident date first.
CREATE INDEX IF NOT EXISTS idx_reports_accident_date ON reports (accident_date);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_duty boolean NOT NULL DEFAULT true;
