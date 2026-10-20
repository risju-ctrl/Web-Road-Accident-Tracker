import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../mapboxTheme.css';
import '../officerMap.css';
import api from '../services/api';

// Live map of the officers who are on duty, for admins. A green blinking dot is an officer whose
// browser has reported a position in the last few minutes; a grey dot is an officer who is on duty
// but was last seen longer ago. The list is refreshed every few seconds.

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const HAS_TOKEN = typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.trim().length > 0 && MAPBOX_TOKEN !== 'undefined';

const REFRESH_MS = 10 * 1000;
// Bulacan, shown until the first officer appears.
const DEFAULT_CENTER = [120.77, 14.9];

function ago(seconds) {
  if (seconds === null || seconds === undefined) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

// Marker body. Mapbox positions the outer element itself, so the pulse lives on a child.
// Text goes in through textContent, never as HTML.
function buildPin(officer) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'officer-pin';
  el.setAttribute('aria-label', `Officer ${officer.name}`);
  const ring = document.createElement('span');
  ring.className = 'officer-pin__ring';
  const dot = document.createElement('span');
  dot.className = 'officer-pin__dot';
  const name = document.createElement('span');
  name.className = 'officer-pin__name';
  name.textContent = officer.name;
  el.append(ring, dot, name);
  return el;
}

function buildPopup(officer) {
  const root = document.createElement('div');
  root.className = 'rw-popup';
  const name = document.createElement('strong');
  name.textContent = officer.name;
  const status = document.createElement('div');
  status.textContent = `${officer.live ? 'Live' : 'Last seen'} · ${ago(officer.seconds_ago)}`;
  const cases = document.createElement('div');
  cases.className = 'rw-popup__location';
  cases.textContent = `${officer.open_cases} open case${officer.open_cases === 1 ? '' : 's'}`;
  root.append(name, status, cases);
  if (officer.phone) {
    const phone = document.createElement('div');
    phone.className = 'rw-popup__location';
    phone.textContent = officer.phone;
    root.appendChild(phone);
  }
  return root;
}

export default function OfficerMap({ height = 460 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pinsRef = useRef(new Map()); // officer id -> { marker, el }
  const fittedRef = useRef(false);
  const [data, setData] = useState({ officers: [], on_duty: 0, not_sharing: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/officers/live');
      setData(res.data);
      setError('');
    } catch {
      setError('Could not refresh the officer locations. Retrying…');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // One map for the life of the component.
  useEffect(() => {
    if (!HAS_TOKEN || !containerRef.current) return undefined;
    mapboxgl.accessToken = MAPBOX_TOKEN.trim();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: DEFAULT_CENTER,
      zoom: 9
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    mapRef.current = map;
    const pins = pinsRef.current;
    return () => {
      pins.forEach(({ marker }) => marker.remove());
      pins.clear();
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Keep the markers in step with the latest data: move, restyle, add and remove.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pins = pinsRef.current;
    const seen = new Set();

    for (const officer of data.officers) {
      seen.add(officer.id);
      const lngLat = [officer.longitude, officer.latitude];
      let pin = pins.get(officer.id);
      if (!pin) {
        const el = buildPin(officer);
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 18, maxWidth: '240px' }))
          .addTo(map);
        pin = { marker, el };
        pins.set(officer.id, pin);
      }
      pin.marker.setLngLat(lngLat);
      pin.marker.getPopup().setDOMContent(buildPopup(officer));
      pin.el.classList.toggle('is-live', officer.live);
      pin.el.classList.toggle('is-recent', !officer.live);
    }

    for (const [id, pin] of pins) {
      if (!seen.has(id)) { pin.marker.remove(); pins.delete(id); }
    }

    // Frame everyone once, on the first data. After that the admin's own panning is left alone.
    if (!fittedRef.current && data.officers.length > 0) {
      fittedRef.current = true;
      const bounds = new mapboxgl.LngLatBounds();
      data.officers.forEach((o) => bounds.extend([o.longitude, o.latitude]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
    }
  }, [data]);

  const showAll = () => {
    const map = mapRef.current;
    if (!map || data.officers.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    data.officers.forEach((o) => bounds.extend([o.longitude, o.latitude]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
  };

  const focus = (officer) => {
    const map = mapRef.current;
    const pin = pinsRef.current.get(officer.id);
    if (!map || !pin) return;
    map.flyTo({ center: [officer.longitude, officer.latitude], zoom: Math.max(map.getZoom(), 14) });
    if (!pin.marker.getPopup().isOpen()) pin.marker.togglePopup();
  };

  const liveCount = data.officers.filter((o) => o.live).length;

  return (
    <section className="card officer-live" aria-label="Officers on duty">
      <div className="officer-live__head">
        <div>
          <h2>Officers on duty</h2>
          <p className="officer-live__sub">
            {loaded
              ? `${data.on_duty} on duty · ${liveCount} live${data.not_sharing > 0 ? ` · ${data.not_sharing} not sharing a location` : ''}`
              : 'Loading…'}
          </p>
        </div>
        <div className="officer-live__legend" aria-hidden="true">
          <span><i className="officer-legend officer-legend--live" /> Live</span>
          <span><i className="officer-legend officer-legend--recent" /> Last seen</span>
          <button type="button" className="btn btn-secondary" onClick={showAll} disabled={data.officers.length === 0}>Show all</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!HAS_TOKEN ? (
        <div className="officer-live__empty">
          Add <code>VITE_MAPBOX_TOKEN</code> to <code>client/.env</code> and restart the dev server to see the map.
        </div>
      ) : (
        <div className="officer-live__body">
          <div className="rw-mapbox officer-live__map" style={{ height }}>
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>
          <ul className="officer-live__list" aria-label="Officers">
            {loaded && data.officers.length === 0 && (
              <li className="officer-live__none">
                No officer is sharing a location. Officers appear here after they switch to <b>On duty</b> and allow location in their browser.
              </li>
            )}
            {data.officers.map((o) => (
              <li key={o.id}>
                <button type="button" className="officer-row" onClick={() => focus(o)}>
                  <i className={`officer-legend ${o.live ? 'officer-legend--live' : 'officer-legend--recent'}`} aria-hidden="true" />
                  <span>
                    <b>{o.name}</b>
                    <small>
                      {o.live ? 'Live' : 'Last seen'} · {ago(o.seconds_ago)} · {o.open_cases} open case{o.open_cases === 1 ? '' : 's'}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
