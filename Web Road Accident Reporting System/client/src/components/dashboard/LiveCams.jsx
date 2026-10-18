import { useEffect, useRef, useState } from 'react';
import { LIVE_CAMS, CAM_DIRECTORIES, MORE_ROAD_CAMS } from './camList';
import './liveCamsPanel.css';

const ID_RE = /^[\w-]{11}$/;
const hasVideo = (cam) => ID_RE.test(cam.videoId || '');
const thumbSrc = (id) => `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`;

// Card previews: muted, no controls. The player is drawn larger than the card and
// cropped (see .lc-live) so YouTube's title bar and logo strip stay out of view.
const previewSrc = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1` +
  '&fs=0&rel=0&playsinline=1&iv_load_policy=3&modestbranding=1';
const playerSrc = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;

// Skip moving previews for people who asked for less motion or less data.
function canAutoPlay() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (navigator.connection?.saveData) return false;
  return true;
}

function CamCard({ cam, onOpen, autoPlay }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  // Load each preview only once its card scrolls into view.
  useEffect(() => {
    if (!autoPlay || !ref.current) return undefined;
    if (!('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setSeen(true); io.disconnect(); } },
      { rootMargin: '200px' }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [autoPlay]);

  // YouTube shows a pause button and title for the first few seconds. Keep the preview
  // hidden until they fade, then reveal it.
  useEffect(() => {
    if (!loaded) return undefined;
    const t = setTimeout(() => setReady(true), 4500);
    return () => clearTimeout(t);
  }, [loaded]);

  return (
    <article className="lc-card">
      <button
        ref={ref}
        type="button"
        className="lc-media"
        onClick={() => onOpen(cam)}
        aria-label={`Watch ${cam.name}, ${cam.city}`}
      >
        <img className="lc-img" src={thumbSrc(cam.videoId)} alt="" loading="lazy" />
        {autoPlay && seen && (
          <iframe
            className={`lc-live${ready ? ' is-ready' : ''}`}
            src={previewSrc(cam.videoId)}
            title={`Preview: ${cam.name}`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden="true"
            onLoad={() => setLoaded(true)}
          />
        )}
        <span className="lc-badge">Live</span>
        <span className="lc-where">{cam.city}</span>
      </button>
      <div className="lc-meta">
        <h3 className="lc-title">{cam.name}</h3>
        {cam.source && <p className="lc-sub">{cam.source}</p>}
      </div>
    </article>
  );
}

function CamModal({ cam, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="lc-modal"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={`${cam.name}, ${cam.city}`}
    >
      <div className="lc-modal-hd">
        <div>
          <h3 className="lc-title">{cam.name}</h3>
          <p className="lc-sub">{cam.city}</p>
        </div>
        <button type="button" className="lc-close" onClick={onClose}>Close</button>
      </div>
      <div className="lc-modal-video">
        <iframe
          src={playerSrc(cam.videoId)}
          title={`Live view: ${cam.name}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </dialog>
  );
}

export default function LiveCams({ cams = LIVE_CAMS }) {
  const [open, setOpen] = useState(null);
  const [autoPlay] = useState(canAutoPlay);
  const usable = cams.filter(hasVideo);

  if (!usable.length) {
    return (
      <div className="lc-empty">
        <p>No cameras are set up yet.</p>
        <p className="lc-sub">Add cameras in <code>camList.js</code>. To find cameras:</p>
        <ul className="lc-links">
          {CAM_DIRECTORIES.map((d) => (
            <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer">{d.name}</a></li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <div className="lc-grid">
        {usable.map((cam) => (
          <CamCard key={cam.id} cam={cam} onOpen={setOpen} autoPlay={autoPlay} />
        ))}
      </div>

      {MORE_ROAD_CAMS.length > 0 && (
        <div className="lc-more">
          <h3 className="lc-more-title">More road cameras</h3>
          <p className="lc-sub lc-more-note">These open on WorldCam in a new tab.</p>
          <ul className="lc-more-list">
            {MORE_ROAD_CAMS.map((c) => (
              <li key={c.url}>
                <a className="lc-more-item" href={c.url} target="_blank" rel="noopener noreferrer">
                  <span className="lc-more-name">{c.name}</span>
                  <span className="lc-sub">{c.city}</span>
                  <span className="lc-more-cta">Watch on WorldCam</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && <CamModal cam={open} onClose={() => setOpen(null)} />}
    </>
  );
}
