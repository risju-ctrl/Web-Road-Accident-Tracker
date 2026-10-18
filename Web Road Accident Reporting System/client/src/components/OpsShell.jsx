import { useEffect, useState } from 'react';
import api from '../services/api';

// The stacked tabs are the map tab's command centre carried over to pages that
// scroll, so they open with the same read-out the map's sidebar opens with.
// The counting rules live here once: a figure on the dashboard, on the reports
// list and on the map all come from the same place.

export function severityKey(report) {
  return report.severity || 'unknown';
}

export function timeAgo(value) {
  if (!value) return 'time unknown';

  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'time unknown';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}

export function summarize(reports) {
  const located = reports.filter(r => r.latitude && r.longitude);
  const counts = { fatal: 0, major: 0, moderate: 0, minor: 0, unknown: 0 };
  located.forEach(r => { counts[severityKey(r)] += 1; });

  return {
    total: reports.length,
    mapped: located.length,
    pending: reports.filter(r => r.status === 'submitted' || r.status === 'under_review').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    critical: counts.fatal + counts.major,
    counts,
    latestCritical: located
      .filter(r => r.severity === 'fatal' || r.severity === 'major')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null
  };
}

// One request per tab serves both the strip and the tiles below it. The list is
// returned as well, because the dashboard's five most recent reports are the
// same rows.
export function useOpsSituation() {
  const [state, setState] = useState({ loading: true, error: '', reports: [], summary: null });

  useEffect(() => {
    let alive = true;

    api.get('/reports')
      .then(res => {
        const reports = Array.isArray(res.data) ? res.data : [];
        if (alive) setState({ loading: false, error: '', reports, summary: summarize(reports) });
      })
      .catch(() => {
        if (alive) {
          setState({
            loading: false,
            error: 'Reports could not be loaded. Check that the API is running.',
            reports: [],
            summary: null
          });
        }
      });

    return () => { alive = false; };
  }, []);

  return state;
}

// The one-line situation, worded exactly as the map's alert bar words it.
// While the figures are still being read it stays neutral rather than claiming
// an all-clear.
export function OpsStrip({ loading, error, summary }) {
  const critical = summary ? summary.critical : 0;
  const tone = loading || error ? 'is-neutral' : critical > 0 ? 'is-critical' : 'is-clear';

  return (
    <div className={`ops-alert ops-strip ${tone}`} role="status">
      <span className="ops-alert-icon" aria-hidden="true">!</span>

      {loading ? (
        <strong>Reading the current situation...</strong>
      ) : error ? (
        <strong>{error}</strong>
      ) : critical > 0 ? (
        <>
          <strong>
            {critical} major or fatal accident {critical === 1 ? 'report' : 'reports'}
          </strong>
          {summary.latestCritical && (
            <span className="ops-alert-detail">
              Most recent: {summary.latestCritical.report_reference} at {summary.latestCritical.location},{' '}
              {timeAgo(summary.latestCritical.created_at)}
            </span>
          )}
          {critical > 1 && <span className="ops-alert-more">+{critical - 1} more</span>}
        </>
      ) : (
        <>
          <strong>No major or fatal accidents on record</strong>
          <span className="ops-alert-detail">
            {summary.pending} {summary.pending === 1 ? 'report' : 'reports'} awaiting review
          </span>
        </>
      )}
    </div>
  );
}

export function OpsTiles({ summary }) {
  const tiles = [
    ['Visible to you', summary?.total],
    ['Awaiting review', summary?.pending],
    ['Mapped', summary?.mapped],
    ['Resolved', summary?.resolved]
  ];

  return (
    <div className="ops-tiles">
      {tiles.map(([label, value]) => (
        <div className="ops-tile" key={label}>
          <span className="ops-tile-value numeric">{summary ? value : '—'}</span>
          <span className="ops-tile-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function OpsHeader({ title, subtitle, children }) {
  return (
    <header className="ops-hd">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="ops-hd-actions">{children}</div>}
    </header>
  );
}

export function OpsPanel({ title, actions, children }) {
  return (
    <section className="ops-panel">
      {(title || actions) && (
        <div className="ops-panel-head">
          {title && <h2 className="ops-sec-title">{title}</h2>}
          {actions && <div className="ops-hd-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
