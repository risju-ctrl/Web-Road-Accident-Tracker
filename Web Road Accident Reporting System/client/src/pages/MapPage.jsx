import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  VEHICLES,
  googleMapsDirectionsUrl,
  isSamePlace,
  planRoute,
  searchPlaces
} from '../services/routing';
import { BASEMAPS, ReportMap, shortRef } from '../components/MapView';
import ReportPreview from '../components/ReportPreview';
import ReportSheet from '../components/ReportSheet';
import ReplayBar from '../components/ReplayBar';
import InsightsPanel from '../components/InsightsPanel';
import { DAY, dayLabel, occurredAt, startOfDay, zonesOnRoute } from '../services/mapInsights';
import { useAuth } from '../context/AuthContext';
import '../mapSidebar.css';
import PlacePicker from '../components/PlacePicker';
import { useThemeName } from '../theme';

// The Philippines uses one national emergency number. Agency-specific hotlines
// are not configured anywhere in this system, so every contact card dials 911
// and says so rather than displaying a number that could be wrong.
const EMERGENCY_NUMBER = '911';

const ICONS = {
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  route: 'M3 11l19-8-8 19-2-9-9-2z',
  phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z',
  police: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z',
  fire: 'M12 3c3 4 5 6 5 9a5 5 0 01-10 0c0-2 1-3.4 2-4.4 0 2 1 3 2 3 0-3 1-4.6 1-7.6z',
  medical: 'M12 5v14M5 12h14',
  disaster: 'M12 4l9 16H3l9-16zM12 10v4M12 17.5h.01',
  coastguard: 'M12 8v12M12 8a2 2 0 100-4 2 2 0 000 4zM5 13a7 7 0 0014 0',
  weather: 'M7 18a4 4 0 010-8 5 5 0 019.6-1A3.5 3.5 0 0117 18H7z',
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  pin: 'M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  locate: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 16a4 4 0 100-8 4 4 0 000 8z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  review: 'M9 3h6v4H9zM9 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-3M9 14l2 2 4-4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  warn: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01'
};

const EMERGENCY_CONTACTS = [
  { key: 'police', name: 'Police', agency: 'PNP' },
  { key: 'fire', name: 'Fire protection', agency: 'BFP' },
  { key: 'medical', name: 'Medical rescue', agency: 'EMS' },
  { key: 'disaster', name: 'Disaster response', agency: 'NDRRMC' },
  { key: 'coastguard', name: 'Coast guard', agency: 'PCG' },
  { key: 'weather', name: 'Weather service', agency: 'PAGASA' }
];

const RAIL = [
  { key: 'overview', label: 'Overview', icon: 'overview' },
  { key: 'reports', label: 'Reports', icon: 'list' },
  { key: 'hotspots', label: 'Hotspots', icon: 'pin' },
  { key: 'insights', label: 'Insights', icon: 'chart' },
  { key: 'near', label: 'Near you', icon: 'locate' },
  // Not a panel: this one turns the replay bar on and off.
  { key: 'replay', label: 'Time replay', icon: 'clock', action: 'replay' }
];

const PANEL_TITLES = {
  overview: 'Overview',
  reports: 'Reports',
  hotspots: 'Hotspots',
  insights: 'Insights',
  near: 'Near you',
  hotlines: 'Emergency hotlines'
};

const PANEL_SUBTITLES = {
  overview: 'Current situation on the map',
  reports: 'Hover a report to preview it',
  hotspots: 'Busiest locations, with report numbers',
  insights: 'When and where accidents happen',
  near: 'Closest incidents to your position',
  hotlines: 'Tap to call'
};

// Danger warnings use every report on record. Set a number of days here to look only
// at recent accidents, for example 180.
const DANGER_WINDOW_DAYS = null;
// How far outside a danger zone's edge the "area ahead" warning starts, in metres.
const WARN_AHEAD_M = 300;

// Ordered worst first so the layer list matches the severity ramp.
const SEVERITIES = [
  { key: 'fatal', label: 'Fatal' },
  { key: 'major', label: 'Major' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'minor', label: 'Minor' },
  { key: 'unknown', label: 'Unclassified' }
];

const LOCATION_LABEL = {
  idle: 'Location access has not been requested yet.',
  locating: 'Requesting location permission...',
  granted: 'Location permission granted.',
  denied: 'Permission denied. Allow location access in your browser, then retry.',
  unsupported: 'This browser does not support location access.',
  error: 'Your location could not be read. Try again.'
};

function severityKey(report) {
  return report.severity || 'unknown';
}

function timeAgo(value) {
  if (!value) return 'time unknown';

  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'time unknown';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}

// Travelling times from the routing service are in minutes and can run into
// hours, so they are shown as hours and minutes once they pass an hour.
function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return 'unknown';

  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  return `${hours} h ${Math.round(minutes % 60)} min`;
}

// Single turns are usually a few hundred metres, which reads better in metres.
function formatDistance(km) {
  if (!Number.isFinite(km)) return 'unknown';

  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const PENDING = ['submitted', 'under_review'];
const RANGES = [
  { key: 'all', label: 'All time', ms: Infinity },
  { key: '24h', label: '24 h', ms: 24 * 3600e3 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 3600e3 },
  { key: '30d', label: '30 days', ms: 30 * 24 * 3600e3 }
];
const SEV_RANK = { fatal: 0, major: 1, moderate: 2, minor: 3, unknown: 4 };
const PREVIEW_W = 336;
const PREVIEW_H = 470;

const EMPTY_ZONES = [];
const hasPoint = r => Boolean(r.latitude && r.longitude);

function kmBetween(aLat, aLng, bLat, bLng) {
  const rad = d => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Groups mapped reports that are within ZONE_LINK_KM of each other into hotspots.
// Each hotspot gets a centre, a radius in metres that covers its reports, and a
// blip speed from how serious its incidents are.
const ZONE_LINK_KM = 0.45;
const SEV_WEIGHT = { fatal: 4, major: 3, moderate: 2, minor: 1, unknown: 1 };

function buildClusters(list) {
  const pool = [...list].sort((a, b) => SEV_RANK[severityKey(a)] - SEV_RANK[severityKey(b)]);
  const taken = new Set();
  const clusters = [];

  pool.forEach(seed => {
    if (taken.has(seed.id)) return;

    const members = pool.filter(other => !taken.has(other.id) && kmBetween(
      Number(seed.latitude), Number(seed.longitude), Number(other.latitude), Number(other.longitude)
    ) <= ZONE_LINK_KM);
    members.forEach(m => taken.add(m.id));

    const lat = members.reduce((t, m) => t + Number(m.latitude), 0) / members.length;
    const lng = members.reduce((t, m) => t + Number(m.longitude), 0) / members.length;
    const spread = Math.max(...members.map(m => kmBetween(lat, lng, Number(m.latitude), Number(m.longitude)))) * 1000;
    const score = members.reduce((t, m) => t + SEV_WEIGHT[severityKey(m)], 0);
    const names = new Map();
    members.forEach(m => {
      const name = String(m.location || 'Unknown location').trim();
      names.set(name, (names.get(name) || 0) + 1);
    });

    clusters.push({
      key: `z${clusters.length}`,
      id: clusters.length,
      name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      reports: members,
      worst: severityKey(members[0]),
      score,
      center: { lat, lng },
      radiusM: Math.max(220, spread + 160),
      tier: score >= 7 ? 'fast' : score >= 3 ? 'mid' : 'slow'
    });
  });

  return clusters.sort((a, b) => b.reports.length - a.reports.length || b.score - a.score);
}

const TIER_LABEL = { fast: 'Critical', mid: 'Elevated', slow: 'Watch' };

function Icon({ name, size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  const theme = useThemeName();
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState([]);
  const [geo, setGeo] = useState({ state: 'idle' });
  const { user } = useAuth();
  // Reporters file accidents; officers and admins review them. Admins no longer
  // get the report button.
  const canReport = user?.role === 'reporter';
  const canReview = user?.role === 'traffic_officer' || user?.role === 'admin';
  // Which popup panel is open beside the icon rail. null keeps the whole map clear.
  const [panel, setPanel] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [range, setRange] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [showLabels, setShowLabels] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [pulse, setPulse] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [clusterPins, setClusterPins] = useState(true);
  const [warnOn, setWarnOn] = useState(true);
  // Time replay: `index` counts days from the first report. While it is on, it
  // replaces the Period filter.
  const [replay, setReplay] = useState({ on: false, index: 0, playing: false, speed: 1, window: 'all' });
  const [watching, setWatching] = useState(false);
  const [dismissedZone, setDismissedZone] = useState(null);
  // The report being hovered, from a pin or a list row, and where to draw its card.
  const [hover, setHover] = useState(null);
  const mapAreaRef = useRef(null);
  // The layers card (basemap + severity filters) starts folded away so the map
  // keeps the space, and unfolds from its own button.
  const [layersOpen, setLayersOpen] = useState(false);
  // Same idea for the route card: folded away until its button is used.
  const [routeOpen, setRouteOpen] = useState(false);
  // Route planning. `routeFrom` holds a point key, or 'gps' for the admin's own
  // position. `routeTo` is null until the admin picks a destination, which lets
  // the card follow whichever report is selected on the map.
  const [routeFrom, setRouteFrom] = useState('gps');
  // The text shown in each field. null means "not typed", so the field shows
  // whichever point is currently chosen; '' means the admin cleared it.
  const [fromText, setFromText] = useState(null);
  const [toText, setToText] = useState(null);
  const [routeTo, setRouteTo] = useState(null);
  const [vehicle, setVehicle] = useState('car');
  const [route, setRoute] = useState({ state: 'idle' });
  // Points the admin drops on the map instead of choosing a report, and which of
  // the two ends the next map click fills in.
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  const [pickTarget, setPickTarget] = useState(null);
  // The turn currently being followed, or null when the route is only being viewed.
  const [navStep, setNavStep] = useState(null);
  // Chosen basemap, remembered between visits like the theme is. Until the user
  // picks one, the map follows the theme: night on dark, muted on light.
  const [basemap, setBasemap] = useState(() => {
    const saved = localStorage.getItem('mapBasemap');
    return BASEMAPS.some(option => option.key === saved) ? saved : null;
  });
  const activeBasemap = basemap || (theme === 'light' ? 'muted' : 'night');
  // Shown on the folded layers card, so the current basemap stays readable while
  // the switcher itself is hidden.
  const activeBasemapLabel = BASEMAPS.find(option => option.key === activeBasemap)?.label || activeBasemap;
  // Shown on the folded route card, so a planned route stays readable while the
  // fields are put away. Kept short: a full turn instruction would wrap the header.
  const routeSummary = route.state === 'ok'
    ? navStep === null
      ? `${route.distanceKm.toFixed(1)} km · ${formatDuration(route.durationMin)}`
      : `Step ${navStep + 1} of ${route.steps.length}`
    : VEHICLES.find(option => option.key === vehicle)?.label || 'Not planned';

  const chooseBasemap = useCallback(key => {
    setBasemap(key);
    localStorage.setItem('mapBasemap', key);
  }, []);

  // On desktop the map fills the viewport, so Leaflet's own controls and the two
  // floating stacks would otherwise start underneath the top bar. The height of
  // that chrome changes with the window width and with how many links the signed
  // in role shows, so it is measured from the alert bar rather than assumed. A
  // callback ref does the first measurement, not a mount effect: StrictMode's
  // simulated remount detaches the ref before the effect body runs, so a mount
  // effect would read null and leave the variable unset until the first resize.
  const alertRef = useRef(null);
  const measureChrome = useCallback(() => {
    const alert = alertRef.current;
    if (!alert) return;
    document.documentElement.style.setProperty(
      '--ops-chrome-h',
      `${Math.round(alert.getBoundingClientRect().bottom)}px`
    );
  }, []);
  const attachAlert = useCallback(node => {
    alertRef.current = node;
    if (node) measureChrome();
  }, [measureChrome]);

  useLayoutEffect(() => {
    measureChrome();
    window.addEventListener('resize', measureChrome);
    const nav = document.querySelector('.navbar');
    const observer = new ResizeObserver(measureChrome);
    if (nav) observer.observe(nav);

    return () => {
      window.removeEventListener('resize', measureChrome);
      observer.disconnect();
    };
  }, [measureChrome]);

  useEffect(() => {
    let active = true;

    api.get('/reports')
      .then(res => {
        if (active) setReports(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (active) setError('Reports could not be loaded. Check that the API is running.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  // Only reports with coordinates can be pinned.
  const located = useMemo(
    () => reports.filter(r => r.latitude && r.longitude),
    [reports]
  );

  // Tiles count what the date range allows. They are the status filters, so they
  // must not shrink when one is chosen.
  const inRange = useCallback(r => {
    const span = RANGES.find(option => option.key === range)?.ms ?? Infinity;
    if (span === Infinity) return true;
    const time = new Date(r.created_at).getTime();
    return Number.isFinite(time) && Date.now() - time <= span;
  }, [range]);

  // When each accident happened (not when it was reported), worked out once.
  const when = useMemo(
    () => new Map(reports.map(r => [r.id, occurredAt(r)])),
    [reports]
  );

  // The replay runs one day at a time from the earliest accident to today (or to the
  // latest accident, if one is dated later). `strip` is a small activity chart of the
  // whole range, in at most 120 columns.
  const replayInfo = useMemo(() => {
    const times = [...when.values()].map(stamp => stamp.ms).filter(Number.isFinite);
    if (times.length === 0) return null;

    const start = startOfDay(Math.min(...times));
    const end = startOfDay(Math.max(Date.now(), ...times));
    const count = Math.round((end - start) / DAY) + 1;
    const columns = Math.min(count, 120);
    const strip = Array(columns).fill(0);

    times.forEach(t => {
      const day = Math.round((startOfDay(t) - start) / DAY);
      strip[Math.min(columns - 1, Math.floor((day / count) * columns))] += 1;
    });

    return { start, count, strip };
  }, [when]);

  const replayActive = replay.on && Boolean(replayInfo);
  const replayIndex = replayInfo ? Math.min(replay.index, replayInfo.count - 1) : 0;
  const replayEnd = replayInfo ? replayInfo.start + (replayIndex + 1) * DAY - 1 : 0;
  const replayFrom = replay.window === 'all'
    ? -Infinity
    : replayEnd - (replay.window === '7d' ? 7 : 30) * DAY;

  const inReplay = useCallback(r => {
    const t = when.get(r.id)?.ms;
    return Number.isFinite(t) && t <= replayEnd && t > replayFrom;
  }, [when, replayEnd, replayFrom]);

  const base = useMemo(
    () => reports.filter(replayActive ? inReplay : inRange),
    [reports, replayActive, inReplay, inRange]
  );
  const tiles = useMemo(() => ({
    total: base.length,
    pending: base.filter(r => PENDING.includes(r.status)).length,
    mapped: base.filter(hasPoint).length,
    resolved: base.filter(r => r.status === 'resolved').length
  }), [base]);

  // Range, status and search narrow the list; the severity chips narrow it further.
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();

    return base.filter(r => {
      if (statusFilter === 'pending' && !PENDING.includes(r.status)) return false;
      if (statusFilter === 'resolved' && r.status !== 'resolved') return false;
      if (!q) return true;
      return [r.report_reference, r.title, r.location]
        .some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [base, statusFilter, query]);

  const sevCounts = useMemo(() => {
    const out = { fatal: 0, major: 0, moderate: 0, minor: 0, unknown: 0 };
    scoped.forEach(r => { out[severityKey(r)] += 1; });
    return out;
  }, [scoped]);

  const filtered = useMemo(() => {
    const list = scoped.filter(r => !hidden.includes(severityKey(r)));
    if (sort === 'severity') {
      return [...list].sort((a, b) => SEV_RANK[severityKey(a)] - SEV_RANK[severityKey(b)]
        || new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    return list;
  }, [scoped, hidden, sort]);

  const visible = useMemo(() => filtered.filter(hasPoint), [filtered]);
  const unmapped = filtered.length - visible.length;

  const needsAttention = useMemo(
    () => filtered.filter(r => PENDING.includes(r.status)).slice(0, 4),
    [filtered]
  );

  // Hotspots are groups of reports that sit close together, busiest first. The map
  // draws the ones with two or more reports as zones.
  const clusters = useMemo(() => buildClusters(visible), [visible]);
  const hotspots = useMemo(() => clusters.slice(0, 8), [clusters]);
  const zones = useMemo(
    () => clusters
      .filter(c => c.reports.length >= 2)
      .map(c => ({
        id: c.id,
        latitude: c.center.lat,
        longitude: c.center.lng,
        radiusM: c.radiusM,
        tier: c.tier,
        count: c.reports.length
      })),
    [clusters]
  );

  const selectZone = useCallback(id => {
    const zone = clusters.find(c => c.id === id);
    if (!zone) return;
    setSelected(null);
    setFocus({ id: `zone-${id}-${Date.now()}`, latitude: zone.center.lat, longitude: zone.center.lng });
    setPanel('hotspots');
  }, [clusters]);

  const nearest = useMemo(() => {
    if (!Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) return [];

    return filtered
      .filter(hasPoint)
      .map(r => ({
        report: r,
        km: kmBetween(geo.latitude, geo.longitude, Number(r.latitude), Number(r.longitude))
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8);
  }, [filtered, geo.latitude, geo.longitude]);

  const counts = useMemo(() => {
    const bySeverity = { fatal: 0, major: 0, moderate: 0, minor: 0, unknown: 0 };
    located.forEach(r => { bySeverity[severityKey(r)] += 1; });
    return bySeverity;
  }, [located]);

  const pending = useMemo(
    () => reports.filter(r => r.status === 'submitted' || r.status === 'under_review').length,
    [reports]
  );

  const resolved = useMemo(
    () => reports.filter(r => r.status === 'resolved').length,
    [reports]
  );

  const critical = counts.fatal + counts.major;

  const latestCritical = useMemo(
    () => located
      .filter(r => r.severity === 'fatal' || r.severity === 'major')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null,
    [located]
  );

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ state: 'unsupported' });
      return;
    }

    setGeo({ state: 'locating' });

    navigator.geolocation.getCurrentPosition(
      position => {
        setGeo({
          state: 'granted',
          accuracy: Math.round(position.coords.accuracy),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setSelected(null);
        setFocus({
          id: 'current-location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      err => setGeo({ state: err.code === 1 ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const selectReport = useCallback(report => {
    setSelected(report);
    setFocus(report);
  }, []);

  // ---------- Time replay ----------
  const toggleReplay = useCallback(() => {
    setHover(null);
    setReplay(current => (current.on
      ? { ...current, on: false, playing: false }
      : { ...current, on: true, playing: false, index: replayInfo ? replayInfo.count - 1 : 0 }));
  }, [replayInfo]);

  const playReplay = useCallback(() => {
    setReplay(current => {
      if (current.playing) return { ...current, playing: false };
      const last = replayInfo ? replayInfo.count - 1 : 0;
      return { ...current, playing: true, index: current.index >= last ? 0 : current.index };
    });
  }, [replayInfo]);

  useEffect(() => {
    if (!replayActive || !replay.playing) return undefined;

    // Long histories skip days per tick so a full replay never takes more than
    // about 80 seconds at normal speed.
    const step = Math.max(1, Math.ceil(replayInfo.count / 120));
    const last = replayInfo.count - 1;

    const timer = setInterval(() => {
      setReplay(current => (current.index >= last
        ? { ...current, playing: false }
        : { ...current, index: Math.min(last, current.index + step) }));
    }, 700 / replay.speed);

    return () => clearInterval(timer);
  }, [replayActive, replay.playing, replay.speed, replayInfo]);

  // ---------- Danger warnings ----------
  // Danger zones are groups of two or more reports whose combined severity is
  // Elevated or Critical. They use every report on record, not the map filters, so
  // a warning never depends on what the viewer has switched off.
  const riskZones = useMemo(() => {
    const cutoff = DANGER_WINDOW_DAYS ? Date.now() - DANGER_WINDOW_DAYS * DAY : -Infinity;
    const pool = located.filter(r => {
      if (r.status === 'rejected') return false;
      const t = when.get(r.id)?.ms;
      return !Number.isFinite(t) || t >= cutoff;
    });

    return buildClusters(pool)
      .filter(c => c.reports.length >= 2 && c.tier !== 'slow')
      .map(c => ({
        key: `${c.center.lat.toFixed(3)},${c.center.lng.toFixed(3)}`,
        name: c.name,
        count: c.reports.length,
        tier: c.tier,
        lat: c.center.lat,
        lng: c.center.lng,
        radiusM: c.radiusM
      }));
  }, [located, when]);

  const hasGeo = Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude);
  const me = useMemo(
    () => (hasGeo ? { latitude: geo.latitude, longitude: geo.longitude } : null),
    [hasGeo, geo.latitude, geo.longitude]
  );

  // The zone the visitor is in or about to reach: inside first, then the more
  // serious tier, then the closest.
  const nearZone = useMemo(() => {
    if (!warnOn || !hasGeo) return null;

    const hits = riskZones
      .map(zone => {
        const metres = kmBetween(geo.latitude, geo.longitude, zone.lat, zone.lng) * 1000;
        return { zone, edgeM: metres - zone.radiusM, inside: metres <= zone.radiusM };
      })
      .filter(hit => hit.edgeM <= WARN_AHEAD_M)
      .sort((a, b) => Number(b.inside) - Number(a.inside)
        || (a.zone.tier === b.zone.tier ? 0 : a.zone.tier === 'fast' ? -1 : 1)
        || a.edgeM - b.edgeM);

    return hits[0] || null;
  }, [warnOn, hasGeo, geo.latitude, geo.longitude, riskZones]);

  // Leaving the area forgets a dismissal, so the warning returns next time.
  useEffect(() => {
    if (!nearZone && dismissedZone) setDismissedZone(null);
  }, [nearZone, dismissedZone]);

  const routeWarn = useMemo(
    () => (warnOn && route.state === 'ok' ? zonesOnRoute(route.path, riskZones) : []),
    [warnOn, route, riskZones]
  );

  // Insights look at every report the account can see, whatever the map filters are
  // set to, so the numbers stay put while someone explores. Rejected reports are not
  // accidents. The period ends at the replay day while a replay is running, and
  // otherwise at the end of the latest day on record.
  const insightReports = useMemo(() => reports.filter(r => r.status !== 'rejected'), [reports]);
  const insightAnchor = replayActive
    ? replayEnd
    : replayInfo ? replayInfo.start + replayInfo.count * DAY - 1 : Date.now();

  // Keeps the position fresh while the visitor moves, so the warning can fire without
  // pressing the locate button again.
  useEffect(() => {
    if (!watching || !navigator.geolocation) return undefined;

    const id = navigator.geolocation.watchPosition(
      position => setGeo({
        state: 'granted',
        accuracy: Math.round(position.coords.accuracy),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }),
      err => {
        // A timeout only means no fix yet; a refusal ends the watch.
        if (err.code === 1) {
          setGeo({ state: 'denied' });
          setWatching(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [watching]);

  // Every point a route can start or end at: the reports that carry coordinates,
  // plus the admin's own position once it has been shared. A Map keeps the point
  // objects stable between renders, so the fetch below only reruns when the
  // chosen points or the vehicle actually change.
  const pointsByKey = useMemo(() => {
    const map = new Map();

    located.forEach(report => {
      map.set(`report-${report.id}`, {
        key: `report-${report.id}`,
        label: `${report.report_reference} - ${report.location}`,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude)
      });
    });

    if (Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
      map.set('gps', {
        key: 'gps',
        label: 'My location (GPS)',
        latitude: geo.latitude,
        longitude: geo.longitude
      });
    }

    if (customStart) {
      map.set('pick-start', { key: 'pick-start', ...customStart });
    }

    if (customEnd) {
      map.set('pick-end', { key: 'pick-end', ...customEnd });
    }

    return map;
  }, [located, geo.latitude, geo.longitude, customStart, customEnd]);

  const fromPoint = pointsByKey.get(routeFrom) || null;

  const toKey = routeTo === null
    ? (selected ? `report-${selected.id}` : located[0] ? `report-${located[0].id}` : null)
    : routeTo || null;
  const toPoint = toKey ? pointsByKey.get(toKey) || null : null;

  // Reports filed at the same corner are separate records at one spot, so the two
  // ends can legitimately be the same place. Neither the routing engine nor Google
  // Maps can route from a place to itself, so it is reported rather than attempted.
  const samePlace = isSamePlace(fromPoint, toPoint);

  // What each field shows: the typed text once there is any, otherwise the label of
  // the point currently chosen, so the field always describes the actual route.
  const fromDisplay = fromText === null ? (fromPoint?.label || '') : fromText;
  const toDisplay = toText === null ? (toPoint?.label || '') : toText;

  // Everything already known locally: the admin's own position, then the mapped
  // reports. Typing narrows this list, so focusing an empty field shows the whole
  // list, which is the dropdown behaviour this replaced.
  const localOptions = useMemo(() => {
    const items = [];

    const gps = pointsByKey.get('gps');
    if (gps) items.push({ ...gps, hint: 'Your location' });

    located.forEach(report => {
      items.push({
        key: `report-${report.id}`,
        label: `${report.report_reference} - ${report.location}`,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude),
        hint: 'Report'
      });
    });

    return items;
  }, [pointsByKey, located]);

  const narrow = (items, text, chosenLabel) => {
    const query = (text || '').trim();
    if (!query || query === chosenLabel) return items;
    const lower = query.toLowerCase();
    return items.filter(item => item.label.toLowerCase().includes(lower));
  };

  // Typing abandons the previous choice, so a half-typed place never quietly routes
  // to whatever was selected before.
  const changeFrom = useCallback(value => {
    setFromText(value);
    setRouteFrom('');
    setCustomStart(null);
  }, []);

  const chooseFrom = useCallback(point => {
    setFromText(point.label);

    if (point.source === 'search') {
      setCustomStart({ latitude: point.latitude, longitude: point.longitude, label: point.label });
      setRouteFrom('pick-start');
      return;
    }

    setRouteFrom(point.key);
    setCustomStart(null);
  }, []);

  const changeTo = useCallback(value => {
    setToText(value);
    setRouteTo('');
    setCustomEnd(null);
  }, []);

  const chooseTo = useCallback(point => {
    setToText(point.label);

    if (point.source === 'search') {
      setCustomEnd({ latitude: point.latitude, longitude: point.longitude, label: point.label });
      setRouteTo('pick-end');
      return;
    }

    setRouteTo(point.key);
    setCustomEnd(null);
  }, []);

  const handleMapPick = useCallback((latitude, longitude) => {
    const label = `Map point (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

    if (pickTarget === 'start') {
      setCustomStart({ latitude, longitude, label });
      setRouteFrom('pick-start');
      setFromText(label);
    } else {
      setCustomEnd({ latitude, longitude, label });
      setRouteTo('pick-end');
      setToText(label);
    }

    setPickTarget(null);
  }, [pickTarget]);

  useEffect(() => {
    if (!fromPoint || !toPoint || samePlace) {
      setRoute({ state: 'idle' });
      return undefined;
    }

    const controller = new AbortController();
    setRoute({ state: 'loading' });

    planRoute({ from: fromPoint, to: toPoint, vehicle, signal: controller.signal })
      .then(result => {
        setRoute({ state: 'ok', ...result });
        // A new route means the old turn numbers no longer apply.
        setNavStep(null);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setRoute({ state: 'error', message: err.message });
      });

    return () => controller.abort();
  }, [fromPoint, toPoint, samePlace, vehicle]);

  // The stretch of road the current turn covers, so the map can highlight it.
  const activePath = useMemo(() => {
    if (route.state !== 'ok' || navStep === null) return null;

    const step = route.steps[navStep];
    if (!step || !Number.isFinite(step.beginIndex) || !Number.isFinite(step.endIndex)) {
      return null;
    }

    return route.path.slice(step.beginIndex, step.endIndex + 1);
  }, [route, navStep]);

  const remaining = useMemo(() => {
    if (route.state !== 'ok' || navStep === null) return null;

    return route.steps.slice(navStep).reduce(
      (total, step) => ({
        distanceKm: total.distanceKm + (step.distanceKm || 0),
        minutes: total.minutes + (step.durationMin || 0)
      }),
      { distanceKm: 0, minutes: 0 }
    );
  }, [route, navStep]);

  const toggleLayer = useCallback(key => {
    setHidden(prev => (
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    ));
  }, []);

  const togglePanel = useCallback(key => {
    setPanel(current => (current === key ? null : key));
    setHover(null);
  }, []);

  useEffect(() => {
    if (!panel) return undefined;
    const onKey = event => { if (event.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  // Pin hover: the map reports the pin's screen position. A row hover keeps priority
  // while the pointer is over the panel, so the two never fight over the card.
  const onPinHover = useCallback((report, point) => {
    if (report) setHover({ report, x: point.x, y: point.y, source: 'pin' });
    else setHover(current => (current?.source === 'pin' ? null : current));
  }, []);

  const hoverRow = (report, element) => {
    const box = mapAreaRef.current?.getBoundingClientRect();
    const row = element.getBoundingClientRect();
    if (!box) return;
    setHover({
      report,
      x: row.right - box.left + 14,
      y: row.top - box.top + row.height / 2,
      source: 'row'
    });
  };
  const unhoverRow = () => setHover(current => (current?.source === 'row' ? null : current));
  const rowEvents = report => ({
    onMouseEnter: event => hoverRow(report, event.currentTarget),
    onMouseLeave: unhoverRow,
    onFocus: event => hoverRow(report, event.currentTarget),
    onBlur: unhoverRow
  });

  const previewStyle = (() => {
    if (!hover) return null;
    const box = mapAreaRef.current?.getBoundingClientRect();
    const width = box?.width || window.innerWidth;
    const height = box?.height || window.innerHeight;
    const chrome = window.innerWidth >= 1024
      ? (parseInt(document.documentElement.style.getPropertyValue('--ops-chrome-h'), 10) || 80) + 8
      : 8;

    let left = hover.source === 'pin' ? hover.x + 22 : hover.x;
    if (left + PREVIEW_W > width - 12) {
      left = hover.source === 'pin' ? hover.x - 22 - PREVIEW_W : width - PREVIEW_W - 12;
    }

    const top = Math.max(chrome, Math.min(hover.y - PREVIEW_H / 2, height - PREVIEW_H - 12));
    return { left, top };
  })();

  if (loading) return <div className="container">Loading operations map...</div>;

  return (
    <div className="ops-page">
      <div
        ref={attachAlert}
        className={`ops-alert ${critical ? 'is-critical' : 'is-clear'}`}
        role="status"
      >
        <span className="ops-alert-icon" aria-hidden="true">!</span>

        {critical > 0 ? (
          <>
            <strong>
              {critical} major or fatal accident {critical === 1 ? 'report' : 'reports'}
            </strong>
            {latestCritical && (
              <span className="ops-alert-detail">
                Most recent: {latestCritical.report_reference} at {latestCritical.location},{' '}
                {timeAgo(latestCritical.created_at)}
              </span>
            )}
            {critical > 1 && <span className="ops-alert-more">+{critical - 1} more</span>}
          </>
        ) : (
          <>
            <strong>No major or fatal accidents on record</strong>
            <span className="ops-alert-detail">
              {pending} {pending === 1 ? 'report' : 'reports'} awaiting review
            </span>
          </>
        )}

        {error && <span className="ops-alert-more">{error}</span>}
      </div>

      <div className="ops-body">
        <div ref={mapAreaRef} className={`ops-map mp-map ${panel ? 'has-panel' : ''}`}>
          <nav className="mp-rail" aria-label="Map tools">
            <span className="mp-brand" aria-hidden="true">
              <img src="/agap-mark.png" alt="" />
            </span>

            <div className="mp-rail-group">
              {RAIL.map(item => {
                const isReplay = item.action === 'replay';
                const active = isReplay ? replayActive : panel === item.key;

                return (
                <button
                  key={item.key}
                  type="button"
                  className={`mp-rail-btn ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                  aria-label={item.label}
                  data-tip={item.label}
                  disabled={isReplay && !replayInfo}
                  onClick={() => (isReplay ? toggleReplay() : togglePanel(item.key))}
                >
                  <Icon name={item.icon} size={20} />
                  {item.key === 'reports' && filtered.length > 0 && (
                    <i className="mp-rail-badge">{filtered.length > 99 ? '99+' : filtered.length}</i>
                  )}
                </button>
                );
              })}
            </div>

            <div className="mp-rail-end">
              {canReview && (
                <button
                  type="button"
                  className="mp-rail-btn"
                  aria-label="Review queue"
                  data-tip="Review queue"
                  onClick={() => navigate('/officer')}
                >
                  <Icon name="review" size={20} />
                  {pending > 0 && <i className="mp-rail-badge is-alert">{pending > 99 ? '99+' : pending}</i>}
                </button>
              )}
              <button
                type="button"
                className={`mp-rail-btn is-danger ${panel === 'hotlines' ? 'is-active' : ''}`}
                aria-pressed={panel === 'hotlines'}
                aria-label="Emergency hotlines"
                data-tip="Emergency hotlines"
                onClick={() => togglePanel('hotlines')}
              >
                <Icon name="phone" size={20} />
              </button>
            </div>
          </nav>

          {panel && (
            <section className="mp-panel" role="dialog" aria-label={PANEL_TITLES[panel]}>
              <header className="mp-panel-head">
                <div>
                  <h2>{PANEL_TITLES[panel]}</h2>
                  <p>{PANEL_SUBTITLES[panel]}</p>
                </div>
                <button type="button" className="mp-x" onClick={() => setPanel(null)} aria-label="Close panel">
                  <Icon name="close" size={16} />
                </button>
              </header>

              <div className="mp-panel-body">
                {panel === 'overview' && (
                  <>
                    {(canReport || canReview) && (
                      <div className="mp-actions">
                        {canReport && (
                          <button type="button" className="btn btn-primary mp-act" onClick={() => navigate('/reports/new')}>
                            <Icon name="plus" /> Report accident
                          </button>
                        )}
                        {canReview && (
                          <button type="button" className="btn btn-primary mp-act" onClick={() => navigate('/officer')}>
                            <Icon name="review" /> Review queue
                            <span className="mp-count">{pending}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {latestCritical ? (
                      <button type="button" className="mp-alertcard" onClick={() => selectReport(latestCritical)} {...rowEvents(latestCritical)}>
                        <span className="mp-alertcard-icon" aria-hidden="true">!</span>
                        <span className="mp-alertcard-text">
                          <strong>{critical} major or fatal {critical === 1 ? 'report' : 'reports'}</strong>
                          <span>
                            {latestCritical.report_reference} · {latestCritical.location} · {timeAgo(latestCritical.created_at)}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <p className="mp-calm">No major or fatal accidents on record.</p>
                    )}

                    <h3 className="mp-sec">Current situation</h3>
                    <div className="mp-tiles">
                      <button type="button" className={`mp-tile ${statusFilter === 'all' ? 'is-on' : ''}`} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                        <strong className="numeric">{tiles.total}</strong>
                        <span>Visible to you</span>
                      </button>
                      <button type="button" className={`mp-tile is-pending ${statusFilter === 'pending' ? 'is-on' : ''}`} aria-pressed={statusFilter === 'pending'} onClick={() => setStatusFilter(f => (f === 'pending' ? 'all' : 'pending'))}>
                        <strong className="numeric">{tiles.pending}</strong>
                        <span>Awaiting review</span>
                      </button>
                      <div className="mp-tile is-static">
                        <strong className="numeric">{tiles.mapped}</strong>
                        <span>Mapped</span>
                      </div>
                      <button type="button" className={`mp-tile is-resolved ${statusFilter === 'resolved' ? 'is-on' : ''}`} aria-pressed={statusFilter === 'resolved'} onClick={() => setStatusFilter(f => (f === 'resolved' ? 'all' : 'resolved'))}>
                        <strong className="numeric">{tiles.resolved}</strong>
                        <span>Resolved</span>
                      </button>
                    </div>

                    <h3 className="mp-sec">Severity</h3>
                    <div className="mp-bar" aria-hidden="true">
                      {SEVERITIES.map(severity => (
                        sevCounts[severity.key] > 0 && !hidden.includes(severity.key) && (
                          <span key={severity.key} className={`sev-${severity.key}`} style={{ flexGrow: sevCounts[severity.key] }} />
                        )
                      ))}
                    </div>
                    <div className="mp-chips">
                      {SEVERITIES.filter(s => s.key !== 'unknown' || sevCounts.unknown > 0).map(severity => (
                        <button
                          key={severity.key}
                          type="button"
                          className={`mp-chip sev-${severity.key} ${hidden.includes(severity.key) ? 'is-off' : ''}`}
                          aria-pressed={!hidden.includes(severity.key)}
                          onClick={() => toggleLayer(severity.key)}
                        >
                          <i /> {severity.label} <b className="numeric">{sevCounts[severity.key]}</b>
                        </button>
                      ))}
                    </div>

                    <h3 className="mp-sec">Period</h3>
                    <div className="mp-seg" role="group" aria-label="Date range">
                      {RANGES.map(option => (
                        <button key={option.key} type="button" className={range === option.key && !replayActive ? 'is-on' : ''} aria-pressed={range === option.key} disabled={replayActive} onClick={() => setRange(option.key)}>
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {replayActive && (
                      <p className="mp-note mp-note--tight">
                        Time replay is on, so the map shows reports up to {dayLabel(replayEnd)}.{' '}
                        <button type="button" className="mp-link" onClick={toggleReplay}>Back to live</button>
                      </p>
                    )}

                    <div className="mp-sec-row">
                      <h3 className="mp-sec">Needs attention</h3>
                      {needsAttention.length > 0 && (
                        <button type="button" className="mp-link" onClick={() => { setStatusFilter('pending'); setPanel('reports'); }}>See all</button>
                      )}
                    </div>
                    {needsAttention.length === 0 ? (
                      <p className="mp-empty">Nothing is waiting for review in this period.</p>
                    ) : (
                      <ul className="mp-mini">
                        {needsAttention.map(report => (
                          <li key={report.id}>
                            <button type="button" className={selected?.id === report.id ? 'is-selected' : ''} onClick={() => selectReport(report)} {...rowEvents(report)}>
                              <i className={`mp-dot sev-${severityKey(report)}`} />
                              <span>
                                <strong>{report.title}</strong>
                                <em>{report.report_reference} · {timeAgo(report.created_at)}</em>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {hotspots[0] && (
                      <>
                        <div className="mp-sec-row">
                          <h3 className="mp-sec">Busiest area</h3>
                          <button type="button" className="mp-link" onClick={() => setPanel('hotspots')}>All hotspots</button>
                        </div>
                        <div className="mp-busiest">
                          <i className={`mp-dot sev-${hotspots[0].worst}`} />
                          <span>
                            <strong>{hotspots[0].name}</strong>
                            <em>{hotspots[0].reports.length} {hotspots[0].reports.length === 1 ? 'report' : 'reports'}</em>
                          </span>
                        </div>
                      </>
                    )}

                    <h3 className="mp-sec">Map</h3>
                    <label className="mp-switch">
                      <input type="checkbox" checked={showZones} onChange={event => setShowZones(event.target.checked)} />
                      <span>Hotspot zones</span>
                    </label>
                    <label className="mp-switch">
                      <input type="checkbox" checked={pulse} onChange={event => setPulse(event.target.checked)} />
                      <span>Pulse animation (faster = more serious)</span>
                    </label>
                    <label className="mp-switch">
                      <input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} />
                      <span>Show report numbers on pins</span>
                    </label>
                    <label className="mp-switch">
                      <input type="checkbox" checked={showHeat} onChange={event => setShowHeat(event.target.checked)} />
                      <span>Heatmap</span>
                    </label>
                    <label className="mp-switch">
                      <input type="checkbox" checked={clusterPins} onChange={event => setClusterPins(event.target.checked)} />
                      <span>Group pins into numbered clusters when zoomed out</span>
                    </label>
                    <label className="mp-switch">
                      <input type="checkbox" checked={warnOn} onChange={event => setWarnOn(event.target.checked)} />
                      <span>Warn me about accident-prone areas</span>
                    </label>

                    <p className="mp-note">Counts cover only the reports your account can see.</p>
                  </>
                )}

                {panel === 'reports' && (
                  <>
                    <label className="mp-search">
                      <Icon name="search" />
                      <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Reference, title or street"
                        aria-label="Search reports"
                      />
                    </label>

                    <div className="mp-toolbar">
                      <div className="mp-seg mp-seg--sm" role="group" aria-label="Status filter">
                        <button type="button" className={statusFilter === 'all' ? 'is-on' : ''} onClick={() => setStatusFilter('all')}>All</button>
                        <button type="button" className={statusFilter === 'pending' ? 'is-on' : ''} onClick={() => setStatusFilter('pending')}>Pending</button>
                        <button type="button" className={statusFilter === 'resolved' ? 'is-on' : ''} onClick={() => setStatusFilter('resolved')}>Resolved</button>
                      </div>
                      <select className="mp-select" value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort reports">
                        <option value="newest">Newest</option>
                        <option value="severity">Severity</option>
                      </select>
                    </div>

                    {filtered.length === 0 ? (
                      <p className="mp-empty">
                        {reports.length === 0
                          ? 'No reports yet.'
                          : 'No reports match these filters. Check the status, period and severity filters in Overview.'}
                      </p>
                    ) : (
                      <ul className="mp-cards">
                        {filtered.map(report => (
                          <li key={report.id}>
                            <button
                              type="button"
                              className={`mp-card ${selected?.id === report.id ? 'is-selected' : ''}`}
                              onClick={() => selectReport(report)}
                              {...rowEvents(report)}
                            >
                              <i className={`mp-dot sev-${severityKey(report)}`} />
                              <span className="mp-card-main">
                                <span className="mp-card-top">
                                  <span className="map-list-ref">{report.report_reference}</span>
                                  <span className={`badge badge-${report.status}`}>{String(report.status || '').replace(/_/g, ' ')}</span>
                                </span>
                                <span className="mp-card-title">{report.title}</span>
                                <span className="mp-card-loc">{report.location} · {timeAgo(report.created_at)}</span>
                                {!hasPoint(report) && <span className="mp-card-warn">No map location</span>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {unmapped > 0 && (
                      <p className="mp-note">
                        {unmapped} {unmapped === 1 ? 'report has' : 'reports have'} no location, so {unmapped === 1 ? 'it is' : 'they are'} not on the map.
                      </p>
                    )}
                  </>
                )}

                {panel === 'hotspots' && (
                  hotspots.length === 0 ? (
                    <p className="mp-empty">No reports to group yet.</p>
                  ) : (
                    <ol className="mp-hot">
                      {hotspots.map((spot, index) => {
                        return (
                          <li key={spot.key} className="mp-hot-item">
                            <button
                              type="button"
                              className="mp-hot-main"
                              onClick={() => {
                                setSelected(null);
                                setFocus({ id: `zone-${spot.id}-${Date.now()}`, latitude: spot.center.lat, longitude: spot.center.lng });
                              }}
                            >
                              <span className={`mp-rank sev-${spot.worst} tier-${spot.tier}`}>{index + 1}</span>
                              <span className="mp-hot-text">
                                <strong>{spot.name}</strong>
                                <em>{spot.reports.length} {spot.reports.length === 1 ? 'report' : 'reports'} · {TIER_LABEL[spot.tier]}</em>
                              </span>
                            </button>
                            <div className="mp-hot-refs">
                              {spot.reports.slice(0, 6).map(report => (
                                <button
                                  key={report.id}
                                  type="button"
                                  className={`mp-ref sev-${severityKey(report)}`}
                                  title={`${report.report_reference} - ${report.title}`}
                                  onClick={() => selectReport(report)}
                                  {...rowEvents(report)}
                                >
                                  {shortRef(report.report_reference)}
                                </button>
                              ))}
                              {spot.reports.length > 6 && <span className="mp-more">+{spot.reports.length - 6}</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )
                )}

                {panel === 'insights' && (
                  <InsightsPanel
                    reports={insightReports}
                    when={when}
                    anchorMs={insightAnchor}
                    onPickReport={selectReport}
                  />
                )}

                {panel === 'near' && (
                  <>
                    <p className={`mp-loc is-${geo.state}`}>
                      {LOCATION_LABEL[geo.state]}
                      {geo.state === 'granted' && geo.accuracy ? ` Accurate to about ${geo.accuracy} m.` : ''}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary ops-wide"
                      onClick={requestLocation}
                      disabled={geo.state === 'locating' || geo.state === 'unsupported'}
                    >
                      <Icon name="locate" /> {geo.state === 'locating' ? 'Locating...' : geo.state === 'granted' ? 'Update my location' : 'Use my location'}
                    </button>

                    {geo.state === 'granted' && (
                      <label className="mp-switch">
                        <input type="checkbox" checked={watching} onChange={event => setWatching(event.target.checked)} />
                        <span>Keep following my position (for warnings while you travel)</span>
                      </label>
                    )}

                    {geo.state === 'granted' && warnOn && (
                      <p className="mp-note mp-note--tight">
                        {nearZone
                          ? `${nearZone.inside ? 'You are inside' : 'You are close to'} an accident-prone area: ${nearZone.zone.name}.`
                          : riskZones.length === 0
                            ? 'No accident-prone areas are recorded yet.'
                            : 'You are not near an accident-prone area.'}
                      </p>
                    )}

                    {nearest.length > 0 && (
                      <ul className="mp-cards">
                        {nearest.map(({ report, km }) => (
                          <li key={report.id}>
                            <button type="button" className={`mp-card ${selected?.id === report.id ? 'is-selected' : ''}`} onClick={() => selectReport(report)} {...rowEvents(report)}>
                              <i className={`mp-dot sev-${severityKey(report)}`} />
                              <span className="mp-card-main">
                                <span className="mp-card-top">
                                  <span className="map-list-ref">{report.report_reference}</span>
                                  <span className="mp-dist numeric">{formatDistance(km)}</span>
                                </span>
                                <span className="mp-card-title">{report.title}</span>
                                <span className="mp-card-loc">{report.location}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {panel === 'hotlines' && (
                  <>
                    <a className="ops-hotline" href={`tel:${EMERGENCY_NUMBER}`}>
                      <Icon name="medical" />
                      <span>
                        <strong className="numeric">{EMERGENCY_NUMBER}</strong>
                        <span className="muted">National emergency line</span>
                      </span>
                    </a>
                    <ul className="ops-contacts">
                      {EMERGENCY_CONTACTS.map(contact => (
                        <li key={contact.key} className="ops-contact">
                          <span className="ops-contact-icon" aria-hidden="true"><Icon name={contact.key} /></span>
                          <span className="ops-contact-text">
                            <strong>{contact.name}</strong>
                            <span className="muted">{contact.agency}</span>
                          </span>
                          <a className="btn btn-danger ops-call" href={`tel:${EMERGENCY_NUMBER}`} aria-label={`Call ${contact.name} on the national emergency line`}>Call</a>
                        </li>
                      ))}
                    </ul>
                    <p className="mp-note">Agency-specific numbers are not configured, so every card dials the national emergency line.</p>
                  </>
                )}
              </div>
            </section>
          )}

          <ReportMap
            reports={visible}
            focus={focus}
            height="100%"
            colorBySeverity
            basemap={activeBasemap}
            routePath={route.state === 'ok' ? route.path : null}
            activePath={activePath}
            pickedPoints={[
              customStart && { kind: 'start', ...customStart },
              customEnd && { kind: 'end', ...customEnd }
            ].filter(Boolean)}
            onMapPick={pickTarget ? handleMapPick : null}
            showLabels={showLabels}
            hoverId={hover?.report.id ?? null}
            onHover={onPinHover}
            onSelect={selectReport}
            zones={showZones ? zones : EMPTY_ZONES}
            blip={pulse}
            onZoneSelect={selectZone}
            heatmap={showHeat}
            cluster={clusterPins}
            me={me}
          />

          {nearZone && dismissedZone !== nearZone.zone.key && (
            <div className={`mp-warn is-${nearZone.zone.tier}`} role="alert">
              <span className="mp-warn-icon" aria-hidden="true"><Icon name="warn" size={20} /></span>
              <span className="mp-warn-text">
                <strong>{nearZone.inside ? 'You are in an accident-prone area' : 'Accident-prone area ahead'}</strong>
                <span>
                  {nearZone.zone.name} · {nearZone.zone.count} reports · {TIER_LABEL[nearZone.zone.tier]}
                  {nearZone.inside ? '' : ` · about ${formatDistance(Math.max(0, nearZone.edgeM) / 1000)} away`}
                </span>
                <em>Slow down and take extra care.</em>
              </span>
              <button
                type="button"
                className="mp-warn-show"
                onClick={() => setFocus({ id: `warn-${nearZone.zone.key}-${Date.now()}`, latitude: nearZone.zone.lat, longitude: nearZone.zone.lng })}
              >
                Show
              </button>
              <button
                type="button"
                className="mp-x"
                aria-label="Dismiss warning"
                onClick={() => setDismissedZone(nearZone.zone.key)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          {replayActive && (
            <ReplayBar
              startMs={replayInfo.start}
              dayCount={replayInfo.count}
              index={replayIndex}
              onIndex={index => setReplay(current => ({ ...current, index, playing: false }))}
              playing={replay.playing}
              onPlay={playReplay}
              speed={replay.speed}
              onSpeed={speed => setReplay(current => ({ ...current, speed }))}
              windowKey={replay.window}
              onWindow={key => setReplay(current => ({ ...current, window: key }))}
              strip={replayInfo.strip}
              stats={{ reports: visible.length, hotspots: zones.length }}
              shifted={Boolean(selected)}
              onClose={toggleReplay}
            />
          )}

          {hover && previewStyle && hover.report.id !== selected?.id && (
            <ReportPreview report={hover.report} timeAgo={timeAgo} style={previewStyle} className="rp--float" />
          )}

          {selected && (
            <ReportSheet
              report={selected}
              timeAgo={timeAgo}
              canRoute={hasPoint(selected)}
              onClose={() => { setSelected(null); setFocus(null); }}
              onOpen={() => navigate(`/reports/${selected.id}`)}
              onRoute={() => {
                setRouteTo(`report-${selected.id}`);
                setCustomEnd(null);
                setToText(null);
                setRouteOpen(true);
              }}
            />
          )}

          <div className="mp-top" aria-live="polite">
            <i className="mp-live" aria-hidden="true" />
            <strong>{replayActive ? dayLabel(replayEnd) : new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
            <span>{replayActive ? 'Replay' : RANGES.find(option => option.key === range)?.label}</span>
            <span className={zones.length ? 'is-hot' : ''}>
              {zones.length} {zones.length === 1 ? 'hotspot' : 'hotspots'}
            </span>
          </div>

          <div className="ops-rail">
            <div className={`ops-float ops-float--route ${routeOpen ? '' : 'is-folded'}`}>
              <button
                type="button"
                className="ops-expander ops-expander--plain ops-route-head"
                aria-expanded={routeOpen}
                onClick={() => setRouteOpen(open => !open)}
              >
                <span className="ops-contact-icon" aria-hidden="true">
                  <Icon name="route" />
                </span>
                <span className="ops-expander-text">
                  <strong>Plan your route</strong>
                  <span className="muted">{routeSummary}</span>
                </span>
                <span className="ops-expander-chevron" aria-hidden="true">
                  {routeOpen ? '−' : '+'}
                </span>
              </button>

              <div className="ops-route-field">
                <PlacePicker
                  id="route-from"
                  label="Start"
                  text={fromDisplay}
                  placeholder="Type a place, or pick a report"
                  options={narrow(localOptions, fromDisplay, fromPoint?.label)}
                  search={searchPlaces}
                  onTextChange={changeFrom}
                  onChoose={chooseFrom}
                />
                <button
                  type="button"
                  className={`ops-pick ${pickTarget === 'start' ? 'is-armed' : ''}`}
                  aria-pressed={pickTarget === 'start'}
                  onClick={() => setPickTarget(target => (target === 'start' ? null : 'start'))}
                >
                  {pickTarget === 'start' ? 'Click the map to set the start' : 'Set start on the map'}
                </button>
              </div>

              <div className="ops-route-field">
                <PlacePicker
                  id="route-to"
                  label="End"
                  text={toDisplay}
                  placeholder="Type a place, or pick a report"
                  options={narrow(localOptions, toDisplay, toPoint?.label)}
                  search={searchPlaces}
                  onTextChange={changeTo}
                  onChoose={chooseTo}
                />
                <button
                  type="button"
                  className={`ops-pick ${pickTarget === 'end' ? 'is-armed' : ''}`}
                  aria-pressed={pickTarget === 'end'}
                  onClick={() => setPickTarget(target => (target === 'end' ? null : 'end'))}
                >
                  {pickTarget === 'end' ? 'Click the map to set the end' : 'Set end on the map'}
                </button>
              </div>

              <div className="ops-route-field">
                <span className="ops-layers-title">Vehicle</span>
                <div className="ops-vehicles" role="group" aria-label="Vehicle">
                  {VEHICLES.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      className={`ops-vehicle ${vehicle === option.key ? 'is-active' : ''}`}
                      aria-pressed={vehicle === option.key}
                      onClick={() => setVehicle(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {route.state === 'loading' && <p className="ops-note">Finding the best road route...</p>}

              {route.state === 'ok' && (
                <dl className="ops-rows">
                  <div>
                    <dt>Distance</dt>
                    <dd className="numeric">{route.distanceKm.toFixed(1)} km</dd>
                  </div>
                  <div>
                    <dt>{vehicle === 'motorcycle' ? 'Riding time' : 'Driving time'}</dt>
                    <dd className="numeric">{formatDuration(route.durationMin)}</dd>
                  </div>
                  <div>
                    <dt>Turns</dt>
                    <dd className="numeric">{route.steps.length}</dd>
                  </div>
                </dl>
              )}

              {route.state === 'ok' && warnOn && (
                routeWarn.length > 0 ? (
                  <div className="mp-routewarn" role="alert">
                    <strong>
                      <Icon name="warn" size={14} /> This route passes {routeWarn.length} accident-prone {routeWarn.length === 1 ? 'area' : 'areas'}
                    </strong>
                    <ul>
                      {routeWarn.map(zone => (
                        <li key={zone.key}>
                          <button
                            type="button"
                            onClick={() => setFocus({ id: `route-warn-${zone.key}-${Date.now()}`, latitude: zone.lat, longitude: zone.lng })}
                          >
                            <i className={`mp-dot tier-${zone.tier}`} />
                            <span>{zone.name}</span>
                            <em>{TIER_LABEL[zone.tier]} · {zone.count} reports</em>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="ops-note">No accident-prone areas on this route.</p>
                )
              )}

              {route.state === 'error' && <p className="ops-note">{route.message}</p>}

              {route.state === 'idle' && (
                <p className="ops-note">
                  {!fromPoint || !toPoint
                    ? 'Type a start and an end, or pick a report. A point can also be set on the map.'
                    : 'The start and the end are the same place, so there is no route between them. Google Maps cannot plan one either.'}
                </p>
              )}

              {route.state === 'ok' && navStep === null && (
                <button
                  type="button"
                  className="btn btn-primary ops-wide"
                  onClick={() => setNavStep(0)}
                >
                  Navigate in this page
                </button>
              )}

              {route.state === 'ok' && navStep !== null && (
                <div className="ops-nav">
                  <div className="ops-nav-head">
                    <span className="ops-layers-title">
                      {`Step ${navStep + 1} of ${route.steps.length}`}
                    </span>
                    {remaining && (
                      <span className="numeric ops-nav-remaining">
                        {`${formatDistance(remaining.distanceKm)} left`}
                      </span>
                    )}
                  </div>

                  <p className="ops-nav-turn">{route.steps[navStep]?.instruction}</p>

                  <div className="ops-nav-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={navStep === 0}
                      onClick={() => setNavStep(step => Math.max(0, step - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={navStep >= route.steps.length - 1}
                      onClick={() => setNavStep(step => Math.min(route.steps.length - 1, step + 1))}
                    >
                      Next
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary ops-wide"
                    onClick={() => setNavStep(null)}
                  >
                    End navigation
                  </button>
                </div>
              )}

              {fromPoint && toPoint && !samePlace ? (
                <a
                  className="btn btn-secondary ops-wide"
                  href={googleMapsDirectionsUrl(fromPoint, toPoint)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                </a>
              ) : (
                <button type="button" className="btn btn-secondary ops-wide" disabled>
                  Open in Google Maps
                </button>
              )}

              <p className="ops-note">
                Distances and turns come from OpenStreetMap's Valhalla engine. Motorcycle
                routes avoid expressways, which motorcycles are banned from.
              </p>
            </div>

            <div className="ops-actions">
              <div className="ops-layers">
                <button
                  type="button"
                  className="ops-expander ops-expander--plain"
                  aria-expanded={layersOpen}
                  aria-controls="ops-layers-body"
                  onClick={() => setLayersOpen(open => !open)}
                >
                  <span className="ops-contact-icon" aria-hidden="true">
                    <Icon name="layers" />
                  </span>
                  <span className="ops-expander-text">
                    <strong>Map layers</strong>
                    <span className="muted">{activeBasemapLabel}</span>
                  </span>
                  <span className="ops-expander-chevron" aria-hidden="true">
                    {layersOpen ? '−' : '+'}
                  </span>
                </button>

                {layersOpen && (
                  <div id="ops-layers-body" className="ops-layers-body">
                    <div className="ops-basemaps" role="group" aria-label="Basemap style">
                      {BASEMAPS.map(option => (
                        <button
                          key={option.key}
                          type="button"
                          className={`ops-basemap ${activeBasemap === option.key ? 'is-active' : ''}`}
                          aria-pressed={activeBasemap === option.key}
                          onClick={() => chooseBasemap(option.key)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="ops-layers-list">
                      <span className="ops-layers-title">Severity</span>
                      {SEVERITIES.map(severity => (
                        <label key={severity.key} className="ops-layer">
                          <input
                            type="checkbox"
                            checked={!hidden.includes(severity.key)}
                            onChange={() => toggleLayer(severity.key)}
                          />
                          <span>{severity.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {canReport && (
                <button
                  type="button"
                  className="btn btn-primary ops-report-btn"
                  onClick={() => navigate('/reports/new')}
                >
                  Report accident
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
