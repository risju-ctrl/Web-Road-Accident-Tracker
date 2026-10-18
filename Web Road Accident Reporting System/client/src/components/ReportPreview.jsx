import { useEffect, useState } from 'react';
import api from '../services/api';
import { useEvidenceImages } from './EvidenceGallery';

// Full report rows are fetched on hover (the list endpoint carries no evidence)
// and kept, so moving between pins does not refetch.
const detailCache = new Map();

export function useReportDetail(report) {
  const [detail, setDetail] = useState(() => (report ? detailCache.get(report.id) || null : null));

  useEffect(() => {
    if (!report) return undefined;
    if (detailCache.has(report.id)) {
      setDetail(detailCache.get(report.id));
      return undefined;
    }

    setDetail(null);
    let alive = true;
    api.get(`/reports/${report.id}`)
      .then(res => {
        detailCache.set(report.id, res.data);
        if (alive) setDetail(res.data);
      })
      .catch(() => {
        // Officers only open reports assigned to them; the list data is enough then.
      });

    return () => { alive = false; };
  }, [report]);

  return detail;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return null;
  const [h, m] = String(value).split(':');
  if (h === undefined || m === undefined) return null;
  const hour = Number(h);
  if (!Number.isFinite(hour)) return null;
  return `${((hour + 11) % 12) + 1}:${m.slice(0, 2)} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function Stat({ label, value, tone }) {
  return (
    <div className={`rp-stat ${tone || ''}`}>
      <span className="rp-stat-value numeric">{value}</span>
      <span className="rp-stat-label">{label}</span>
    </div>
  );
}

// Detailed card shown while a pin or a report row is hovered. Purely
// presentational: the page decides where it sits.
export default function ReportPreview({ report, timeAgo, style, className = '' }) {
  const detail = useReportDetail(report);
  const images = useEvidenceImages(report?.id, detail?.evidence);
  const [photo, setPhoto] = useState(0);

  useEffect(() => { setPhoto(0); }, [report?.id]);

  // The card ignores the pointer so it can never steal the hover, so several photos
  // rotate by themselves instead of needing a button.
  useEffect(() => {
    if (images.length < 2) return undefined;
    const timer = setInterval(() => setPhoto(p => (p + 1) % images.length), 1800);
    return () => clearInterval(timer);
  }, [images.length]);

  if (!report) return null;

  const row = { ...report, ...(detail || {}) };
  const sev = row.severity || 'unknown';
  const shot = images[Math.min(photo, images.length - 1)];
  const when = [formatDate(row.accident_date), formatTime(row.accident_time)].filter(Boolean).join(' · ');
  const description = String(row.description || '').trim();
  const fileCount = (detail?.evidence || []).length;

  return (
    <article className={`rp ${className}`} style={style} aria-live="polite">
      <div className={`rp-photo ${shot ? '' : 'is-empty'}`}>
        {shot ? (
          <img src={shot.url} alt={shot.description || 'Accident photo'} />
        ) : (
          <span className="rp-photo-empty">
            {detail ? 'No photo attached' : 'Loading photo...'}
          </span>
        )}
        <span className={`rp-sev sev-${sev}`}>{row.severity || 'unclassified'}</span>
        {images.length > 1 && (
          <div className="rp-dots" aria-hidden="true">
            {images.map((img, i) => (
              <i key={img.id} className={i === photo ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>

      <div className="rp-body">
        <div className="rp-top">
          <span className="rp-ref">{row.report_reference}</span>
          <span className={`badge badge-${row.status}`}>
            {String(row.status || '').replace(/_/g, ' ')}
          </span>
        </div>

        <h3 className="rp-title">{row.title}</h3>
        <p className="rp-loc">{row.location}</p>

        <div className="rp-stats">
          <Stat label="Vehicles" value={row.vehicles_involved || 0} />
          <Stat label="Injuries" value={row.injuries || 0} tone={row.injuries ? 'is-warn' : ''} />
          <Stat label="Fatalities" value={row.fatalities || 0} tone={row.fatalities ? 'is-danger' : ''} />
        </div>

        {description && <p className="rp-desc">{description}</p>}

        <dl className="rp-meta">
          <div><dt>Category</dt><dd>{row.category_name || 'Not set'}</dd></div>
          {row.vehicle_type && <div><dt>Vehicle</dt><dd>{row.vehicle_type}</dd></div>}
          {when && <div><dt>Occurred</dt><dd>{when}</dd></div>}
          <div><dt>Reported</dt><dd>{timeAgo(row.created_at)}</dd></div>
          <div><dt>Reporter</dt><dd>{row.reporter_name || 'Unknown'}</dd></div>
          {detail && <div><dt>Evidence</dt><dd>{fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'None'}</dd></div>}
        </dl>

        <p className="rp-hint">Click to open the full card</p>
      </div>
    </article>
  );
}

