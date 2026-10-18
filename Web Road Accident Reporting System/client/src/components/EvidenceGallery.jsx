import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import '../evidenceGallery.css';

// Evidence files are private, so images are fetched with the auth header and shown
// from a blob URL. They are cached per report so re-selecting a report is instant.
const cache = new Map();

export function useEvidenceImages(reportId, evidence) {
  const [images, setImages] = useState([]);
  const sig = (evidence || []).map((e) => `${e.id}:${e.mime_type}`).join('|');

  useEffect(() => {
    let alive = true;
    const files = (evidence || []).filter((e) => String(e.mime_type || '').startsWith('image/'));
    if (!reportId || files.length === 0) {
      setImages([]);
      return undefined;
    }
    Promise.all(files.map(async (e) => {
      const key = `${reportId}:${e.id}`;
      if (!cache.has(key)) {
        try {
          const res = await api.get(`/reports/${reportId}/evidence/${e.id}`, { responseType: 'blob' });
          cache.set(key, URL.createObjectURL(res.data));
        } catch {
          return null;
        }
      }
      return { id: e.id, url: cache.get(key), name: e.file_name, description: e.description };
    })).then((list) => { if (alive) setImages(list.filter(Boolean)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, sig]);

  return images;
}

function Lightbox({ images, index, onIndex, onClose }) {
  const cur = images[index];
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [index, images.length, onIndex, onClose]);

  return createPortal(
    <div className="eg-lb" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
      <button type="button" className="eg-lb-x" onClick={onClose} aria-label="Close photo viewer">&times;</button>
      {images.length > 1 && (
        <button type="button" className="eg-lb-nav prev" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length); }} aria-label="Previous photo">&lsaquo;</button>
      )}
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={cur.url} alt={cur.description || cur.name || 'Accident photo'} />
        {(cur.description || images.length > 1) && (
          <figcaption>{cur.description}{cur.description && images.length > 1 ? ' \u00b7 ' : ''}{images.length > 1 ? `${index + 1} of ${images.length}` : ''}</figcaption>
        )}
      </figure>
      {images.length > 1 && (
        <button type="button" className="eg-lb-nav next" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % images.length); }} aria-label="Next photo">&rsaquo;</button>
      )}
    </div>,
    document.body
  );
}

// Renders nothing when there are no (loadable) pictures, so callers need no empty state.
export function Gallery({ images, variant = 'compact' }) {
  const [broken, setBroken] = useState(() => new Set());
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const ok = (images || []).filter((i) => !broken.has(i.id));
  if (ok.length === 0) return null;

  const idx = Math.min(active, ok.length - 1);
  const cur = ok[idx];
  const markBroken = (id) => setBroken((s) => new Set(s).add(id));

  return (
    <div className={`eg eg--${variant}`}>
      <button type="button" className="eg-hero" onClick={() => setOpen(true)} aria-label="View photo larger">
        <img src={cur.url} alt={cur.description || cur.name || 'Accident photo'} onError={() => markBroken(cur.id)} />
        {ok.length > 1 && <span className="eg-count">{idx + 1} / {ok.length}</span>}
      </button>
      {ok.length > 1 && (
        <div className="eg-thumbs">
          {ok.map((img, i) => (
            <button key={img.id} type="button" className={i === idx ? 'on' : ''} onClick={() => setActive(i)} aria-label={`Show photo ${i + 1}`}>
              <img src={img.url} alt="" onError={() => markBroken(img.id)} />
            </button>
          ))}
        </div>
      )}
      {open && <Lightbox images={ok} index={idx} onIndex={setActive} onClose={() => setOpen(false)} />}
    </div>
  );
}
