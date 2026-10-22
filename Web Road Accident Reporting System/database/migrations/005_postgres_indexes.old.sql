-- Postgres (Supabase) indexes. Migration 003 was written for MySQL and the Postgres schema
-- created in Supabase does not add indexes on foreign keys on its own, so every filter, join
-- and sort below was a full table scan. Safe to run more than once. Run it in the Supabase
-- SQL Editor.
CREATE INDEX IF NOT EXISTS idx_reports_status        ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_created       ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_accident_date ON reports (accident_date);
CREATE INDEX IF NOT EXISTS idx_reports_reporter      ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_assigned      ON reports (assigned_to);
CREATE INDEX IF NOT EXISTS idx_reports_category      ON reports (accident_category_id);
CREATE INDEX IF NOT EXISTS idx_reports_duplicate_of  ON reports (duplicate_of);
CREATE INDEX IF NOT EXISTS idx_reports_dup_lookup    ON reports (accident_date) WHERE duplicate_of IS NULL AND status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_status_history_report ON report_status_history (report_id);
CREATE INDEX IF NOT EXISTS idx_audit_created         ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_evidence_report       ON report_evidence (report_id);

ANALYZE;
