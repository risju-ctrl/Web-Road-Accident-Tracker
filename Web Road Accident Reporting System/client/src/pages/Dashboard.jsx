import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { timeAgo } from '../services/format';
import LiveOverview from './LiveOverview';

// The strip counts "awaiting review" the way the map's alert bar does, so the
// same phrase means the same states on both screens.
const REVIEW_PENDING = ['submitted', 'under_review'];

export default function Dashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Admins see the Roadwatch overview, so they need no report list here.
    if (user.role === 'admin') return;
    api.get('/reports')
      .then(res => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        console.error(err);
        setError('Reports could not be loaded. Check that the API is running.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (user.role === 'admin') return <LiveOverview />;

  const recent = rows.slice(0, 5);
  const pending = rows.filter(r => REVIEW_PENDING.includes(r.status)).length;
  const resolved = rows.filter(r => r.status === 'resolved').length;
  const criticalRows = rows.filter(r => r.severity === 'fatal' || r.severity === 'major');
  const critical = criticalRows.length;
  const latestCritical = [...criticalRows]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

  return (
    <div className="container">
      <div className="ops-doc">
        {loading ? (
          <div className="ops-alert ops-alert--boxed is-info" role="status">
            <span className="ops-alert-icon" aria-hidden="true">i</span>
            <strong>Loading the situation…</strong>
          </div>
        ) : error ? (
          <div className="ops-alert ops-alert--boxed" role="alert">
            <span className="ops-alert-icon" aria-hidden="true">!</span>
            <strong>{error}</strong>
          </div>
        ) : (
          <div
            className={`ops-alert ops-alert--boxed ${critical ? 'is-critical' : 'is-clear'}`}
            role="status"
          >
            <span className="ops-alert-icon" aria-hidden="true">!</span>
            {critical > 0 ? (
              <>
                <strong>
                  {critical} major or fatal accident {critical === 1 ? 'report' : 'reports'}
                </strong>
                {latestCritical && (
                  <span className="ops-alert-detail">
                    Most recent: {latestCritical.report_reference} at {latestCritical.location},{' '}
                    {timeAgo(latestCritical.created_at)}
                  </span>
                )}
                {critical > 1 && <span className="ops-alert-more">+{critical - 1} more</span>}
              </>
            ) : (
              <>
                <strong>No major or fatal accidents on record</strong>
                <span className="ops-alert-detail">
                  {pending} {pending === 1 ? 'report' : 'reports'} awaiting review
                </span>
              </>
            )}
          </div>
        )}

        <section className="ops-panel">
          <div className="ops-hd">
            <div>
              <h1>Dashboard</h1>
              <p className="ops-hd-sub">Welcome, {user?.name} ({user?.role})</p>
            </div>
            {user.role === 'reporter' && (
              <div className="ops-hd-actions">
                <Link to="/reports/new" className="btn btn-primary">Report new accident</Link>
              </div>
            )}
          </div>

          {!loading && !error && (
            <>
              <hr className="ops-hr" />
              <div className="ops-stat-row">
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{rows.length}</span>
                  <span className="ops-stat-label">Visible to you</span>
                </div>
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{pending}</span>
                  <span className="ops-stat-label">Awaiting review</span>
                </div>
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{resolved}</span>
                  <span className="ops-stat-label">Resolved</span>
                </div>
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{critical}</span>
                  <span className="ops-stat-label">Major or fatal</span>
                </div>
              </div>
              <p className="ops-note">Counts cover only the reports your account can see.</p>
            </>
          )}
        </section>

        {!error && (
          <section className="ops-panel">
            <div className="ops-panel-hd">
              <h2 className="ops-sec-title">Recent reports</h2>
              <Link to="/reports" className="btn btn-secondary btn-sm">View all</Link>
            </div>

            {loading ? (
              <div className="ops-skel-stack" role="status" aria-label="Loading recent reports">
                <div className="ops-skel" />
                <div className="ops-skel" />
                <div className="ops-skel" />
              </div>
            ) : recent.length === 0 ? (
              <p className="ops-empty">No reports yet.</p>
            ) : (
              <ul className="map-list">
                {recent.map(r => (
                  <li key={r.id}>
                    <Link className="map-list-item" to={`/reports/${r.id}`}>
                      <span className="ops-list-top">
                        <span className="map-list-ref">{r.report_reference}</span>
                        <span className={`badge badge-${r.status}`}>
                          {String(r.status).replace(/_/g, ' ')}
                        </span>
                      </span>
                      <span className="map-list-title">{r.title}</span>
                      <span className="map-list-loc muted">
                        {r.location} · {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
