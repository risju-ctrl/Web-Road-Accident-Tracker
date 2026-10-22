-- Postgres (Supabase). Run once in the Supabase SQL editor. Safe to re-run.
--
-- migrations/003_report_indexes.sql was written for MySQL; Postgres does NOT create
-- indexes for foreign keys by itself, so unless these were added by hand every filter,
-- join and "my reports / my notifications" lookup below is a full table scan.
-- Check what already exists with:
--   select tablename, indexname from pg_indexes where schemaname = 'public' order by 1, 2;

-- reports: the list/filter/dashboard/map queries
CREATE INDEX IF NOT EXISTS idx_reports_created        ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter       ON reports (reporter_id, created_at DESC);   -- reporter's own list
CREATE INDEX IF NOT EXISTS idx_reports_assigned       ON reports (assigned_to, created_at DESC);   -- officer's list, open_cases
CREATE INDEX IF NOT EXISTS idx_reports_category       ON reports (accident_category_id);
CREATE INDEX IF NOT EXISTS idx_reports_accident_date  ON reports (accident_date);                  -- duplicate check
CREATE INDEX IF NOT EXISTS idx_reports_duplicate_of   ON reports (duplicate_of);
CREATE INDEX IF NOT EXISTS idx_reports_verified_by    ON reports (verified_by);

-- report detail page: one lookup per table
CREATE INDEX IF NOT EXISTS idx_evidence_report        ON report_evidence (report_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploader      ON report_evidence (uploader_id);
CREATE INDEX IF NOT EXISTS idx_history_report         ON report_status_history (report_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_changed_by     ON report_status_history (changed_by);

-- notifications: polled every 30 s by every signed-in browser
CREATE INDEX IF NOT EXISTS idx_notif_user_created     ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread      ON notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_report           ON notifications (report_id);

-- audit log page
CREATE INDEX IF NOT EXISTS idx_audit_created          ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user             ON audit_logs (user_id);

ANALYZE;
