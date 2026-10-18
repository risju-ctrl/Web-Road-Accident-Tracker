import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ComposedChart, Bar, Line, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../services/api';
import { ReportMap } from '../components/MapView';
import { WidgetState, fmt } from '../components/dashboard/DashboardWidgets';
import '../dashboard.css'; // shared skeleton / empty-state styles
import '../liveOverview.css';

const REFRESH_MS = 60000;
const label = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());

// This page has its own dark look (liveOverview.css), so colours are fixed here
// and do not depend on the app's light/dark toggle.
const INK = { accent: '#E8DFB5', muted: '#8d8b84', fatalities: '#F05252', injuries: '#F08A3C', none: '#4FC3A1', unknown: '#8d8b84' };

// Colour AND shape, so injury level still reads for colour-blind users.
const INJURY_SHAPES = {
  fatalities: 'polygon(50% 0, 100% 100%, 0 100%)',
  injuries: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  none: 'circle(50%)',
  unknown: 'inset(0 round 2px)'
};
const INJURY_LABELS = { fatalities: 'Fatal', injuries: 'Injuries', none: 'No injuries', unknown: 'Unknown' };

const GROUPS = {
  all: { label: 'All', match: () => true },
  pending: { label: 'Pending', match: (s) => ['submitted', 'under_review', 'needs_clarification'].includes(s) },
  verified: { label: 'Verified', match: (s) => s === 'verified' },
  active: { label: 'Assigned', match: (s) => ['assigned', 'in_progress'].includes(s) },
  resolved: { label: 'Resolved', match: (s) => s === 'resolved' }
};

/* ---------- tiny inline icons ---------- */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Svg = ({ children, size = 18 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...P}>{children}</svg>;

const ICONS = {
  doc: <Svg><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></Svg>,
  clock: <Svg><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>,
  check: <Svg><circle cx="12" cy="12" r="8" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></Svg>,
  flag: <Svg><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></Svg>,
  arrow: <Svg size={16}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Svg>,
  search: <Svg size={17}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Svg>,
  expand: <Svg size={18}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>,
  shrink: <Svg size={18}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></Svg>,
  calendar: <Svg size={17}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></Svg>,
  download: <Svg size={17}><path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M5 20h14" /></Svg>
};

const VEHICLE_ICONS = {
  Car: <Svg><path d="M3 14l1.6-4.5A2 2 0 0 1 6.5 8h11a2 2 0 0 1 1.9 1.5L21 14v4h-2M3 14v4h2M3 14h18" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></Svg>,
  Truck: <Svg><path d="M2 7h12v9H2zM14 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></Svg>,
  'Bus/Jeepney': <Svg><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M3 11h18" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /></Svg>,
  Motorcycle: <Svg><circle cx="5.5" cy="16" r="3" /><circle cx="18.5" cy="16" r="3" /><path d="M5.5 16l3-6h5l3 6M8.5 10H7M13.5 10l1.5-3h2" /></Svg>,
  Bicycle: <Svg><circle cx="5.5" cy="16" r="3.2" /><circle cx="18.5" cy="16" r="3.2" /><path d="m5.5 16 4-7h5l4 7M9.5 9l3.5 7M14.5 9l-1-2.5h2" /></Svg>
};
VEHICLE_ICONS.Tricycle = VEHICLE_ICONS.Motorcycle;
const vehicleIcon = (name) => VEHICLE_ICONS[name] || VEHICLE_ICONS.Car;

// Same buckets the server uses for the vehicle chart, so table icons agree with it.
const VEHICLE_RULES = [
  ['Motorcycle', /motor|scooter|habal/i], ['Tricycle', /tricycle|trike|rickshaw/i],
  ['Bicycle', /bicycle|bike/i], ['Truck', /truck|lorry|trailer|dump/i],
  ['Bus/Jeepney', /\bbus\b|jeepney|coaster/i], ['Car', /car|sedan|suv|van|taxi|pickup|jeep|vehicle/i]
];
const vehicleBucket = (v) => (VEHICLE_RULES.find(([, re]) => re.test(String(v || ''))) || ['Other'])[0];

function Marker({ shape, color, size = 11 }) {
  return <span aria-hidden="true" style={{ width: size, height: size, background: color, clipPath: shape, display: 'inline-block', flex: 'none' }} />;
}

function Card({ title, to, toLabel, children, className = '' }) {
  return (
    <section className={`tv-card ${className}`} aria-label={title}>
      <div className="tv-ch">
        <h2>{title}</h2>
        {to && <Link to={to} className="tv-go" aria-label={toLabel}>{ICONS.arrow}</Link>}
      </div>
      {children}
    </section>
  );
}

/* Gentle curve with a handle at `pct`, like the progress slider in the reference. */
function Progress({ pct }) {
  const p0 = [4, 8], p1 = [150, 22], p2 = [296, 8];
  const t = Math.min(Math.max(pct, 0), 100) / 100;
  const at = (i) => (1 - t) ** 2 * p0[i] + 2 * (1 - t) * t * p1[i] + t ** 2 * p2[i];
  const x = at(0), y = at(1);
  return (
    <div className="tv-prog">
      <div className="tv-bubble" style={{ left: `${(x / 300) * 100}%` }}>{pct}%</div>
      <svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="tvgrad" x1="0" x2="1">
            <stop offset="0" stopColor="#F05252" />
            <stop offset=".5" stopColor="#E8DFB5" />
            <stop offset="1" stopColor="#4FC3A1" />
          </linearGradient>
        </defs>
        <path d={`M${p0} Q${p1} ${p2}`} fill="none" stroke="url(#tvgrad)" strokeWidth="2" strokeLinecap="round" opacity=".9" />
        <circle cx={x} cy={y} r="5" fill="#fff" />
      </svg>
      <div className="tv-ends"><span>0%</span><span>100%</span></div>
    </div>
  );
}


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIP = { background: '#232322', border: '1px solid #3a3a38', borderRadius: 8, color: '#f1efe8', fontSize: '0.8125rem' };
const daysSince = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

/* Tremor-style KPI: label, big number, delta chip, sparkline. */
function Kpi({ title, kpi, series, color = INK.accent }) {
  const y = kpi?.yoy;
  const data = (series?.current || []).map((v, i) => ({ m: MONTHS[i], v }));
  const id = `sp-${title.replace(/\W/g, '')}`;
  return (
    <div className="tv-kpi">
      <small>{title}</small>
      <div className="tv-kpi-row">
        <strong>{fmt(kpi?.value)}</strong>
        <span className={`tv-chip ${y == null ? '' : y < 0 ? 'dn' : 'up'}`}>{y == null ? 'no comparison' : `${y < 0 ? '▼' : '▲'} ${Math.abs(y).toFixed(0)}%`}</span>
      </div>
      <div className="tv-spark" aria-hidden="true">
        <ResponsiveContainer width="100%" height={36}>
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            <Area dataKey="v" type="monotone" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <em>{fmt(kpi?.previous)} last year</em>
    </div>
  );
}

/* Tremor "BarList": label on the bar, value on the right. */
function BarList({ rows, color = INK.accent }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <ul className="tv-barlist">
      {rows.map(([name, n]) => (
        <li key={name}>
          <div className="bar" style={{ width: `${Math.max((n / max) * 100, 4)}%`, background: color }}><span title={name}>{name}</span></div>
          <b>{fmt(n)}</b>
        </li>
      ))}
    </ul>
  );
}

/* Tremor "DonutChart" built as a segmented ring + legend. */
function Ring({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const R = 42, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="tv-ring">
      <svg viewBox="0 0 110 110" role="img" aria-label="Reports by injury level">
        <circle cx="55" cy="55" r={R} fill="none" stroke="hsl(var(--surface-3))" strokeWidth="13" />
        {total > 0 && Object.keys(INJURY_LABELS).map((k) => {
          const len = (counts[k] / total) * C;
          const el = <circle key={k} cx="55" cy="55" r={R} fill="none" stroke={INK[k]} strokeWidth="13" strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 55 55)" />;
          off += len;
          return el;
        })}
        <text x="55" y="53" textAnchor="middle" className="rt">{fmt(total)}</text>
        <text x="55" y="68" textAnchor="middle" className="rs">reports</text>
      </svg>
      <ul>
        {Object.keys(INJURY_LABELS).map((k) => (
          <li key={k}><Marker shape={INJURY_SHAPES[k]} color={INK[k]} size={10} />{INJURY_LABELS[k]}<b>{fmt(counts[k])}</b><em>{total ? Math.round((counts[k] / total) * 100) : 0}%</em></li>
        ))}
      </ul>
    </div>
  );
}

/* Weekday x time-block heat grid. */
function Heat({ cells, max }) {
  const blocks = ['00-05', '06-11', '12-17', '18-23'];
  return (
    <div className="tv-heat" role="img" aria-label="Reports by weekday and time of day">
      <span />{DAYS.map((d) => <small key={d}>{d}</small>)}
      {blocks.map((b, bi) => (
        <div className="row" key={b} style={{ display: 'contents' }}>
          <small>{b}</small>
          {DAYS.map((d, di) => {
            const n = cells[di][bi];
            return <i key={d} title={`${d} ${b}:00 - ${n} report${n === 1 ? '' : 's'}`} style={{ background: n ? `rgba(232,223,181,${0.15 + 0.85 * (n / max)})` : 'hsl(var(--surface-3))' }}>{n || ''}</i>;
          })}
        </div>
      ))}
    </div>
  );
}

export default function LiveOverview() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [typeId, setTypeId] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(false);
  const [group, setGroup] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [exportScope, setExportScope] = useState('verified');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [mapFull, setMapFull] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLocation(locationInput.trim()), 400);
    return () => clearTimeout(t);
  }, [locationInput]);

  useEffect(() => {
    api.get('/accident-categories').then((r) => setCategories(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const load = useCallback(async (isAlive = () => true) => {
    try {
      const [s, r] = await Promise.all([
        api.get('/summaries/dashboard/stats', {
          params: { year, compareYear: year - 1, scope: 'all', typeId: typeId || undefined, location: location || undefined }
        }),
        api.get('/reports')
      ]);
      if (!isAlive()) return;
      setStats(s.data);
      setReports(Array.isArray(r.data) ? r.data : []);
      setError(false);
    } catch (err) {
      console.error(err);
      if (isAlive()) setError(true);
    }
  }, [year, typeId, location]);

  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    load(isAlive);
    const t = setInterval(() => load(isAlive), REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [load]);

  // Fullscreen map: Leaflet needs a resize nudge, and Esc should leave it.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    if (!mapFull) return () => clearTimeout(t);
    const esc = (e) => { if (e.key === 'Escape') setMapFull(false); };
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('keydown', esc); };
  }, [mapFull]);

  const st = { loading: !stats && !error, error: error && !stats };

  // /reports has no filters, so type and location are applied here to keep
  // the map, table and charts in step with the stats cards.
  const typeName = categories.find((k) => String(k.id) === String(typeId))?.name;
  const filtered = useMemo(() => {
    const q = location.toLowerCase();
    return (reports || []).filter((r) =>
      (!typeName || r.category_name === typeName) &&
      (!q || String(r.location || '').toLowerCase().includes(q))
    );
  }, [reports, typeName, location]);

  const yearReports = useMemo(
    () => filtered.filter((r) => String(r.accident_date).slice(0, 4) === String(year)),
    [filtered, year]
  );
  const injuryCounts = useMemo(() => {
    const o = { fatalities: 0, injuries: 0, none: 0, unknown: 0 };
    yearReports.forEach((r) => { o[r.injury_status in o ? r.injury_status : 'unknown']++; });
    return o;
  }, [yearReports]);

  const hourly = useMemo(() => {
    const a = Array.from({ length: 24 }, (_, h) => ({ h, n: 0, avg: 0 }));
    yearReports.forEach((r) => {
      const h = parseInt(String(r.accident_time || '').slice(0, 2), 10);
      if (h >= 0 && h < 24) a[h].n++;
    });
    a.forEach((x, i) => {
      const w = a.slice(Math.max(0, i - 2), i + 3);
      x.avg = w.reduce((s, y) => s + y.n, 0) / w.length;
    });
    return a;
  }, [yearReports]);
  const timed = hourly.reduce((s, x) => s + x.n, 0);
  const peak = timed ? hourly.reduce((m, x) => (x.n > m.n ? x : m)) : null;
  const dayShare = timed ? Math.round((hourly.slice(6, 18).reduce((s, x) => s + x.n, 0) / timed) * 100) : 0;

  const vehicles = useMemo(() => {
    const rows = Object.entries(stats?.byVehicle || {}).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((a, [, v]) => a + v, 0);
    return rows.map(([k, v]) => [k, v, total ? Math.round((v / total) * 100) : 0]);
  }, [stats]);


  const monthly = useMemo(() => {
    const cur = stats?.monthlySeries?.submitted?.current || [];
    const prev = stats?.monthlySeries?.submitted?.previous || [];
    return MONTHS.map((m, i) => ({ m, cur: cur[i] || 0, prev: prev[i] || 0 }));
  }, [stats]);
  const typeRows = useMemo(() => Object.entries(stats?.byType || {}).sort((a, b) => b[1] - a[1]).slice(0, 6), [stats]);
  const hotspots = useMemo(() => {
    const m = {};
    yearReports.forEach((r) => {
      const key = String(r.location || '').split(',').slice(-2).join(',').trim() || 'Unknown';
      m[key] = (m[key] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [yearReports]);
  const heat = useMemo(() => {
    const cells = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
    yearReports.forEach((r) => {
      const d = new Date(String(r.accident_date).slice(0, 10) + 'T00:00:00').getDay();
      const h = parseInt(String(r.accident_time || '').slice(0, 2), 10);
      if (Number.isNaN(d) || Number.isNaN(h)) return;
      cells[d][Math.floor(h / 6)]++;
    });
    return { cells, max: Math.max(1, ...cells.flat()) };
  }, [yearReports]);
  const queue = useMemo(() => {
    const open = (reports || []).filter((r) => ['submitted', 'under_review', 'needs_clarification'].includes(r.status));
    const ages = open.map((r) => daysSince(r.created_at));
    return {
      open: open.length,
      over7: ages.filter((a) => a >= 7).length,
      oldest: ages.length ? Math.max(...ages) : 0,
      avgAge: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0
    };
  }, [reports]);
  const resolutionPct = stats?.kpis?.submitted?.value ? Math.round((stats.kpis.closed.value / stats.kpis.submitted.value) * 100) : 0;

  const rows = useMemo(
    () => filtered
      .filter((r) => GROUPS[group].match(r.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5),
    [filtered, group]
  );
  const mapReports = useMemo(() => filtered.filter((r) => GROUPS[group].match(r.status)), [filtered, group]);
  const selected = (reports || []).find((r) => r.id === selectedId) || null;

  const years = useMemo(() => {
    const list = new Set([thisYear, thisYear - 1, year, ...(stats?.meta?.years || [])]);
    return [...list].sort((a, b) => b - a);
  }, [stats, year, thisYear]);

  const k = stats?.kpis || {};
  const verifiedPct = k.submitted?.value ? Math.round((k.verified.value / k.submitted.value) * 100) : 0;
  const yoy = k.submitted?.yoy;
  const summary = [
    ['submitted', 'Total', 'doc', 'Total submitted'],
    ['pending', 'Pending', 'clock', 'Pending review'],
    ['verified', 'Verified', 'check', 'Verified (official)'],
    ['closed', 'Resolved', 'flag', 'Resolved / closed']
  ];

  // Uses the existing admin CSV endpoint. "Verified only" is its default (official records).
  const downloadCsv = async () => {
    setExporting(true);
    setExportError('');
    try {
      const res = await api.get('/summaries/reports/export', {
        params: {
          format: 'csv',
          verified: exportScope === 'all' ? 'all' : undefined,
          category_id: typeId || undefined,
          date_from: `${year}-01-01`,
          date_to: `${year}-12-31`
        },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${exportScope}-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setExportError('Could not download the CSV. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="tv">
      <div className="tv-grid">
        <aside className="tv-left">
          <Card title="Today's Reports" to="/reports" toLabel="Open all reports">
            <WidgetState {...st} empty={!stats}>
              <div className="tv-hero">
                <svg className="tv-road" viewBox="0 0 300 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
                  <path d="M120 0 20 120h260L180 0z" fill="#fff" opacity=".045" />
                  <path d="M150 4v14M150 30v18M150 62v24M150 100v20" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".12" />
                </svg>
                {summary.map(([key, short, icon, full], i) => (
                  <span key={key} className={`tv-sum s${i + 1}`} title={`${full}: ${fmt(k[key]?.value)} in ${year}`}>
                    {ICONS[icon]}{short}<b>{fmt(k[key]?.value)}</b>
                  </span>
                ))}
              </div>
              <Progress pct={verifiedPct} />
              <p className="tv-cap">{fmt(k.verified?.value)} of {fmt(k.submitted?.value)} reports verified ({verifiedPct}%) in {year}</p>
            </WidgetState>
          </Card>

          <Card title="Vehicles involved" to="/reports" toLabel="Open all reports">
            <WidgetState {...st} empty={vehicles.length === 0}>
              <ul className="tv-veh">
                {vehicles.map(([name, count, pct]) => (
                  <li key={name}>
                    <span className="n" title={name}>{vehicleIcon(name)}{name}</span>
                    <b>{fmt(count)}</b>
                    <div className="tv-ticks" role="img" aria-label={`${name} ${pct}%`}><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>
                    <em>{pct}%</em>
                  </li>
                ))}
              </ul>
            </WidgetState>
          </Card>

          <Card title="Reports by hour" to="/admin" toLabel="Open full analytics" className="tv-hours">
            <WidgetState {...st} empty={!timed} emptyText="No accident times recorded yet">
              <div className="tv-hstats">
                <div><b>{dayShare}%</b><small>Daytime</small><b>{100 - dayShare}%</b><small>Night</small></div>
                <div className="mid"><small>Busiest hour</small><strong>{peak ? `${String(peak.h).padStart(2, '0')}:00` : '-'}</strong></div>
                <div className="end">
                  <b>{fmt(timed)}</b><small>With a time</small>
                  <span className={yoy == null ? '' : yoy < 0 ? 'dn' : 'up'}>{yoy == null ? 'No comparison' : `${yoy < 0 ? '▼' : '▲'} ${Math.abs(yoy).toFixed(0)}%`}</span><small>vs last year</small>
                </div>
              </div>
              <div className="tv-chart" role="img" aria-label="Reports by hour of day">
                <ResponsiveContainer width="100%" height={104}>
                  <ComposedChart data={hourly} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="14%">
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,.06)' }}
                      labelFormatter={(h) => `${h}:00`}
                      formatter={(v, name) => (name === 'n' ? [v, 'Reports'] : null)}
                      contentStyle={{ background: '#232322', border: '1px solid #3a3a38', borderRadius: 8, color: '#f1efe8', fontSize: '0.8125rem' }}
                    />
                    <Bar dataKey="n" fill="#e9e6dd" radius={[1, 1, 0, 0]} />
                    <Line dataKey="avg" type="monotone" stroke={INK.accent} strokeWidth={1.6} dot={false} activeDot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="tv-axis"><span>0:00</span><span>23:00</span></div>
            </WidgetState>
          </Card>
        </aside>

        <main className="tv-right">
          <div className={`tv-map${mapFull ? ' full' : ''}`}>
            <div className="tv-mapbar">
              <label className="tv-search">
                {ICONS.search}
                <input type="search" value={locationInput} onChange={(e) => setLocationInput(e.target.value)} placeholder="Barangay / municipality" aria-label="Filter by location" />
              </label>
              <label className="tv-select">
                <span>Type</span>
                <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Accident type">
                  <option value="">All types</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="tv-expand" onClick={() => setMapFull((f) => !f)} aria-label={mapFull ? 'Exit full screen map' : 'Full screen map'}>
              {mapFull ? ICONS.shrink : ICONS.expand}
            </button>
            <ReportMap
              reports={mapReports}
              fitToReports
              focus={selected}
              colorFor={(r) => INK[r.injury_status] || INK.unknown}
              basemap="muted"
              height="100%"
            />
            <div className="tv-maplegend">
              {Object.keys(INJURY_LABELS).map((key) => (
                <span key={key}><Marker shape={INJURY_SHAPES[key]} color={INK[key]} size={10} />{INJURY_LABELS[key]} <b>{fmt(injuryCounts[key])}</b></span>
              ))}
            </div>
          </div>

          <section className="tv-analytics" aria-label="Analytics">
            <div className="tv-kpis">
              <Kpi title="Total submitted" kpi={k.submitted} series={stats?.monthlySeries?.submitted} />
              <Kpi title="Pending review" kpi={k.pending} series={stats?.monthlySeries?.pending} color={INK.injuries} />
              <Kpi title="Verified" kpi={k.verified} series={stats?.monthlySeries?.verified} color={INK.none} />
              <Kpi title="With fatalities" kpi={k.fatal} series={stats?.monthlySeries?.fatal} color={INK.fatalities} />
            </div>

            <div className="tv-arow tv-arow--wide">
              <Card title={`Monthly trend · ${year} vs ${year - 1}`}>
                <WidgetState {...st} empty={!stats}>
                  <div className="tv-trendkey"><span><i style={{ background: INK.accent }} />{year}</span><span><i className="dash" />{year - 1}</span></div>
                  <ResponsiveContainer width="100%" height={190}>
                    <AreaChart data={monthly} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
                      <defs><linearGradient id="tvtrend" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={INK.accent} stopOpacity=".3" /><stop offset="1" stopColor={INK.accent} stopOpacity="0" /></linearGradient></defs>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
                      <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fill: '#8d8b84', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8d8b84', fontSize: 11 }} />
                      <Tooltip contentStyle={TIP} cursor={{ stroke: 'rgba(255,255,255,.15)' }} />
                      <Area name={String(year - 1)} dataKey="prev" type="monotone" stroke="#8d8b84" strokeDasharray="4 4" strokeWidth={1.4} fill="none" dot={false} />
                      <Area name={String(year)} dataKey="cur" type="monotone" stroke={INK.accent} strokeWidth={2} fill="url(#tvtrend)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </WidgetState>
              </Card>

              <Card title="Injury severity">
                <WidgetState {...st} empty={!yearReports.length} emptyText="No reports this year">
                  <Ring counts={injuryCounts} />
                </WidgetState>
              </Card>
            </div>

            <div className="tv-arow">
              <Card title="Top accident types">
                <WidgetState {...st} empty={!typeRows.length}><BarList rows={typeRows} /></WidgetState>
              </Card>
              <Card title="Hotspot areas">
                <WidgetState {...st} empty={!hotspots.length}><BarList rows={hotspots} color={INK.injuries} /></WidgetState>
              </Card>
              <Card title="When it happens">
                <WidgetState {...st} empty={!timed} emptyText="No accident times recorded yet"><Heat cells={heat.cells} max={heat.max} /></WidgetState>
              </Card>
              <Card title="Review queue">
                <WidgetState loading={!reports && !error} error={error && !reports} empty={false}>
                  <div className="tv-queue">
                    <div><b>{fmt(queue.open)}</b><small>Awaiting review</small></div>
                    <div className={queue.over7 ? 'warn' : ''}><b>{fmt(queue.over7)}</b><small>Over 7 days</small></div>
                    <div><b>{queue.oldest}d</b><small>Oldest</small></div>
                    <div><b>{queue.avgAge}d</b><small>Average wait</small></div>
                  </div>
                  <div className="tv-meter" role="img" aria-label={`${resolutionPct}% resolved`}><i style={{ width: `${resolutionPct}%` }} /></div>
                  <p className="tv-cap left">{resolutionPct}% of {year} reports resolved</p>
                </WidgetState>
              </Card>
            </div>
          </section>

          <section className="tv-card tv-table" aria-label="Reports">
            <div className="tv-thead">
              <h2>Recent reports</h2>
              <div className="tv-tools">
                <div className="tv-tabs" role="tablist" aria-label="Filter by status">
                  {Object.entries(GROUPS).map(([key, g]) => (
                    <button key={key} role="tab" aria-selected={group === key} className={group === key ? 'on' : ''} onClick={() => setGroup(key)}>{g.label}</button>
                  ))}
                </div>
                <label className="tv-round tv-yr" title="Year">
                  {ICONS.calendar}
                  <select value={year} onChange={(e) => setYear(+e.target.value)} aria-label="Year">
                    {years.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </label>
                <span className="tv-dl">
                  <select value={exportScope} onChange={(e) => setExportScope(e.target.value)} aria-label="Export scope">
                    <option value="verified">Verified only</option>
                    <option value="all">All submitted</option>
                  </select>
                  <button type="button" className="tv-round" onClick={downloadCsv} disabled={exporting} aria-label="Download CSV" title="Download CSV">{ICONS.download}</button>
                </span>
              </div>
            </div>
            {exportError && <p className="tv-err" role="alert">{exportError}</p>}
            <WidgetState loading={!reports && !error} error={error && !reports} empty={rows.length === 0} emptyText="No reports match these filters">
              <div className="tv-scroll">
                <table>
                  <thead><tr><th>Report</th><th>Accident type</th><th>Location</th><th>Injury level</th><th>Date</th><th className="r">Status</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const ik = r.injury_status in INJURY_LABELS ? r.injury_status : 'unknown';
                      const has = r.latitude != null && r.longitude != null;
                      return (
                        <tr key={r.id} className={selectedId === r.id ? 'sel' : ''} onClick={() => setSelectedId(r.id)}>
                          <td><span className="tv-ref">{vehicleIcon(vehicleBucket(r.vehicle_type))}<Link to={`/reports/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.report_reference}</Link></span></td>
                          <td>{r.category_name || 'Uncategorized'}<small>{r.vehicle_type || 'Vehicle not stated'}</small></td>
                          <td>{r.location}<small>{has ? `${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}` : 'No coordinates'}</small></td>
                          <td><span className="tv-inj"><Marker shape={INJURY_SHAPES[ik]} color={INK[ik]} />{INJURY_LABELS[ik]}</span></td>
                          <td>{String(r.accident_date).slice(0, 10)}<small>{r.accident_time ? String(r.accident_time).slice(0, 5) : ''}</small></td>
                          <td className="r"><span className="tv-st"><i style={{ background: `hsl(var(--status-${r.status}))` }} />{label(r.status)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </WidgetState>
            <div className="tv-more"><Link to="/reports">View all {fmt(filtered.length)} reports</Link></div>
          </section>
        </main>
      </div>
    </div>
  );
}
