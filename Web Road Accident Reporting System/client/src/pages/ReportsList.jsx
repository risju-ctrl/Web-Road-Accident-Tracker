import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { timeAgo } from '../services/format';
import { ReportMap } from '../components/MapView';
import { Gallery, useEvidenceImages } from '../components/EvidenceGallery';
import '../reportsSplit.css';

const statusLabel = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const STATUS_OPTIONS = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];
const STATUS_CHIPS = [['', 'All'], ['submitted', 'Submitted'], ['under_review', 'Review'], ['verified', 'Verified'], ['assigned', 'Assigned'], ['in_progress', 'Active'], ['resolved', 'Resolved'], ['rejected', 'Rejected']];

// Colour AND shape, matching the dashboard, so injury level never relies on colour alone.
const INJURY = {
  fatalities: { label: 'Fatal', color: '#F05252', shape: 'polygon(50% 0, 100% 100%, 0 100%)' },
  injuries: { label: 'Injuries', color: '#F08A3C', shape: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  none: { label: 'No injuries', color: '#4FC3A1', shape: 'circle(50%)' },
  unknown: { label: 'Unknown', color: '#8d8b84', shape: 'inset(0 round 2px)' }
};
const injuryOf = (r) => INJURY[r.injury_status] || INJURY.unknown;

function Marker({ info, size = 10 }) {
  return <span aria-hidden="true" className="rs-mark" style={{ width: size, height: size, background: info.color, clipPath: info.shape }} />;
}

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '-');
const fmtTime = (t) => (t ? String(t).slice(0, 5) : 'Time not stated');
const hasCoords = (r) => r && r.latitude != null && r.longitude != null && r.latitude !== '' && r.longitude !== '';

function Fact({ label, children }) {
  return (
    <div className="rs-fact">
      <small>{label}</small>
      <span>{children ?? '-'}</span>
    </div>
  );
}

export default function ReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.get('from') || '';
  const dateTo = searchParams.get('to') || '';
  const categoryId = searchParams.get('type') || '';
  const [categories, setCategories] = useState([]);
  useEffect(() => { api.get('/accident-categories').then((r) => setCategories(r.data || [])).catch(() => {}); }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params = {};
    if (status) params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (categoryId) params.category_id = categoryId;
    api.get('/reports', { params })
      .then((res) => { if (alive) setReports(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => {
        console.error(err);
        if (alive) setError('Reports could not be loaded. Check that the API is running.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, dateFrom, dateTo, categoryId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) =>
      [r.report_reference, r.title, r.location, r.category_name, r.vehicle_type]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [reports, query]);

  // Keep a valid selection: fall back to the first report whenever the list changes.
  const selected = visible.find((r) => r.id === selectedId) || visible[0] || null;

  // The list has no evidence, so the selected report's files are fetched once and kept.
  const [evidenceById, setEvidenceById] = useState({});
  const selectedId0 = selected?.id;
  useEffect(() => {
    if (selectedId0 == null || evidenceById[selectedId0]) return undefined;
    let alive = true;
    api.get(`/reports/${selectedId0}`)
      .then((res) => { if (alive) setEvidenceById((m) => ({ ...m, [selectedId0]: res.data.evidence || [] })); })
      .catch(() => { if (alive) setEvidenceById((m) => ({ ...m, [selectedId0]: [] })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId0]);
  const images = useEvidenceImages(selectedId0, evidenceById[selectedId0]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  };
  const setStatus = (value) => setParam('status', value);

  // Exports are fetched with the auth header and saved as a blob so the token never appears in a URL.
  const downloadExport = async (format) => {
    if (exporting) return;
    setExporting(format);
    setExportError('');
    try {
      const params = { format };
      if (status) params.status = status;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (categoryId) params.category_id = categoryId;
      const res = await api.get('/summaries/reports/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(`The ${format.toUpperCase()} export failed. Try again.`);
    } finally {
      setExporting('');
    }
  };

  const mapColor = (r) => injuryOf(r).color;
  const mapped = visible.filter(hasCoords).length;

  return (
    <div className="rs">
      {/* ---------------- left: the list ---------------- */}
      <aside className="rs-list" aria-label="Reports">
        <div className="rs-list-hd">
          <div>
            <h1>Reports</h1>
            <p>{loading ? 'Loading…' : `${visible.length} ${visible.length === 1 ? 'report' : 'reports'}${status ? ` · ${statusLabel(status)}` : ''}`}</p>
          </div>
          <div className="rs-actions">
            {user.role === 'admin' && <button type="button" className="rs-btn" disabled={Boolean(exporting)} onClick={() => downloadExport('csv')}>{exporting === 'csv' ? 'Exporting…' : 'Export CSV'}</button>}
            {user.role === 'admin' && <button type="button" className="rs-btn" disabled={Boolean(exporting)} onClick={() => downloadExport('pdf')}>{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</button>}
            {user.role === 'reporter' && <Link to="/reports/new" className="rs-btn rs-btn--primary">New report</Link>}
          </div>
        </div>

        {exportError && <p className="rs-note rs-note--err" role="alert">{exportError}</p>}

        <label className="rs-search">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reference, place, type" aria-label="Search reports" />
        </label>

        <div className="rs-filters" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', margin: '.5rem 0' }}>
          <label style={{ fontSize: '.8rem' }}>From <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setParam('from', e.target.value)} aria-label="Accident date from" /></label>
          <label style={{ fontSize: '.8rem' }}>To <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setParam('to', e.target.value)} aria-label="Accident date to" /></label>
          <select value={categoryId} onChange={(e) => setParam('type', e.target.value)} aria-label="Accident type">
            <option value="">All types</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(dateFrom || dateTo || categoryId) && <button type="button" className="rs-btn" onClick={() => { const n = new URLSearchParams(searchParams); ['from','to','type'].forEach((k) => n.delete(k)); setSearchParams(n); }}>Clear</button>}
        </div>

        <div className="rs-chips" role="tablist" aria-label="Filter by status">
          {STATUS_CHIPS.filter(([v]) => !v || STATUS_OPTIONS.includes(v)).map(([value, text]) => (
            <button key={value || 'all'} role="tab" aria-selected={status === value} className={status === value ? 'on' : ''} onClick={() => setStatus(value)}>{text}</button>
          ))}
        </div>

        <div className="rs-scroll">
          {error ? (
            <p className="rs-note rs-note--err" role="alert">{error}</p>
          ) : loading ? (
            <div className="rs-skels" role="status" aria-label="Loading reports"><i /><i /><i /><i /></div>
          ) : visible.length === 0 ? (
            <p className="rs-note">{query || status ? 'No reports match. Clear the search or status filter.' : 'No reports on record.'}</p>
          ) : (
            <ul>
              {visible.map((r) => {
                const inj = injuryOf(r);
                return (
                  <li key={r.id}>
                    <button type="button" className={`rs-card${selected?.id === r.id ? ' on' : ''}`} onClick={() => setSelectedId(r.id)} aria-pressed={selected?.id === r.id}>
                      <span className="rs-card-top">
                        <b>{r.report_reference}</b>
                        <span className={`badge badge-${r.status}`}>{statusLabel(r.status)}</span>
                      </span>
                      <span className="rs-card-title">{r.title}</span>
                      <span className="rs-card-loc">{r.location}</span>
                      <span className="rs-card-foot">
                        <span className="rs-inj"><Marker info={inj} />{inj.label}</span>
                        <span>{r.category_name || 'Uncategorized'}</span>
                        <span>{timeAgo(r.created_at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ---------------- right: map + details ---------------- */}
      <main className="rs-main">
        <section className="rs-map" aria-label="Accident location">
          {mapped > 0 ? (
            <ReportMap reports={visible} focus={selected} activeId={selected?.id} glow fitToReports colorFor={mapColor} basemap="muted" height="100%" />
          ) : (
            <div className="rs-map-empty">{loading ? 'Loading map…' : 'None of these reports has coordinates yet.'}</div>
          )}
          {selected && !hasCoords(selected) && mapped > 0 && (
            <div className="rs-map-tag">This report has no coordinates</div>
          )}
        </section>

        <section className="rs-detail" aria-label="Report details">
          {!selected ? (
            <p className="rs-note">{loading ? 'Loading…' : 'Select a report to see its details.'}</p>
          ) : (
            <>
              <div className="rs-detail-hd">
                <div>
                  <small>{selected.report_reference}</small>
                  <h2>{selected.title}</h2>
                </div>
                <div className="rs-detail-actions">
                  <span className={`badge badge-${selected.status}`}>{statusLabel(selected.status)}</span>
                  <Link to={`/reports/${selected.id}`} className="rs-btn rs-btn--primary">Open full report</Link>
                </div>
              </div>

              <div className="rs-body">
                <Gallery key={selected.id} images={images} variant="compact" />
                <div className="rs-info">
              <div className="rs-facts">
                <Fact label="Location">
                  {selected.location}
                  <em>{hasCoords(selected) ? `${Number(selected.latitude).toFixed(5)}, ${Number(selected.longitude).toFixed(5)}` : 'No coordinates'}</em>
                </Fact>
                <Fact label="When">
                  {fmtDate(selected.accident_date)}
                  <em>{fmtTime(selected.accident_time)}</em>
                </Fact>
                <Fact label="Accident type">{selected.category_name || 'Uncategorized'}</Fact>
                <Fact label="Vehicle">
                  {selected.vehicle_type || 'Not stated'}
                  <em>{selected.vehicles_involved != null ? `${selected.vehicles_involved} involved` : ''}</em>
                </Fact>
                <Fact label="Injury level">
                  <span className="rs-inj"><Marker info={injuryOf(selected)} />{injuryOf(selected).label}</span>
                  <em>{selected.injuries != null || selected.fatalities != null ? `${selected.injuries ?? 0} injured · ${selected.fatalities ?? 0} fatal` : ''}</em>
                </Fact>
                <Fact label="Severity">{selected.severity ? statusLabel(selected.severity) : 'Unclassified'}</Fact>
                {user.role !== 'reporter' && (
                  <Fact label="Reported by">
                    {selected.reporter_name || '-'}
                    <em>{timeAgo(selected.created_at)}</em>
                  </Fact>
                )}
                {selected.verified_at && <Fact label="Verified">{fmtDate(selected.verified_at)}</Fact>}
              </div>

              {selected.description && (
                <div className="rs-desc">
                  <small>What happened</small>
                  <p>{selected.description}</p>
                </div>
              )}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
