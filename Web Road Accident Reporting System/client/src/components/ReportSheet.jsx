import { useEffect, useState } from 'react';
import { useEvidenceImages } from './EvidenceGallery';
import { useReportDetail } from './ReportPreview';

function formatStamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${time}, ${day}`;
}

// Selected-report sheet: the photo comes first with a close button over it, then
// who reported it and when, the title, the story, and the facts.
export default function ReportSheet({ report, onClose, onOpen, onRoute, canRoute, timeAgo }) {
  const detail = useReportDetail(report);
  const images = useEvidenceImages(report?.id, detail?.evidence);
  const [photo, setPhoto] = useState(0);

  useEffect(() => { setPhoto(0); }, [report?.id]);

  if (!report) return null;

  const row = { ...report, ...(detail || {}) };
  const sev = row.severity || 'unknown';
  const shot = images[Math.min(photo, images.length - 1)];
  const reporter = row.reporter_name || 'Unknown';
  const description = String(row.description || '').trim();

  return (
    <article className="msh" aria-label={`Report ${row.report_reference}`}>
      <div className={`msh-photo sev-${sev} ${shot ? '' : 'is-empty'}`}>
        {shot
          ? <img src={shot.url} alt={shot.description || 'Accident photo'} />
          : <span className="msh-photo-empty">{detail ? 'No photo attached' : 'Loading photo...'}</span>}

        <button type="button" className="msh-close" onClick={onClose} aria-label="Close report">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <span className="msh-sev">{row.severity || 'unclassified'}</span>

        {images.length > 1 && (
          <div className="msh-thumbs">
            {images.map((img, i) => (
              <button key={img.id} type="button" className={i === photo ? 'on' : ''} onClick={() => setPhoto(i)} aria-label={`Show photo ${i + 1}`}>
                <img src={img.url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="msh-body">
        <div className="msh-by">
          <span className="msh-avatar" aria-hidden="true">{reporter.charAt(0).toUpperCase()}</span>
          <span className="msh-who">{reporter}</span>
          <span className="msh-when">{formatStamp(row.created_at) || timeAgo(row.created_at)}</span>
        </div>

        <h3 className="msh-title">{row.title}</h3>
        <p className="msh-loc">{row.location}</p>
        {description && <p className="msh-desc">{description}</p>}

        <dl className="msh-box">
          <div><dt>Reference</dt><dd className="numeric">{row.report_reference}</dd></div>
          <div>
            <dt>Status</dt>
            <dd><span className={`badge badge-${row.status}`}>{String(row.status || '').replace(/_/g, ' ')}</span></dd>
          </div>
          <div><dt>Category</dt><dd>{row.category_name || 'Not set'}</dd></div>
          <div><dt>Vehicles</dt><dd className="numeric">{row.vehicles_involved || 0}</dd></div>
          <div><dt>Injuries</dt><dd className="numeric">{row.injuries || 0}</dd></div>
          <div><dt>Fatalities</dt><dd className="numeric">{row.fatalities || 0}</dd></div>
        </dl>

        <div className="msh-actions">
          <button type="button" className="btn btn-primary" onClick={onOpen}>Open full report</button>
          {canRoute && <button type="button" className="btn btn-secondary" onClick={onRoute}>Route here</button>}
        </div>
      </div>
    </article>
  );
}
