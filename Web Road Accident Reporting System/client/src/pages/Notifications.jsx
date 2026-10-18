import { useEffect, useState } from 'react';
import api from '../services/api';

export default function Notifications() {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // The strip and the stat tile count the whole account, not just this page,
  // which is what the navbar bell already asks the API for.
  const fetchCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count);
    } catch (err) {
      console.error(err);
    }
  };

  const fetch = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/notifications', { params: { page, limit: 20, unread: unreadOnly } });
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError('Notifications could not be loaded. Check that the API is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
    fetchCount();
  }, [page, unreadOnly]);

  const handleRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setData(d => ({ ...d, rows: d.rows.map(n => n.id === id ? { ...n, is_read: 1 } : n) }));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setData(d => ({ ...d, rows: d.rows.map(n => ({ ...n, is_read: 1 })) }));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="container">
      <div className="ops-doc">
        {loading ? (
          <div className="ops-alert ops-alert--boxed is-info" role="status">
            <span className="ops-alert-icon" aria-hidden="true">i</span>
            <strong>Loading notifications…</strong>
          </div>
        ) : error ? (
          <div className="ops-alert ops-alert--boxed" role="alert">
            <span className="ops-alert-icon" aria-hidden="true">!</span>
            <strong>{error}</strong>
          </div>
        ) : (
          <div className={`ops-alert ops-alert--boxed ${unreadCount ? 'is-info' : 'is-clear'}`} role="status">
            <span className="ops-alert-icon" aria-hidden="true">{unreadCount ? 'i' : '!'}</span>
            <strong>
              {unreadCount
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'All notifications read'}
            </strong>
            <span className="ops-alert-detail">
              {data.total} {data.total === 1 ? 'entry' : 'entries'} in this view
            </span>
          </div>
        )}

        <section className="ops-panel">
          <div className="ops-hd">
            <div>
              <h1>Notifications</h1>
              <p className="ops-hd-sub">
                {loading ? 'Loading…' : unreadCount ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>

          {!loading && !error && (
            <>
              <hr className="ops-hr" />
              <div className="ops-stat-row">
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{unreadCount}</span>
                  <span className="ops-stat-label">Unread</span>
                </div>
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{data.total}</span>
                  <span className="ops-stat-label">In this view</span>
                </div>
                <div className="ops-stat">
                  <span className="ops-stat-value numeric">{data.rows.length}</span>
                  <span className="ops-stat-label">On this page</span>
                </div>
              </div>
              <p className="ops-note">
                The unread count covers every notification on your account, not only this page.
              </p>
            </>
          )}
        </section>

        {!error && (
          <section className="ops-panel">
            <div className="ops-panel-hd">
              <h2 className="ops-sec-title">Notification log ({data.total})</h2>
              <div className="status-filter">
                <label className="ops-check">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={e => { setUnreadOnly(e.target.checked); setPage(1); }}
                  />
                  Unread only
                </label>
                {unreadCount > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleReadAll}>
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="ops-skel-stack" role="status" aria-label="Loading notifications">
                <div className="ops-skel" />
                <div className="ops-skel" />
                <div className="ops-skel" />
                <div className="ops-skel" />
              </div>
            ) : data.rows.length === 0 ? (
              <p className="ops-empty">
                {unreadOnly ? 'No unread notifications.' : 'No notifications.'}
              </p>
            ) : (
              <div className="ops-scroll">
                <ul className="map-list">
                  {data.rows.map(n => (
                    <li key={n.id} className={`map-list-item ${n.is_read ? '' : 'is-unread'}`}>
                      <span className="ops-list-top">
                        {n.report_reference && (
                          <span className="map-list-ref">{n.report_reference}</span>
                        )}
                        <time className="map-list-ref" dateTime={n.created_at}>
                          {new Date(n.created_at).toLocaleString()}
                        </time>
                      </span>
                      <span className="map-list-title">{n.message}</span>
                      {!n.is_read && (
                        <span className="ops-list-foot">
                          <span className="badge badge-unread">Unread</span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleRead(n.id)}
                          >
                            Mark read
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.total > data.limit && (
              <div className="ops-pager">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1 || loading}
                >
                  Previous
                </button>
                <span>Page {data.page} of {pages}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={data.page * data.limit >= data.total || loading}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
