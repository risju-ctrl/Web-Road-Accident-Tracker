import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SingleReportMap } from '../components/MapView';
import { timeAgo } from '../services/format';
import { Gallery, useEvidenceImages } from '../components/EvidenceGallery';
import Modal from '../components/Modal';
import '../reportDetail.css';

const statusLabel = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '-');

export default function ReportDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [officers, setOfficers] = useState(null); // null while loading, [] when there are none
  const [officersFailed, setOfficersFailed] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pickedOfficer, setPickedOfficer] = useState(null);
  const [assignError, setAssignError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/reports/${id}`);
        setReport(res.data);
        setEvidence(res.data.evidence || []);
        setHistory(res.data.status_history || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Admins pick from the active traffic officers instead of typing an ID.
  useEffect(() => {
    if (user.role !== 'admin') return;
    api.get('/users', { params: { role: 'traffic_officer', is_active: 1 } })
      .then((r) => setOfficers(Array.isArray(r.data) ? r.data : []))
      .catch(() => { setOfficers([]); setOfficersFailed(true); });
  }, [user.role]);

  const handleStatusChange = async (newStatus, reason) => {
    setStatusLoading(true);
    try {
      if (user.role === 'admin') {
        await api.patch(`/reports/${id}/verify`, { status: newStatus, verification_notes: reason });
      } else {
        await api.patch(`/traffic-officer/reports/${id}/status`, { status: newStatus, reason });
      }
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setHistory(res.data.status_history || []);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssign = async (officerId) => {
    setStatusLoading(true);
    setAssignError('');
    try {
      await api.patch(`/reports/${id}/verify`, { status: 'assigned', assignedTo: officerId });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setHistory(res.data.status_history || []);
      setAssignOpen(false);
      setPickedOfficer(null);
    } catch (err) {
      setAssignError(err.response?.data?.error?.message || 'Assign failed. Try again.');
    } finally {
      setStatusLoading(false);
    }
  };

  const openAssign = () => { setAssignError(''); setPickedOfficer(null); setAssignOpen(true); };

  const handleFindings = async (findings) => {
    setStatusLoading(true);
    try {
      await api.post(`/traffic-officer/reports/${id}/findings`, { findings });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const uploadEvidence = async (file, description) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', description);
    try {
      await api.post(`/reports/${id}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await api.get(`/reports/${id}`);
      setEvidence(res.data.evidence || []);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Upload failed');
    }
  };

  // Evidence is fetched with the auth header and opened as a blob; files are never public URLs.
  const viewEvidence = async (e) => {
    try {
      const res = await api.get(`/reports/${id}/evidence/${e.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      alert('Could not open the evidence file');
    }
  };

  const images = useEvidenceImages(report?.id, evidence);
  const otherFiles = evidence.filter((e) => !String(e.mime_type || '').startsWith('image/'));

  if (loading) {
    return (
      <div className="container">
        <div className="ops-doc">
          <div className="ops-alert ops-alert--boxed is-info" role="status">
            <span className="ops-alert-icon" aria-hidden="true">i</span>
            <strong>Loading report…</strong>
          </div>
          <section className="ops-panel">
            <div className="ops-skel-stack" role="status" aria-label="Loading report">
              <div className="ops-skel" />
              <div className="ops-skel" />
              <div className="ops-skel" />
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="container">
        <div className="ops-doc">
          <div className="ops-alert ops-alert--boxed" role="alert">
            <span className="ops-alert-icon" aria-hidden="true">!</span>
            <strong>{error || 'Report not found'}</strong>
          </div>
          <section className="ops-panel">
            <p className="ops-empty">
              This report could not be opened. Go back to the reports list and try again.
            </p>
            <Link to="/reports" className="btn btn-secondary">Back to reports</Link>
          </section>
        </div>
      </div>
    );
  }

  const canEdit = user.role === 'reporter' && report.reporter_id === user.id && ['submitted', 'needs_clarification'].includes(report.status);
  const canOfficerAct = (user.role === 'traffic_officer' || user.role === 'admin') && report.assigned_to === user.id;
  const isAdmin = user.role === 'admin';
  const severity = report.severity || 'unknown';
  const verified = Boolean(report.verified_by);
  const hasMap = Boolean(report.latitude && report.longitude);

  const Fact = ({ label, children, sub }) => (
    <div className="rd-fact">
      <dt>{label}</dt>
      <dd>{children}{sub ? <em>{sub}</em> : null}</dd>
    </div>
  );

  const pickFile = (e) => {
    if (e.target.files[0]) {
      const desc = prompt('Description (optional):');
      uploadEvidence(e.target.files[0], desc || '');
      e.target.value = '';
    }
  };

  return (
    <div className="rd">
      <Link to="/reports" className="rd-back">‹ All reports</Link>

      {error && <p className="rd-error" role="alert">{error}</p>}

      <header className="rd-hd">
        <div className="rd-hd-main">
          <p className="rd-ref">{report.report_reference} · Reported {timeAgo(report.created_at)}</p>
          <h1>{report.title}</h1>
          <p className="rd-where">{report.location}</p>
        </div>
        <div className="rd-hd-side">
          <span className={`badge badge-${report.status}`}>{statusLabel(report.status)}</span>
          <span className={`ops-sev sev-${severity}`}>{report.severity ? statusLabel(report.severity) : 'Unclassified'}</span>
          {canEdit && <Link to={`/reports/${id}/edit`} className="rd-btn">Edit report</Link>}
        </div>
      </header>
      <p className="rd-trust">
        {verified
          ? `Verified by staff on ${fmtDate(report.verified_at)}. This record is official.`
          : 'Not yet verified. Public reports are not official until staff verify them.'}
      </p>

      <div className="rd-grid">
        <div className="rd-col">
          <Gallery key={report.id} images={images} variant="large" />

          <section className="rd-card" aria-label="Summary">
            <div className="rd-tiles">
              <div><b>{report.vehicles_involved || 0}</b><span>Vehicles</span></div>
              <div><b>{report.injuries || 0}</b><span>Injured</span></div>
              <div><b>{report.fatalities || 0}</b><span>Fatalities</span></div>
            </div>
            <h2>What happened</h2>
            <p className="rd-text">{report.description || 'No description was provided.'}</p>
          </section>

          <section className="rd-card" aria-label="Details">
            <h2>Details</h2>
            <dl className="rd-facts">
              <Fact label="Date and time" sub={report.accident_time ? String(report.accident_time).slice(0, 5) : 'Time not stated'}>{fmtDate(report.accident_date)}</Fact>
              <Fact label="Accident type">{report.category_name || 'Uncategorized'}</Fact>
              <Fact label="Vehicle">{report.vehicle_type || 'Not stated'}</Fact>
              <Fact label="Injury status">{statusLabel(report.injury_status)}</Fact>
              {user.role !== 'reporter' && (
                <Fact label="Reported by" sub={report.reporter_email}>{report.reporter_name}</Fact>
              )}
              {report.assigned_to && (() => {
                const o = (officers || []).find((x) => x.id === report.assigned_to);
                return <Fact label="Assigned to" sub={o?.email}>{o ? o.name : `Officer #${report.assigned_to}`}</Fact>;
              })()}
              {report.verified_by && <Fact label="Verified by" sub={report.verified_at ? new Date(report.verified_at).toLocaleString() : ''}>Admin #{report.verified_by}</Fact>}
            </dl>
            {(report.verification_notes || report.findings) && (
              <div className="rd-notes">
                {report.verification_notes && <div><small>Verification notes</small><p>{report.verification_notes}</p></div>}
                {report.findings && <div><small>Officer findings</small><p>{report.findings}</p></div>}
              </div>
            )}
          </section>

          <section className="rd-card" aria-label="Status history">
            <h2>History</h2>
            {history.length === 0 ? (
              <p className="rd-muted">No status changes yet.</p>
            ) : (
              <ol className="rd-timeline">
                {history.map((h) => (
                  <li key={h.id}>
                    <i style={{ background: `hsl(var(--status-${h.new_status}))` }} aria-hidden="true" />
                    <div>
                      <p><b>{statusLabel(h.new_status)}</b>{h.old_status ? <span> from {statusLabel(h.old_status).toLowerCase()}</span> : null}</p>
                      {h.reason && <p className="rd-reason">{h.reason}</p>}
                      <small>{h.changed_by_name} · {new Date(h.changed_at).toLocaleString()}</small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="rd-col" aria-label="Location and actions">
          <section className="rd-card rd-card--map" aria-label="Location">
            <h2>Location</h2>
            {hasMap ? (
              <div className="rd-map"><SingleReportMap report={report} height={260} /></div>
            ) : (
              <p className="rd-muted">This report has no map coordinates.</p>
            )}
            <p className="rd-addr">{report.location}</p>
            {hasMap && <small className="rd-coords">{Number(report.latitude).toFixed(5)}, {Number(report.longitude).toFixed(5)}</small>}
          </section>

          {isAdmin && (
            <section className="rd-card" aria-label="Admin actions">
              <h2>Review</h2>
              <div className="rd-actions">
                <button type="button" className="rd-btn rd-btn--primary" disabled={statusLoading || report.status === 'verified'} onClick={() => handleStatusChange('verified', prompt('Notes (optional):'))}>Verify</button>
                <button type="button" className="rd-btn rd-btn--danger" disabled={statusLoading || report.status === 'rejected'} onClick={() => handleStatusChange('rejected', prompt('Notes (optional):'))}>Reject</button>
                <button type="button" className="rd-btn" disabled={statusLoading || report.status === 'under_review'} onClick={() => handleStatusChange('under_review', prompt('Notes (optional):'))}>Under review</button>
                <button type="button" className="rd-btn" disabled={statusLoading || report.status === 'needs_clarification'} onClick={() => handleStatusChange('needs_clarification', prompt('Notes (optional):'))}>Needs clarification</button>
              </div>
              <button type="button" className="rd-btn rd-btn--wide" disabled={statusLoading || report.status !== 'verified'} onClick={openAssign}>Assign officer</button>
              {report.status !== 'verified' && (
                <p className="rd-muted">
                  {report.assigned_to ? 'This report already has an officer.' : 'Verify the report first, then you can assign an officer.'}
                </p>
              )}
              <p className="rd-muted">Every change is saved to the history with your note.</p>
            </section>
          )}

          {canOfficerAct && (
            <section className="rd-card" aria-label="Officer actions">
              <h2>Officer actions</h2>
              <div className="rd-actions">
                {['in_progress', 'needs_clarification', 'resolved'].map((st) => (
                  <button key={st} type="button" className={`rd-btn${report.status === st ? ' rd-btn--primary' : ''}`} disabled={statusLoading || report.status === st} onClick={() => handleStatusChange(st, prompt('Reason (optional):'))}>{statusLabel(st)}</button>
                ))}
              </div>
              <button type="button" className="rd-btn rd-btn--wide" disabled={statusLoading} onClick={() => { const f = prompt('Enter findings:'); if (f) handleFindings(f); }}>Add findings</button>
            </section>
          )}

          <section className="rd-card" aria-label="Photos and files">
            <div className="rd-card-hd">
              <h2>Photos and files</h2>
              <input type="file" id={`evidence-${id}`} style={{ display: 'none' }} onChange={pickFile} />
              <label htmlFor={`evidence-${id}`} className="rd-btn rd-btn--sm">Upload</label>
            </div>
            {images.length > 0 && <p className="rd-muted">{images.length} {images.length === 1 ? 'photo' : 'photos'} shown above.</p>}
            {otherFiles.length === 0 && images.length === 0 && <p className="rd-muted">Nothing attached yet.</p>}
            {otherFiles.length > 0 && (
              <ul className="rd-files">
                {otherFiles.map((e) => (
                  <li key={e.id}>
                    <div>
                      <b>{e.file_name}</b>
                      <small>{e.description ? `${e.description} · ` : ''}{e.uploader_name}, {new Date(e.uploaded_at).toLocaleDateString()}</small>
                    </div>
                    <button type="button" className="rd-btn rd-btn--sm" onClick={() => viewEvidence(e)}>Open</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {assignOpen && (
        <Modal title="Assign an officer" onClose={() => { if (!statusLoading) setAssignOpen(false); }}>
          <p className="rd-muted" style={{ marginBottom: 12 }}>
            Choose the traffic officer who will investigate {report.report_reference || `report #${report.id}`}. They will be notified.
          </p>
          {officers === null ? (
            <p className="rd-muted">Loading officers…</p>
          ) : officers.length === 0 ? (
            <p className="rd-muted">
              {officersFailed ? 'Could not load the officers. Close this and try again.' : 'There are no active traffic officers yet.'}{' '}
              {!officersFailed && <Link to="/admin/users">Add one under Users</Link>}
            </p>
          ) : (
            <ul className="rd-officers" role="radiogroup" aria-label="Traffic officers">
              {officers.map((o) => (
                <li key={o.id}>
                  <label className={`rd-officer${pickedOfficer === o.id ? ' is-on' : ''}`}>
                    <input type="radio" name="officer" checked={pickedOfficer === o.id} onChange={() => setPickedOfficer(o.id)} />
                    <span><b>{o.name}</b><small>{o.email}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {assignError && <p className="rd-assign-err" role="alert">{assignError}</p>}
          <div className="rd-modal-actions">
            <button type="button" className="rd-btn" disabled={statusLoading} onClick={() => setAssignOpen(false)}>Cancel</button>
            <button type="button" className="rd-btn rd-btn--primary" disabled={statusLoading || pickedOfficer === null}
              onClick={() => handleAssign(pickedOfficer)}>
              {statusLoading ? 'Assigning…' : 'Assign officer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
