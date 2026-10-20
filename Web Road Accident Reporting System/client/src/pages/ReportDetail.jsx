import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SingleReportMap } from '../components/MapView';
import { timeAgo } from '../services/format';
import { Gallery, useEvidenceImages } from '../components/EvidenceGallery';
import Modal from '../components/Modal';
import ActionDialog from '../components/ActionDialog';
import '../reportDetail.css';

const statusLabel = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '-');

// Mirrors the server's transition matrix (utils/helpers.js) so a button is only
// enabled when the server would accept that move. The server still has the final say.
const ADMIN_NEXT = {
  submitted: ['under_review'],
  under_review: ['needs_clarification', 'verified', 'rejected'],
  needs_clarification: ['under_review'],
  verified: ['assigned']
};
const OFFICER_NEXT = {
  assigned: ['in_progress'],
  in_progress: ['needs_clarification', 'resolved']
};

const ADMIN_HINT = {
  submitted: 'Start by moving this report to Under review.',
  under_review: 'Verify it, reject it, or ask the reporter for more information.',
  needs_clarification: 'Waiting on the reporter. You can move it back to Under review once they respond.',
  verified: 'Verified. Assign a traffic officer to investigate.',
  assigned: 'An officer is assigned and will investigate.',
  in_progress: 'The assigned officer is investigating.',
  resolved: 'This report is resolved. No further changes are possible.',
  rejected: 'This report was rejected. No further changes are possible.'
};

// Wording and rules for the note dialog that opens for each status change.
const STATUS_COPY = {
  verified: { title: 'Verify this report', intro: 'Verifying makes this an official record. You can add a note for the history.', label: 'Verification note', submit: 'Verify report', done: 'Report verified.' },
  rejected: { title: 'Reject this report', intro: 'Explain why. The reason is saved to the history and the reporter is notified.', label: 'Reason for rejection', submit: 'Reject report', required: true, tone: 'danger', done: 'Report rejected.' },
  under_review: { title: 'Move to under review', intro: 'Staff are looking into this report.', label: 'Note', submit: 'Move to under review', done: 'Moved to under review.' },
  needs_clarification: { title: 'Ask for more information', intro: 'Tell the reporter what is missing. They can edit the report and send it back.', label: 'What is needed?', submit: 'Send request', required: true, done: 'Clarification requested.' },
  in_progress: { title: 'Start investigation', intro: 'Mark this report as being investigated.', label: 'Note', submit: 'Start investigation', done: 'Investigation started.' },
  resolved: { title: 'Mark as resolved', intro: 'This closes the report. No further status changes will be possible.', label: 'Resolution note', submit: 'Mark resolved', done: 'Report marked as resolved.' }
};

const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
// One line under an officer's name in the assign list: distance, how old the position is, workload.
function officerMeta(o) {
  const parts = [];
  if (o.distance_m !== null && o.distance_m !== undefined) {
    parts.push(o.distance_m < 1000 ? `${o.distance_m} m away` : `${(o.distance_m / 1000).toFixed(1)} km away`);
    if (o.stale) parts.push('position is old');
  } else if (!o.has_location) {
    parts.push('location not shared');
  }
  if (!o.on_duty) parts.push('off duty');
  parts.push(`${o.open_cases} open case${o.open_cases === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
const errMsg = (err, fallback) => err?.response?.data?.error?.message || fallback;

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
  // Officers ranked by distance to this report: null while loading, { failed } on error.
  const [dispatch, setDispatch] = useState(null);
  const [pickedOfficer, setPickedOfficer] = useState(null);
  const [assignError, setAssignError] = useState('');
  const location = useLocation();
  const [notice, setNotice] = useState(
    location.state?.notice ? { kind: location.state.noticeKind || 'ok', text: location.state.notice } : null
  );
  // Which dialog is open: { type: 'status', status } | { type: 'findings' } | { type: 'upload', file }
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');

  // Success messages fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.kind !== 'ok') return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

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

  const reload = async () => {
    const res = await api.get(`/reports/${id}`);
    setReport(res.data);
    setEvidence(res.data.evidence || []);
    setHistory(res.data.status_history || []);
  };

  const openDialog = (next) => { setDialogError(''); setNotice(null); setDialog(next); };
  const closeDialog = () => { if (!statusLoading) { setDialog(null); setDialogError(''); } };

  const submitStatus = async (status, reason) => {
    setStatusLoading(true);
    setDialogError('');
    try {
      if (user.role === 'admin') {
        await api.patch(`/reports/${id}/verify`, { status, verification_notes: reason || undefined });
      } else {
        await api.patch(`/traffic-officer/reports/${id}/status`, { status, reason: reason || undefined });
      }
      await reload();
      setDialog(null);
      setNotice({ kind: 'ok', text: STATUS_COPY[status]?.done || 'Status updated.' });
    } catch (err) {
      setDialogError(errMsg(err, 'Update failed. Try again.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssign = async (officerId) => {
    setStatusLoading(true);
    setAssignError('');
    try {
      await api.patch(`/reports/${id}/verify`, { status: 'assigned', assignedTo: officerId });
      await reload();
      setAssignOpen(false);
      setPickedOfficer(null);
      setNotice({ kind: 'ok', text: 'Officer assigned.' });
    } catch (err) {
      setAssignError(errMsg(err, 'Assign failed. Try again.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const openAssign = () => {
    setAssignError('');
    setPickedOfficer(null);
    setNotice(null);
    setDispatch(null);
    setAssignOpen(true);
    api.get(`/reports/${id}/nearest-officers`)
      .then((r) => {
        setDispatch(r.data);
        // The nearest officer is preselected; the admin can still choose anyone else.
        if (r.data.nearest_id) setPickedOfficer(r.data.nearest_id);
      })
      .catch(() => setDispatch({ failed: true, officers: [] }));
  };

  const submitFindings = async (findings) => {
    setStatusLoading(true);
    setDialogError('');
    try {
      await api.post(`/traffic-officer/reports/${id}/findings`, { findings });
      await reload();
      setDialog(null);
      setNotice({ kind: 'ok', text: 'Findings saved.' });
    } catch (err) {
      setDialogError(errMsg(err, 'Could not save the findings. Try again.'));
    } finally {
      setStatusLoading(false);
    }
  };

  const submitUpload = async (description) => {
    const file = dialog?.file;
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', description);
    setStatusLoading(true);
    setDialogError('');
    try {
      await api.post(`/reports/${id}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await reload();
      setDialog(null);
      setNotice({ kind: 'ok', text: `${file.name} uploaded.` });
    } catch (err) {
      setDialogError(errMsg(err, 'Upload failed. Try again.'));
    } finally {
      setStatusLoading(false);
    }
  };

  // Evidence is fetched with the auth header and opened as a blob; files are never public URLs.
  // The tab is opened first, inside the click, so pop-up blockers do not stop it.
  const viewEvidence = async (e) => {
    const tab = window.open('', '_blank');
    try {
      const res = await api.get(`/reports/${id}/evidence/${e.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = e.file_name || 'evidence';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (tab) tab.close();
      setNotice({ kind: 'error', text: errMsg(err, 'Could not open the evidence file.') });
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

  const adminCan = (to) => !statusLoading && (ADMIN_NEXT[report.status] || []).includes(to);
  const officerCan = (to) => !statusLoading && (
    isAdmin ? (report.status === 'in_progress' && to === 'resolved') : (OFFICER_NEXT[report.status] || []).includes(to)
  );
  const blockedTip = `Not available while the report is ${statusLabel(report.status).toLowerCase()}`;
  const primaryNext = report.status === 'submitted' ? 'under_review' : 'verified';
  const isPrimary = (to) => primaryNext === to && adminCan(to);

  const pickFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!EVIDENCE_TYPES.includes(file.type)) {
      setNotice({ kind: 'error', text: 'Only JPG, PNG, WebP or PDF files can be uploaded.' });
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      setNotice({ kind: 'error', text: 'That file is over the 10 MB limit.' });
      return;
    }
    openDialog({ type: 'upload', file });
  };

  return (
    <div className="rd">
      <Link to="/reports" className="rd-back">‹ All reports</Link>

      {error && <p className="rd-error" role="alert">{error}</p>}
      {notice && (
        <p className={`rd-notice rd-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
        </p>
      )}

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
              {report.duplicate_of && (
                <Fact label="Same accident as" sub="Reported earlier. The original is the one to investigate.">
                  {user.role === 'admin' ? <Link to={`/reports/${report.duplicate_of}`}>{report.duplicate_of_reference}</Link> : report.duplicate_of_reference}
                </Fact>
              )}
              {user.role === 'admin' && report.duplicates?.length > 0 && (
                <Fact label="Duplicate reports" sub="Other people reported this accident too.">
                  {report.duplicates.map((d, i) => (
                    <span key={d.id}>{i > 0 && ', '}<Link to={`/reports/${d.id}`}>{d.report_reference}</Link></span>
                  ))}
                </Fact>
              )}
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
                <button type="button" className={`rd-btn${isPrimary('verified') ? ' rd-btn--primary' : ''}`} disabled={!adminCan('verified')} title={adminCan('verified') ? undefined : blockedTip} onClick={() => openDialog({ type: 'status', status: 'verified' })}>Verify</button>
                <button type="button" className="rd-btn rd-btn--danger" disabled={!adminCan('rejected')} title={adminCan('rejected') ? undefined : blockedTip} onClick={() => openDialog({ type: 'status', status: 'rejected' })}>Reject</button>
                <button type="button" className={`rd-btn${isPrimary('under_review') ? ' rd-btn--primary' : ''}`} disabled={!adminCan('under_review')} title={adminCan('under_review') ? undefined : blockedTip} onClick={() => openDialog({ type: 'status', status: 'under_review' })}>Under review</button>
                <button type="button" className="rd-btn" disabled={!adminCan('needs_clarification')} title={adminCan('needs_clarification') ? undefined : blockedTip} onClick={() => openDialog({ type: 'status', status: 'needs_clarification' })}>Needs clarification</button>
              </div>
              <button type="button" className={`rd-btn rd-btn--wide${adminCan('assigned') ? ' rd-btn--primary' : ''}`} disabled={!adminCan('assigned')} title={adminCan('assigned') ? undefined : blockedTip} onClick={openAssign}>Assign officer</button>
              <p className="rd-muted">{ADMIN_HINT[report.status]}</p>
              <p className="rd-muted">Every change is saved to the history with your note.</p>
            </section>
          )}

          {canOfficerAct && (
            <section className="rd-card" aria-label="Officer actions">
              <h2>Officer actions</h2>
              <div className="rd-actions">
                {['in_progress', 'needs_clarification', 'resolved'].map((st) => (
                  <button key={st} type="button" className={`rd-btn${report.status === st ? ' rd-btn--primary' : ''}`} disabled={!officerCan(st)} title={officerCan(st) ? undefined : blockedTip} onClick={() => openDialog({ type: 'status', status: st })}>{statusLabel(st)}</button>
                ))}
              </div>
              <button type="button" className="rd-btn rd-btn--wide" disabled={statusLoading} onClick={() => openDialog({ type: 'findings' })}>Add findings</button>
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
      {dialog?.type === 'status' && (() => {
        const c = STATUS_COPY[dialog.status];
        return (
          <ActionDialog
            key={dialog.status}
            title={c.title}
            intro={c.intro}
            label={c.label}
            required={Boolean(c.required)}
            tone={c.tone}
            submitLabel={c.submit}
            busyLabel="Saving…"
            busy={statusLoading}
            error={dialogError}
            onCancel={closeDialog}
            onSubmit={(text) => submitStatus(dialog.status, text)}
          />
        );
      })()}
      {dialog?.type === 'findings' && (
        <ActionDialog
          title="Add findings"
          intro={`Record what you found while investigating ${report.report_reference || `report #${report.id}`}. The reporter is notified.`}
          label="Findings"
          placeholder="What happened, what you observed, actions taken…"
          required
          maxLength={2000}
          rows={6}
          submitLabel="Save findings"
          busy={statusLoading}
          error={dialogError}
          onCancel={closeDialog}
          onSubmit={submitFindings}
        />
      )}
      {dialog?.type === 'upload' && (
        <ActionDialog
          title="Upload a file"
          label="Description"
          placeholder="What does this show?"
          submitLabel="Upload"
          busyLabel="Uploading…"
          rows={3}
          busy={statusLoading}
          error={dialogError}
          onCancel={closeDialog}
          onSubmit={submitUpload}
        >
          <p className="rd-file-chip"><b>{dialog.file.name}</b><small>{(dialog.file.size / 1024 / 1024).toFixed(2)} MB</small></p>
        </ActionDialog>
      )}
      {assignOpen && (
        <Modal title="Assign an officer" onClose={() => { if (!statusLoading) setAssignOpen(false); }}>
          <p className="rd-muted" style={{ marginBottom: 12 }}>
            Choose the traffic officer who will investigate {report.report_reference || `report #${report.id}`}. They will be notified.
          </p>
          {report.duplicate_of && (
            <p className="rd-muted" style={{ marginBottom: 12 }}>
              This report is a duplicate of {report.duplicate_of_reference}. Assign an officer to the original and reject this one as a duplicate.
            </p>
          )}
          {dispatch === null ? (
            <p className="rd-muted">Finding the nearest officers…</p>
          ) : dispatch.officers.length === 0 ? (
            <p className="rd-muted">
              {dispatch.failed ? 'Could not load the officers. Close this and try again.' : 'There are no active traffic officers yet.'}{' '}
              {!dispatch.failed && <Link to="/admin/users">Add one under Users</Link>}
            </p>
          ) : (
            <>
              {!dispatch.report_has_location && (
                <p className="rd-muted" style={{ marginBottom: 8 }}>
                  This report has no map position, so distances cannot be worked out. Officers are listed by fewest open cases.
                </p>
              )}
              {dispatch.report_has_location && !dispatch.nearest_id && (
                <p className="rd-muted" style={{ marginBottom: 8 }}>
                  No on-duty officer has shared a recent location, so nobody can be called the nearest.
                </p>
              )}
              <ul className="rd-officers" role="radiogroup" aria-label="Traffic officers">
                {dispatch.officers.map((o) => (
                  <li key={o.id}>
                    <label className={`rd-officer${pickedOfficer === o.id ? ' is-on' : ''}`}>
                      <input type="radio" name="officer" checked={pickedOfficer === o.id} onChange={() => setPickedOfficer(o.id)} />
                      <span>
                        <b>{o.name}{o.id === dispatch.nearest_id && <em className="rd-nearest">Nearest</em>}</b>
                        <small>{officerMeta(o)}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {dispatch.nearest_id && pickedOfficer !== null && pickedOfficer !== dispatch.nearest_id && (
                <p className="rd-muted" style={{ marginBottom: 8 }}>This is not the nearest officer. The choice is recorded in the audit log.</p>
              )}
            </>
          )}
          {assignError && <p className="rd-assign-err" role="alert">{assignError}</p>}
          <div className="rd-modal-actions">
            <button type="button" className="rd-btn" disabled={statusLoading} onClick={() => setAssignOpen(false)}>Cancel</button>
            <button type="button" className="rd-btn rd-btn--primary" disabled={statusLoading || pickedOfficer === null}
              onClick={() => handleAssign(pickedOfficer)}>
              {statusLoading ? 'Assigning…' : pickedOfficer !== null && pickedOfficer === dispatch?.nearest_id ? 'Assign nearest officer' : 'Assign officer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
