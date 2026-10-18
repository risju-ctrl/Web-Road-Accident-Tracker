-- Speeds up the list, filter, dashboard and map queries.
-- Run once. If an index already exists MySQL reports a duplicate-key-name error; that is safe to ignore.
CREATE INDEX idx_reports_status ON reports (status);
CREATE INDEX idx_reports_created ON reports (created_at);
CREATE INDEX idx_reports_accident_date ON reports (accident_date);
CREATE INDEX idx_reports_reporter ON reports (reporter_id);
CREATE INDEX idx_reports_assigned ON reports (assigned_to);
CREATE INDEX idx_reports_category ON reports (accident_category_id);
CREATE INDEX idx_reports_coords ON reports (latitude, longitude);
CREATE INDEX idx_status_history_report ON report_status_history (report_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);
