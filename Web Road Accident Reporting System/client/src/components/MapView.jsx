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
  const sources = ['rw-route', 'rw-active', 'rw-focus', 'rw-picked', 'rw-pins'];

  sources.forEach((id) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  });

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
  onMapPick = null
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

  userRef.current = user;
  onMapPickRef.current = onMapPick;

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

      if (colorBySeverity) {
        // A wide translucent halo behind a solid core reads as a hotspot pin.
        const key = SEVERITY_COLOR_KEYS[report.severity];
        color = (key && colors[key]) || colors.muted;
        haloR = 16;
        haloOpacity = 0.22;
        coreR = 6;
        stroke = color;
        strokeW = 1.5;
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
        color,
        haloR,
        haloOpacity,
        coreR,
        stroke,
        strokeW
      }));
    });

    return { type: 'FeatureCollection', features };
  }, [reports, glow, activeId, colorBySeverity, colorFor, colors]);

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

      const currentUser = userRef.current;
      const canViewDetails = Boolean(currentUser && currentUser.role !== 'reporter');

      openReportPopup(map, report, feature.geometry.coordinates.slice(), canViewDetails);
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

    map.on('click', 'rw-pin-core', onPinClick);
    map.on('click', onMapClick);
    map.on('mouseenter', 'rw-pin-core', pointer);
    map.on('mouseleave', 'rw-pin-core', reset);

    return () => {
      map.off('click', 'rw-pin-core', onPinClick);
      map.off('click', onMapClick);
      map.off('mouseenter', 'rw-pin-core', pointer);
      map.off('mouseleave', 'rw-pin-core', reset);
    };
  }, [map]);

  useEffect(() => {
    if (map) map.getCanvas().style.cursor = onMapPick ? 'crosshair' : '';
  }, [map, onMapPick]);

  // Draws everything. Runs again after a style change, which wipes custom layers.
  useEffect(() => {
    if (!map || styleVersion === 0) return;

    try {
      ensureReportLayers(map, colorsRef.current);

      setSourceData(map, 'rw-pins', pinData);
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
  }, [map, styleVersion, pinData, routePath, activePath, pickedPoints, focus, glow, colors]);

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
