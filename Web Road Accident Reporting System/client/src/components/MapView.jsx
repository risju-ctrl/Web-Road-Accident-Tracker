import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../mapboxTheme.css';
import { useAuth } from '../context/AuthContext';
import { useThemeColors } from '../theme';

// Mapbox public token (starts with "pk.") from client/.env.
// Vite exposes VITE_ variables in browser code.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const HAS_TOKEN =
  typeof MAPBOX_TOKEN === 'string' &&
  MAPBOX_TOKEN.trim().length > 0 &&
  MAPBOX_TOKEN !== 'undefined';

if (HAS_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN.trim();
}

// Philippines boundaries, as [lng, lat] corners (south-west, north-east).
const PH_BOUNDS = [
  [116.0, 4.5],
  [127.0, 21.5]
];

// Public props keep the old Leaflet convention: centres are [lat, lng] and zoom
// is a Leaflet zoom. Mapbox GL uses [lng, lat] and its tiles are twice the size,
// so its zoom is one lower for the same view. toMapboxZoom converts.
const PH_CENTER = [12.8797, 121.774];
const PH_MIN_ZOOM = 7;
const PH_MAX_ZOOM = 19;

const toMapboxZoom = (leafletZoom) => leafletZoom - 1;
const toLngLat = (lat, lng) => [Number(lng), Number(lat)];

// The selectable basemaps. `terrain` also turns on 3D relief and tilts the map.
const MAP_STYLES = {
  night: 'mapbox://styles/mapbox/dark-v11',
  streets: 'mapbox://styles/mapbox/streets-v12',
  muted: 'mapbox://styles/mapbox/light-v11',
  // Mapbox Standard, the map shown on mapbox.com: the same style flat (2D) or
  // tilted with extruded buildings (3D). It runs in its night look to suit the app.
  '2d': 'mapbox://styles/mapbox/standard',
  '3d': 'mapbox://styles/mapbox/standard',
  terrain: 'mapbox://styles/mapbox/outdoors-v12'
};

const STANDARD_LIGHT_PRESET = 'night';

// Styles that start tilted: 3D buildings, or terrain relief.
const startsIn3D = (key) => key === '3d' || key === 'terrain';
const isStandard = (key) => key === '2d' || key === '3d';

// Exported so the map page can render a switcher without repeating this list.
// These keys are also the accepted values of the `basemap` prop.
export const BASEMAPS = [
  { key: 'night', label: 'Night' },
  { key: 'streets', label: 'Streets' },
  { key: 'muted', label: 'Muted' },
  { key: '2d', label: '2D' },
  { key: '3d', label: '3D' },
  { key: 'terrain', label: 'Terrain' }
];

const TERRAIN_PITCH = 60;
const TERRAIN_BEARING = -15;
const TERRAIN_EXAGGERATION = 1.5;

// `basemap` is one of the BASEMAPS keys, or null for the site's dark style.
function resolveStyleKey(basemap) {
  return MAP_STYLES[basemap] ? basemap : 'night';
}

function hasCoordinates(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    latitude === '' ||
    longitude === ''
  ) {
    return false;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// Mapbox only understands some CSS colour syntaxes, while the theme colours may
// be written in any of them (for example hsl with spaces). The browser resolves
// whatever it is given to plain rgb values, which Mapbox always accepts.
let colorContext = null;
const colorCache = new Map();

function cssColor(value, fallback = '#8a8a8a') {
  if (!value || typeof value !== 'string') return fallback;
  if (colorCache.has(value)) return colorCache.get(value);

  let resolved = fallback;

  try {
    if (!colorContext) {
      colorContext = document
        .createElement('canvas')
        .getContext('2d', { willReadFrequently: true });
    }

    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = '#000000';
    colorContext.fillStyle = value;
    colorContext.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = colorContext.getImageData(0, 0, 1, 1).data;
    resolved = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  } catch (error) {
    resolved = fallback;
  }

  colorCache.set(value, resolved);
  return resolved;
}

const EMPTY = { type: 'FeatureCollection', features: [] };

// Below this Mapbox zoom, nearby pins merge into numbered clusters. At and above it
// the individual pins (with their blips and report numbers) take over.
const CLUSTER_ZOOM = 11;

const PIN_LAYERS = [
  'rw-pin-pulse-fast',
  'rw-pin-pulse-mid',
  'rw-pin-pulse-slow',
  'rw-pin-halo',
  'rw-pin-core'
];
const CLUSTER_LAYERS = ['rw-cluster-halo', 'rw-cluster-core', 'rw-cluster-count', 'rw-cluster-single'];

// "rgba(r,g,b,a)" from cssColor with a different alpha, for the heatmap ramp.
function withAlpha(color, alpha) {
  const match = /rgba?\(([^)]+)\)/.exec(color || '');
  if (!match) return color;
  const [r, g, b] = match[1].split(',').map((part) => part.trim());
  return `rgba(${r},${g},${b},${alpha})`;
}

// Heatmap and clustering are switched on and off without rebuilding layers: layers
// are hidden, and the pin layers are told to start drawing at the cluster zoom.
function applyLayerModes(map, { heatmap, cluster }) {
  const show = (id, on) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  };
  const range = (id, min, max) => {
    if (map.getLayer(id)) map.setLayerZoomRange(id, min, max);
  };

  show('rw-heat', heatmap);
  CLUSTER_LAYERS.forEach((id) => show(id, cluster));

  const from = cluster ? CLUSTER_ZOOM : 0;
  PIN_LAYERS.forEach((id) => range(id, from, 24));
  range('rw-pin-label-short', from, 12);
}

// RA-2026-000042 -> #0042. Short enough to sit under a pin without crowding it.
export function shortRef(reference) {
  const tail = String(reference || '').split('-').pop() || '';
  const digits = tail.replace(/\D/g, '');
  if (!digits) return String(reference || '');
  return `#${digits.replace(/^0+/, '').padStart(4, '0')}`;
}

// Pulse speed by urgency: the worse the incident, the faster the blip.
export const BLIP_TIERS = [
  { key: 'fast', period: 0.9 },
  { key: 'mid', period: 1.5 },
  { key: 'slow', period: 2.4 }
];
const TIER_OF = { fatal: 'fast', major: 'fast', moderate: 'mid', minor: 'slow' };

// Zone radii are in metres, but circle layers take pixels. At zoom 20 one pixel
// covers about 0.07464 m x cos(latitude), and every zoom level below doubles it, so
// the zone is described at zoom 20 (zoneR20) and scaled down exponentially.
function zoneRadius(k = 1) {
  return [
    'interpolate', ['exponential', 2], ['zoom'],
    0, ['*', ['get', 'zoneR20'], Math.pow(2, -20) * k],
    22, ['*', ['get', 'zoneR20'], 4 * k]
  ];
}

const LABEL_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

function pointFeature(lng, lat, properties = {}) {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [lng, lat] }
  };
}

function lineFeature(path) {
  return {
    type: 'FeatureCollection',
    features: path && path.length > 1
      ? [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: path.map(([lat, lng]) => [Number(lng), Number(lat)])
        }
      }]
      : []
  };
}

function boundsOf(path) {
  const bounds = new mapboxgl.LngLatBounds();
  path.forEach(([lat, lng]) => bounds.extend([Number(lng), Number(lat)]));
  return bounds;
}

function setSourceData(map, id, data) {
  const source = map.getSource(id);
  if (source) source.setData(data);
}

// 3D relief, sky and horizon haze. Must be re-applied after every style change,
// because switching style discards sources, terrain and fog.
function applyTerrain(map, on) {
  if (on) {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });
    }

    map.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION });

    map.setFog({
      color: 'rgb(30, 32, 36)',
      'high-color': 'rgb(40, 46, 60)',
      'horizon-blend': 0.08,
      'space-color': 'rgb(10, 10, 12)',
      'star-intensity': 0.15
    });

    if (!map.getLayer('rw-sky')) {
      addTopLayer(map, {
        id: 'rw-sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0, 90],
          'sky-atmosphere-sun-intensity': 6
        }
      });
    }
  } else {
    map.setTerrain(null);
    map.setFog(null);
    if (map.getLayer('rw-sky')) map.removeLayer('rw-sky');
  }
}

// Applies the flat or 3D look for the current style. On Mapbox Standard that
// means showing or hiding the extruded buildings; Standard manages its own sky
// and fog. Other styles get terrain relief, sky and fog, or have them removed.
function applyScene(map, styleKey, threeD) {
  if (isStandard(styleKey)) {
    try {
      map.setConfigProperty('basemap', 'lightPreset', STANDARD_LIGHT_PRESET);
      map.setConfigProperty('basemap', 'show3dObjects', threeD);
    } catch (error) { /* style is still loading; style.load applies this again */ }
    return;
  }

  applyTerrain(map, threeD);
}

// Layers go in Standard's top slot so pins draw above its 3D buildings. Other
// styles have no slots and ignore the setting.
function addTopLayer(map, layer) {
  map.addLayer({ slot: 'top', ...layer });
}

// A small 2D/3D button under the zoom controls. It always shows the view you
// would switch to, like the toggle on mapbox.com.
class ViewToggleControl {
  constructor(onToggle) {
    this.onToggle = onToggle;
    this.button = null;
    this.container = null;
  }

  onAdd() {
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'rw-view-toggle';
    this.button.addEventListener('click', () => this.onToggle());

    this.container.appendChild(this.button);
    return this.container;
  }

  onRemove() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.button = null;
  }

  setMode(threeD) {
    if (!this.button) return;
    this.button.textContent = threeD ? '2D' : '3D';
    this.button.title = threeD ? 'Switch to flat 2D view' : 'Switch to 3D terrain view';
    this.button.setAttribute('aria-label', this.button.title);
  }
}

// Creates the Mapbox map once and keeps its style in step with `styleKey`.
// `styleVersion` goes up every time a style finishes loading, so callers know
// when to add their layers again. The 2D/3D button works on every style; the
// Terrain style simply starts in 3D and the others start flat.
function useMapboxMap(containerRef, { center, zoom, styleKey }) {
  const [map, setMap] = useState(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [threeD, setThreeD] = useState(startsIn3D(styleKey));
  const styleKeyRef = useRef(styleKey);
  const appliedStyle = useRef(styleKey);
  const threeDRef = useRef(threeD);
  const appliedThreeD = useRef(threeD);
  const toggleRef = useRef(null);

  styleKeyRef.current = styleKey;
  threeDRef.current = threeD;

  useEffect(() => {
    if (!HAS_TOKEN || !containerRef.current) return undefined;

    const terrain = threeDRef.current;
    appliedThreeD.current = terrain;

    const instance = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[styleKeyRef.current],
      center,
      zoom,
      minZoom: toMapboxZoom(PH_MIN_ZOOM),
      maxZoom: PH_MAX_ZOOM,
      maxBounds: PH_BOUNDS,
      pitch: terrain ? TERRAIN_PITCH : 0,
      bearing: terrain ? TERRAIN_BEARING : 0,
      antialias: true
    });

    instance.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-left'
    );

    const toggle = new ViewToggleControl(() => setThreeD((value) => !value));
    instance.addControl(toggle, 'top-left');
    toggle.setMode(terrain);
    toggleRef.current = toggle;

    instance.on('style.load', () => {
      applyScene(instance, styleKeyRef.current, threeDRef.current);
      setStyleVersion((version) => version + 1);
    });

    appliedStyle.current = styleKeyRef.current;
    setMap(instance);

    return () => {
      instance.remove();
      setMap(null);
    };
    // The map is created once; centre and zoom are only its starting view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching style resets the view: 3D for the 3D and Terrain styles, flat for
  // the others. 2D and 3D share one Mapbox style, so that switch only changes
  // the look instead of reloading the map.
  useEffect(() => {
    if (!map || appliedStyle.current === styleKey) return;

    const terrain = startsIn3D(styleKey);
    const sameStyle = MAP_STYLES[appliedStyle.current] === MAP_STYLES[styleKey];

    appliedStyle.current = styleKey;
    appliedThreeD.current = terrain;
    threeDRef.current = terrain;
    setThreeD(terrain);

    if (sameStyle) {
      applyScene(map, styleKey, terrain);
    } else {
      map.setStyle(MAP_STYLES[styleKey], { diff: false });
    }

    map.easeTo({
      pitch: terrain ? TERRAIN_PITCH : 0,
      bearing: terrain ? TERRAIN_BEARING : 0,
      duration: 1200
    });
  }, [map, styleKey]);

  // The 2D/3D button: turns relief on or off and tilts or flattens the map.
  useEffect(() => {
    if (toggleRef.current) toggleRef.current.setMode(threeD);

    if (!map || appliedThreeD.current === threeD) return;

    appliedThreeD.current = threeD;

    try {
      applyScene(map, styleKeyRef.current, threeD);
    } catch (error) {
      // The style is still loading; style.load applies the current mode.
    }

    map.easeTo({
      pitch: threeD ? TERRAIN_PITCH : 0,
      bearing: threeD ? TERRAIN_BEARING : 0,
      duration: 1000
    });
  }, [map, threeD]);

  // Mapbox caches its size, so it has to be told to re-measure whenever the pane
  // changes: the drawer opening, the alert bar wrapping, or the window resizing.
  useEffect(() => {
    if (!map) return undefined;

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());

    return () => observer.disconnect();
  }, [map]);

  return { map, styleVersion };
}

function MissingToken({ height }) {
  return (
    <div
      className="rw-map-missing"
      style={{ height, width: '100%', borderRadius: '8px' }}
    >
      <strong>Map unavailable</strong>
      <span>
        Add <code>VITE_MAPBOX_TOKEN</code> to <code>client/.env</code> and restart the dev server.
      </span>
    </div>
  );
}

// Builds the popup body with DOM nodes and textContent, so report text is never
// interpreted as HTML.
function buildPopupContent(report, canViewDetails) {
  const root = document.createElement('div');
  root.className = 'rw-popup';

  const reference = document.createElement('strong');
  reference.textContent = report.report_reference || '';
  root.appendChild(reference);

  // Dashboard map rows carry no title, so the line is skipped rather than left blank.
  if (report.title) {
    const title = document.createElement('div');
    title.textContent = report.title;
    root.appendChild(title);
  }

  const location = document.createElement('div');
  location.className = 'rw-popup__location';
  location.textContent = report.location || '';
  root.appendChild(location);

  const badgeWrap = document.createElement('div');
  badgeWrap.className = 'rw-popup__status';
  const badge = document.createElement('span');
  badge.className = `badge badge-${report.status}`;
  badge.textContent = String(report.status || '').replace(/_/g, ' ');
  badgeWrap.appendChild(badge);
  root.appendChild(badgeWrap);

  if (canViewDetails) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary rw-popup__button';
    button.textContent = 'View Details';
    button.addEventListener('click', () => {
      window.open(`/reports/${report.id}`, '_blank', 'noopener,noreferrer');
    });
    root.appendChild(button);
  }

  return root;
}

function openReportPopup(map, report, lngLat, canViewDetails) {
  new mapboxgl.Popup({ offset: 14, maxWidth: '280px' })
    .setLngLat(lngLat)
    .setDOMContent(buildPopupContent(report, canViewDetails))
    .addTo(map);
}

// Severity drives the pin colour on the operations map, following the same
// green-to-red ramp the rest of the app uses for danger levels.
const SEVERITY_COLOR_KEYS = {
  minor: 'green',
  moderate: 'amber',
  major: 'orange',
  fatal: 'red'
};

// Adds the sources and layers the report map draws. Safe to call repeatedly: it
// is run after each style load, when Mapbox has dropped everything custom.
function ensureReportLayers(map, colors) {
  const sources = ['rw-zones', 'rw-route', 'rw-active', 'rw-focus', 'rw-picked', 'rw-pins', 'rw-heat', 'rw-me'];

  sources.forEach((id) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  });

  // The cluster source merges nearby points itself. `worst` keeps the lowest severity
  // rank in each cluster (0 = fatal), which colours it.
  if (!map.getSource('rw-clusters')) {
    map.addSource('rw-clusters', {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: CLUSTER_ZOOM - 1,
      clusterProperties: { worst: ['min', ['get', 'rank']] }
    });
  }

  const line = (id, source, paint) => {
    if (map.getLayer(id)) return;
    addTopLayer(map, {
      id,
      type: 'line',
      source,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint
    });
  };

  // Heatmap sits under everything else. Severity sets each report's weight, and it
  // fades out once the map is zoomed in far enough to see single pins.
  if (!map.getLayer('rw-heat')) {
    addTopLayer(map, {
      id: 'rw-heat',
      type: 'heatmap',
      source: 'rw-heat',
      maxzoom: 17,
      layout: { visibility: 'none' },
      paint: {
        'heatmap-weight': ['get', 'w'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 15, 2.2],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.2, withAlpha(colors.amber, 0.4),
          0.5, withAlpha(colors.orange, 0.65),
          0.8, withAlpha(colors.red, 0.85),
          1, colors.red
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 16, 12, 32, 16, 64],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.9, 17, 0]
      }
    });
  }

  // Hotspot zones: a soft glow, a translucent disc with a ring, and one expanding
  // ring per speed tier that the blip animation drives.
  const zone = (id, paint, extra = {}) => {
    if (map.getLayer(id)) return;
    addTopLayer(map, {
      id,
      type: 'circle',
      source: 'rw-zones',
      paint: { 'circle-pitch-alignment': 'map', ...paint },
      ...extra
    });
  };

  zone('rw-zone-glow', {
    'circle-radius': zoneRadius(1.18),
    'circle-color': colors.red,
    'circle-opacity': 0.16,
    'circle-blur': 0.9
  });
  zone('rw-zone-fill', {
    'circle-radius': zoneRadius(1),
    'circle-color': colors.red,
    'circle-opacity': 0.12,
    'circle-stroke-color': colors.red,
    'circle-stroke-width': 1.5,
    'circle-stroke-opacity': 0.55
  });
  BLIP_TIERS.forEach((tier) => {
    zone(`rw-zone-pulse-${tier.key}`, {
      'circle-radius': zoneRadius(1),
      'circle-color': colors.red,
      'circle-opacity': 0,
      'circle-stroke-color': colors.red,
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.6
    }, { filter: ['==', ['get', 'tier'], tier.key] });
  });

  // A dark casing under the line keeps it readable on the pale basemaps.
  line('rw-route-casing', 'rw-route', {
    'line-color': '#0b1220',
    'line-width': 8,
    'line-opacity': 0.5
  });
  line('rw-route-line', 'rw-route', {
    'line-color': colors.accent,
    'line-width': 4,
    'line-opacity': 0.9
  });
  line('rw-active-line', 'rw-active', {
    'line-color': colors.amber,
    'line-width': 6,
    'line-opacity': 1
  });

  if (!map.getLayer('rw-focus-ring')) {
    addTopLayer(map, {
      id: 'rw-focus-ring',
      type: 'circle',
      source: 'rw-focus',
      paint: {
        'circle-radius': 18,
        'circle-color': colors.amber,
        'circle-opacity': 0.35,
        'circle-stroke-color': colors.amber,
        'circle-stroke-width': 1.5
      }
    });
  }

  if (!map.getLayer('rw-picked-points')) {
    addTopLayer(map, {
      id: 'rw-picked-points',
      type: 'circle',
      source: 'rw-picked',
      paint: {
        'circle-radius': 7,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#0b1220',
        'circle-stroke-width': 2
      }
    });
  }

  // Expanding blip behind each pin, one layer per speed tier.
  BLIP_TIERS.forEach((tier) => {
    const id = `rw-pin-pulse-${tier.key}`;
    if (map.getLayer(id)) return;
    addTopLayer(map, {
      id,
      type: 'circle',
      source: 'rw-pins',
      filter: ['all', ['==', ['get', 'pulse'], 1], ['==', ['get', 'tier'], tier.key]],
      paint: {
        'circle-radius': ['get', 'pulseR'],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.4,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.8,
        'circle-pitch-alignment': 'map'
      }
    });
  });

  if (!map.getLayer('rw-pin-halo')) {
    addTopLayer(map, {
      id: 'rw-pin-halo',
      type: 'circle',
      source: 'rw-pins',
      filter: ['>', ['get', 'haloR'], 0],
      paint: {
        'circle-radius': ['get', 'haloR'],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'haloOpacity'],
        'circle-blur': 0.7,
        'circle-pitch-alignment': 'map'
      }
    });
  }

  // Report numbers under the pins. The short form shows when zoomed out and the
  // full reference once there is room. Worst severity wins when labels collide.
  const label = (id, field, minzoom, maxzoom) => {
    if (map.getLayer(id)) return;
    addTopLayer(map, {
      id,
      type: 'symbol',
      source: 'rw-pins',
      minzoom,
      maxzoom,
      filter: ['==', ['get', 'label'], 1],
      layout: {
        'text-field': ['get', field],
        'text-font': LABEL_FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 12],
        'text-offset': [0, 1.15],
        'text-anchor': 'top',
        'text-optional': true,
        'text-allow-overlap': false,
        'symbol-sort-key': ['get', 'rank']
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(11,18,32,0.92)',
        'text-halo-width': 1.6
      }
    });
  };

  if (!map.getLayer('rw-pin-core')) {
    addTopLayer(map, {
      id: 'rw-pin-core',
      type: 'circle',
      source: 'rw-pins',
      paint: {
        'circle-radius': ['get', 'coreR'],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': ['get', 'stroke'],
        'circle-stroke-width': ['get', 'strokeW']
      }
    });
  }

  label('rw-pin-label-short', 'labelShort', 0, 12);
  label('rw-pin-label-full', 'labelFull', 12, 24);

  // Zoomed-out clusters: a numbered disc coloured by the worst severity inside, and a
  // plain dot for a report that has no neighbours, so lone reports never disappear.
  const clusterColor = [
    'match', ['get', 'worst'],
    0, colors.red,
    1, colors.orange,
    2, colors.amber,
    3, colors.green,
    colors.muted
  ];
  const hasCount = ['has', 'point_count'];

  if (!map.getLayer('rw-cluster-halo')) {
    addTopLayer(map, {
      id: 'rw-cluster-halo',
      type: 'circle',
      source: 'rw-clusters',
      maxzoom: CLUSTER_ZOOM,
      filter: hasCount,
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 26, 5, 32, 15, 40],
        'circle-color': clusterColor,
        'circle-opacity': 0.22,
        'circle-blur': 0.6
      }
    });
  }

  if (!map.getLayer('rw-cluster-core')) {
    addTopLayer(map, {
      id: 'rw-cluster-core',
      type: 'circle',
      source: 'rw-clusters',
      maxzoom: CLUSTER_ZOOM,
      filter: hasCount,
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 14, 5, 18, 15, 23],
        'circle-color': clusterColor,
        'circle-stroke-color': 'rgba(255,255,255,0.85)',
        'circle-stroke-width': 1.5
      }
    });
  }

  if (!map.getLayer('rw-cluster-count')) {
    addTopLayer(map, {
      id: 'rw-cluster-count',
      type: 'symbol',
      source: 'rw-clusters',
      maxzoom: CLUSTER_ZOOM,
      filter: hasCount,
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': LABEL_FONT,
        'text-size': 12,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(11,18,32,0.85)',
        'text-halo-width': 1.4
      }
    });
  }

  if (!map.getLayer('rw-cluster-single')) {
    addTopLayer(map, {
      id: 'rw-cluster-single',
      type: 'circle',
      source: 'rw-clusters',
      maxzoom: CLUSTER_ZOOM,
      filter: ['!', hasCount],
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#0b1220',
        'circle-stroke-width': 1.5
      }
    });
  }

  // The visitor's own position, drawn last so it is never hidden under a pin.
  if (!map.getLayer('rw-me-halo')) {
    addTopLayer(map, {
      id: 'rw-me-halo',
      type: 'circle',
      source: 'rw-me',
      paint: {
        'circle-radius': 16,
        'circle-color': '#3b82f6',
        'circle-opacity': 0.25,
        'circle-pitch-alignment': 'map'
      }
    });
  }

  if (!map.getLayer('rw-me-dot')) {
    addTopLayer(map, {
      id: 'rw-me-dot',
      type: 'circle',
      source: 'rw-me',
      paint: {
        'circle-radius': 6,
        'circle-color': '#3b82f6',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5
      }
    });
  }
}

export function ReportMap({
  reports = [],
  center = PH_CENTER,
  zoom = PH_MIN_ZOOM,
  height = 400,
  focus = null,
  colorBySeverity = false,
  colorFor = null,
  glow = false,
  activeId = null,
  fitToReports = false,
  basemap = null,
  routePath = null,
  activePath = null,
  pickedPoints = [],
  onMapPick = null,
  // Pin labels, hover preview and click-to-select. When onSelect is given a click
  // selects the report in the page instead of opening Mapbox's own popup.
  showLabels = false,
  hoverId = null,
  onHover = null,
  onSelect = null,
  // Hotspot zones ({ id, latitude, longitude, radiusM, tier, count }) and the blip.
  zones = [],
  blip = false,
  onZoneSelect = null,
  // Heat layer, zoomed-out clusters, and the visitor's own position ({ latitude, longitude }).
  heatmap = false,
  cluster = false,
  me = null
}) {
  const { user } = useAuth();
  const c = useThemeColors();
  const containerRef = useRef(null);
  const styleKey = resolveStyleKey(basemap);

  const { map, styleVersion } = useMapboxMap(containerRef, {
    center: toLngLat(center[0], center[1]),
    zoom: toMapboxZoom(zoom),
    styleKey
  });

  // Handlers registered once on the map read the latest values through refs.
  const reportsById = useRef(new Map());
  const userRef = useRef(user);
  const onMapPickRef = useRef(onMapPick);
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  const onZoneSelectRef = useRef(onZoneSelect);

  userRef.current = user;
  onMapPickRef.current = onMapPick;
  onHoverRef.current = onHover;
  onSelectRef.current = onSelect;
  onZoneSelectRef.current = onZoneSelect;

  const colors = useMemo(() => ({
    accent: cssColor(c.accent, '#efe2b0'),
    amber: cssColor(c.amber, '#f5b82e'),
    green: cssColor(c.green, '#34d399'),
    red: cssColor(c.red, '#f87171'),
    orange: cssColor(c.orange, '#fb923c'),
    muted: cssColor(c.muted, '#8a8a8a')
  }), [c]);

  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // Pins: the active report is drawn last, so it sits on top of its neighbours.
  const pinData = useMemo(() => {
    const ordered = glow && activeId != null
      ? [...reports.filter((r) => r.id !== activeId), ...reports.filter((r) => r.id === activeId)]
      : reports;

    const features = [];

    ordered.forEach((report) => {
      if (!hasCoordinates(report.latitude, report.longitude)) return;

      const [lng, lat] = toLngLat(report.latitude, report.longitude);
      const on = report.id === activeId;

      let color = colors.accent;
      let haloR = 0;
      let haloOpacity = 0;
      let coreR = 8;
      let stroke = '#0b1220';
      let strokeW = 2;
      const hot = hoverId != null && report.id === hoverId;

      if (colorBySeverity) {
        // A wide translucent halo behind a solid core reads as a hotspot pin.
        const key = SEVERITY_COLOR_KEYS[report.severity];
        color = (key && colors[key]) || colors.muted;
        haloR = 16;
        haloOpacity = 0.22;
        coreR = 6;
        stroke = color;
        strokeW = 1.5;

        if (hot) {
          haloR = 30;
          haloOpacity = 0.35;
          coreR = 8;
          stroke = '#ffffff';
          strokeW = 2.5;
        }
      } else if (colorFor) {
        // `colorFor` lets a caller (the dashboard) colour pins by its own
        // field, such as verified versus still-pending.
        color = cssColor(colorFor(report), colors.muted);

        if (glow) {
          haloR = on ? 30 : 20;
          haloOpacity = on ? 0.28 : 0.2;
          coreR = on ? 7.5 : 6;
          stroke = on ? '#ffffff' : '#0b1220';
          strokeW = on ? 2.5 : 1.5;
        } else {
          coreR = 7;
        }
      }

      features.push(pointFeature(lng, lat, {
        id: report.id,
        label: showLabels ? 1 : 0,
        pulse: blip && colorBySeverity ? 1 : 0,
        tier: TIER_OF[report.severity] || 'slow',
        pulseR: 10,
        labelShort: shortRef(report.report_reference),
        labelFull: report.report_reference || '',
        rank: { fatal: 0, major: 1, moderate: 2, minor: 3 }[report.severity] ?? 4,
        w: { fatal: 1, major: 0.75, moderate: 0.5, minor: 0.3 }[report.severity] ?? 0.3,
        color,
        haloR,
        haloOpacity,
        coreR,
        stroke,
        strokeW
      }));
    });

    return { type: 'FeatureCollection', features };
  }, [reports, glow, activeId, colorBySeverity, colorFor, colors, showLabels, hoverId, blip]);

  const zoneData = useMemo(() => ({
    type: 'FeatureCollection',
    features: zones
      .filter((z) => hasCoordinates(z.latitude, z.longitude))
      .map((z) => pointFeature(Number(z.longitude), Number(z.latitude), {
        id: z.id,
        count: z.count,
        tier: z.tier || 'slow',
        zoneR20: z.radiusM / (0.07464 * Math.max(0.2, Math.cos((Number(z.latitude) * Math.PI) / 180)))
      }))
  }), [zones]);

  const reportPoints = useMemo(
    () => reports
      .filter((r) => hasCoordinates(r.latitude, r.longitude))
      .map((r) => [Number(r.latitude), Number(r.longitude)]),
    [reports]
  );

  useEffect(() => {
    reportsById.current = new Map(reports.map((r) => [r.id, r]));
  }, [reports]);

  // Clicks on a pin open its popup; clicks anywhere else can pick a route point.
  useEffect(() => {
    if (!map) return undefined;

    const onPinClick = (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;

      const report = reportsById.current.get(feature.properties.id);
      if (!report) return;

      if (onSelectRef.current) {
        onSelectRef.current(report);
        return;
      }

      const currentUser = userRef.current;
      const canViewDetails = Boolean(currentUser && currentUser.role !== 'reporter');

      openReportPopup(map, report, feature.geometry.coordinates.slice(), canViewDetails);
    };

    // Hover preview. The anchor is the pin's screen position, recomputed while the
    // map moves so the card stays attached to the pin it describes.
    let hovered = null;
    const emit = () => {
      if (!hovered || !onHoverRef.current) return;
      const point = map.project(hovered.coordinates);
      onHoverRef.current(hovered.report, { x: point.x, y: point.y });
    };
    const onPinMove = (event) => {
      const feature = event.features && event.features[0];
      if (!feature || !onHoverRef.current) return;

      const report = reportsById.current.get(feature.properties.id);
      if (!report) return;

      if (!hovered || hovered.report.id !== report.id) {
        hovered = { report, coordinates: feature.geometry.coordinates.slice() };
        emit();
      }
    };
    const onPinLeave = () => {
      hovered = null;
      if (onHoverRef.current) onHoverRef.current(null, null);
    };

    const onZoneClick = (event) => {
      let onPin = false;
      try {
        onPin = map.queryRenderedFeatures(event.point, { layers: ['rw-pin-core'] }).length > 0;
      } catch (error) { /* layer not drawn yet */ }
      const feature = event.features && event.features[0];
      if (onPin || !feature || !onZoneSelectRef.current) return;
      onZoneSelectRef.current(feature.properties.id);
    };

    const onMapClick = (event) => {
      if (onMapPickRef.current) {
        onMapPickRef.current(event.lngLat.lat, event.lngLat.lng);
      }
    };

    const pointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const reset = () => {
      map.getCanvas().style.cursor = onMapPickRef.current ? 'crosshair' : '';
    };

    // A click on a cluster zooms in to where it breaks apart into smaller groups.
    const onClusterClick = (event) => {
      const feature = event.features && event.features[0];
      const source = map.getSource('rw-clusters');
      if (!feature || !source) return;

      source.getClusterExpansionZoom(feature.properties.cluster_id, (error, zoomTo) => {
        if (error) return;
        map.easeTo({
          center: feature.geometry.coordinates,
          zoom: Math.min(zoomTo + 0.5, 17)
        });
      });
    };

    // Lone reports shown while zoomed out behave exactly like full pins.
    const pinLayers = ['rw-pin-core', 'rw-cluster-single'];

    pinLayers.forEach((layer) => {
      map.on('click', layer, onPinClick);
      map.on('mouseenter', layer, pointer);
      map.on('mouseleave', layer, reset);
      map.on('mousemove', layer, onPinMove);
      map.on('mouseleave', layer, onPinLeave);
    });
    map.on('click', onMapClick);
    map.on('click', 'rw-zone-fill', onZoneClick);
    map.on('click', 'rw-cluster-core', onClusterClick);
    map.on('mouseenter', 'rw-cluster-core', pointer);
    map.on('mouseleave', 'rw-cluster-core', reset);
    map.on('move', emit);

    return () => {
      pinLayers.forEach((layer) => {
        map.off('click', layer, onPinClick);
        map.off('mouseenter', layer, pointer);
        map.off('mouseleave', layer, reset);
        map.off('mousemove', layer, onPinMove);
        map.off('mouseleave', layer, onPinLeave);
      });
      map.off('click', onMapClick);
      map.off('click', 'rw-zone-fill', onZoneClick);
      map.off('click', 'rw-cluster-core', onClusterClick);
      map.off('mouseenter', 'rw-cluster-core', pointer);
      map.off('mouseleave', 'rw-cluster-core', reset);
      map.off('move', emit);
    };
  }, [map]);

  // The blip. Mapbox cannot animate by itself, so the radius and opacity of the pulse
  // layers are advanced on each frame (about 30 per second). Each tier has its own
  // period, which is what makes serious incidents blink faster. Skipped when the
  // visitor asks their system for reduced motion.
  useEffect(() => {
    if (!map || styleVersion === 0 || !blip) return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let frame = 0;
    let last = 0;

    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;

      try {
        BLIP_TIERS.forEach((tier) => {
          const phase = ((now / 1000) / tier.period) % 1;
          const fade = 1 - phase;
          const pin = `rw-pin-pulse-${tier.key}`;
          const ring = `rw-zone-pulse-${tier.key}`;

          if (map.getLayer(pin)) {
            map.setPaintProperty(pin, 'circle-radius', ['*', ['get', 'pulseR'], 1 + phase * 2.4]);
            map.setPaintProperty(pin, 'circle-opacity', fade * 0.45);
            map.setPaintProperty(pin, 'circle-stroke-opacity', fade * 0.9);
          }
          if (map.getLayer(ring)) {
            map.setPaintProperty(ring, 'circle-radius', zoneRadius(1 + phase * 0.22));
            map.setPaintProperty(ring, 'circle-stroke-opacity', fade * 0.8);
          }
        });
      } catch (error) {
        // The style is mid-switch; the loop carries on once it has loaded.
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map, styleVersion, blip]);

  useEffect(() => {
    if (map) map.getCanvas().style.cursor = onMapPick ? 'crosshair' : '';
  }, [map, onMapPick]);

  // Draws everything. Runs again after a style change, which wipes custom layers.
  useEffect(() => {
    if (!map || styleVersion === 0) return;

    try {
      ensureReportLayers(map, colorsRef.current);

      setSourceData(map, 'rw-zones', zoneData);
      setSourceData(map, 'rw-pins', pinData);
      setSourceData(map, 'rw-heat', pinData);
      setSourceData(map, 'rw-clusters', pinData);
      applyLayerModes(map, { heatmap, cluster });
      setSourceData(map, 'rw-me', {
        type: 'FeatureCollection',
        features: hasCoordinates(me?.latitude, me?.longitude)
          ? [pointFeature(Number(me.longitude), Number(me.latitude))]
          : []
      });
      setSourceData(map, 'rw-route', lineFeature(routePath));
      setSourceData(map, 'rw-active', lineFeature(activePath));

      setSourceData(map, 'rw-picked', {
        type: 'FeatureCollection',
        features: pickedPoints
          .filter((p) => hasCoordinates(p.latitude, p.longitude))
          .map((p) => pointFeature(Number(p.longitude), Number(p.latitude), {
            color: p.kind === 'start' ? colors.green : colors.red
          }))
      });

      setSourceData(map, 'rw-focus', {
        type: 'FeatureCollection',
        features: !glow && hasCoordinates(focus?.latitude, focus?.longitude)
          ? [pointFeature(Number(focus.longitude), Number(focus.latitude))]
          : []
      });
    } catch (error) {
      // A style is mid-switch; this effect runs again when it finishes loading.
    }
  }, [map, styleVersion, pinData, zoneData, routePath, activePath, pickedPoints, focus, glow, colors, heatmap, cluster, me]);

  useEffect(() => {
    if (map && hasCoordinates(focus?.latitude, focus?.longitude)) {
      map.flyTo({
        center: toLngLat(focus.latitude, focus.longitude),
        zoom: toMapboxZoom(15)
      });
    }
  }, [map, focus]);

  // Frames every report on screen, so a small dashboard map opens on the data it
  // is showing instead of on the whole country. A single report is centred at a
  // fixed zoom, because fitting one point would jump to the deepest tile.
  useEffect(() => {
    if (!map || !fitToReports || reportPoints.length === 0) return;

    if (reportPoints.length === 1) {
      map.easeTo({
        center: toLngLat(reportPoints[0][0], reportPoints[0][1]),
        zoom: toMapboxZoom(13)
      });
    } else {
      map.fitBounds(boundsOf(reportPoints), {
        padding: 30,
        maxZoom: toMapboxZoom(13)
      });
    }
  }, [map, reportPoints, fitToReports]);

  // While navigating, the map follows the current turn rather than the whole
  // route, so the next instruction is the thing on screen.
  useEffect(() => {
    if (!map) return;

    const path = activePath && activePath.length > 1 ? activePath : routePath;

    if (path && path.length > 1) {
      // Capped, because framing one short turn would otherwise zoom to street level.
      map.fitBounds(boundsOf(path), {
        padding: 40,
        maxZoom: toMapboxZoom(17)
      });
    }
  }, [map, routePath, activePath]);

  if (!HAS_TOKEN) return <MissingToken height={height} />;

  return (
    <div
      className="rw-mapbox"
      style={{
        height,
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

export function SingleReportMap({ report, height = 300 }) {
  const c = useThemeColors();
  const containerRef = useRef(null);

  const valid = Boolean(report) && hasCoordinates(report.latitude, report.longitude);
  const position = valid ? toLngLat(report.latitude, report.longitude) : PH_BOUNDS[0];

  const { map, styleVersion } = useMapboxMap(containerRef, {
    center: position,
    zoom: toMapboxZoom(15),
    styleKey: 'night'
  });

  const statusColor = cssColor(c.status?.[report?.status] || c.muted, '#8a8a8a');

  useEffect(() => {
    if (!map || !valid || styleVersion === 0) return undefined;

    try {
      if (!map.getSource('rw-single')) {
        map.addSource('rw-single', { type: 'geojson', data: EMPTY });
      }

      if (!map.getLayer('rw-single-area')) {
        addTopLayer(map, {
          id: 'rw-single-area',
          type: 'circle',
          source: 'rw-single',
          paint: {
            'circle-radius': 50,
            'circle-color': statusColor,
            'circle-opacity': 0.2,
            'circle-stroke-color': statusColor,
            'circle-stroke-width': 1.5
          }
        });
      }

      if (!map.getLayer('rw-single-pin')) {
        addTopLayer(map, {
          id: 'rw-single-pin',
          type: 'circle',
          source: 'rw-single',
          paint: {
            'circle-radius': 8,
            'circle-color': statusColor,
            'circle-stroke-color': '#0b1220',
            'circle-stroke-width': 2
          }
        });
      }

      setSourceData(map, 'rw-single', {
        type: 'FeatureCollection',
        features: [pointFeature(position[0], position[1])]
      });
    } catch (error) {
      return undefined;
    }

    const onPinClick = () => openReportPopup(map, report, position, false);
    const pointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const reset = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', 'rw-single-pin', onPinClick);
    map.on('mouseenter', 'rw-single-pin', pointer);
    map.on('mouseleave', 'rw-single-pin', reset);

    return () => {
      map.off('click', 'rw-single-pin', onPinClick);
      map.off('mouseenter', 'rw-single-pin', pointer);
      map.off('mouseleave', 'rw-single-pin', reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion, valid, report, statusColor]);

  if (!valid) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'hsl(var(--text-3))'
        }}
      >
        No location data
      </div>
    );
  }

  if (!HAS_TOKEN) return <MissingToken height={height} />;

  return (
    <div
      className="rw-mapbox"
      style={{
        height,
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
