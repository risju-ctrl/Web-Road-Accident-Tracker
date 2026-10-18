import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { DashboardFilters } from '../components/dashboard/DashboardWidgets';
import {
  RED, STAGES, STAGE_PROGRESS, stageLabel, stageColor, MONTHS, DAYS, SLOT_LABELS,
  Icon, Chip, ProgressList, RankList, ComboChart, Heat, HeatLegend, Donut, toRows, useIsDark,
} from '../components/AnalyticsCharts';
import { mockDashboard } from '../components/dashboard/mockDashboard';
import '../dashboard.css';
import '../agapHero.css';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DASHBOARD === 'true';
const THIS_YEAR = new Date().getFullYear();

const KPI_ROWS = [
  ['pending', 'Pending', 'clock'],
  ['verified', 'Verified (official)', 'shield'],
  ['closed', 'Resolved / Closed', 'check'],
  ['fatal', 'With Fatalities', 'alert'],
];
const INJURY = { none: '#10b981', injuries: '#f59e0b', fatalities: '#ef4444', unknown: '#9ca3af' };

const when = (r) => new Date(r.incident_at || r.incident_date || r.created_at || r.createdAt);
const val = (k) => Number(k?.value ?? k?.current ?? 0);
const delta = (k) => {
  const d = k?.deltaPct ?? k?.delta_pct ?? k?.change_pct ?? k?.pct;
  if (typeof d === 'number') return Math.round(d);
  const p = Number(k?.previous ?? k?.prev ?? k?.compare ?? k?.compareValue);
  return p ? Math.round(((val(k) - p) / p) * 100) : null;
};
const pick = (r, keys) => { for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]; return ''; };
const fmtDate = (s) => {
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
};

export default function AdminDashboard() {
  const [filters, setFilters] = useState({ year: THIS_YEAR, compareYear: THIS_YEAR - 1, scope: 'verified', typeId: '', location: '' });
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('all');
  const dark = useIsDark();

  useEffect(() => {
    const t = setTimeout(() => setLocation(filters.location.trim()), 400);
    return () => clearTimeout(t);
  }, [filters.location]);

  useEffect(() => {
    if (USE_MOCK) return;
    api.get('/accident-categories').then((r) => setCategories(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const { year, compareYear, scope, typeId } = filters;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    const load = USE_MOCK
      ? Promise.resolve({ data: mockDashboard({ year: +year, compareYear: +compareYear, scope }) })
      : api.get('/summaries/dashboard/stats', { params: { year, compareYear, scope, typeId: typeId || undefined, location: location || undefined } });
    load
      .then((res) => { if (alive) setData(res.data); })
      .catch((err) => { console.error(err); if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, compareYear, scope, typeId, location]);

  const years = useMemo(() => {
    const list = data?.meta?.years?.length ? [...data.meta.years] : [];
    [THIS_YEAR, THIS_YEAR - 1, +year, +compareYear].forEach((y) => { if (!list.includes(y)) list.push(y); });
    return list.sort((a, b) => b - a);
  }, [data, year, compareYear]);

  const scopeLabel = scope === 'all' ? 'All submitted' : 'Verified only';
  const busy = loading && !data;

  const pipeline = STAGES.map(([key, name, color]) => ({ key, name, color, value: Number(data?.pipeline?.[key]) || 0 }));
  const pipeTotal = pipeline.reduce((s, r) => s + r.value, 0);
  const byType = toRows(data?.byType);
  const byVehicle = toRows(data?.byVehicle);
  const byInjury = toRows(data?.byInjury);

  // Date-based charts read the map pins; each pin needs a date.
  const pins = useMemo(() => (data?.locations || []).filter((r) => !isNaN(when(r)) && when(r).getFullYear() === +year), [data, year]);
  const trend = useMemo(() => {
    const n = Array(12).fill(0);
    pins.forEach((r) => { n[when(r).getMonth()]++; });
    return MONTHS.map((month, i) => {
      const w = n.slice(Math.max(0, i - 1), i + 2);
      return { month, Reports: n[i], Trend: +(w.reduce((a, b) => a + b, 0) / w.length).toFixed(2) };
    });
  }, [pins]);
  const grid = useMemo(() => {
    const g = DAYS.map(() => SLOT_LABELS.map(() => 0));
    pins.forEach((r) => { const d = when(r); g[d.getDay()][Math.floor(d.getHours() / 2)]++; });
    return g;
  }, [pins]);
  const peak = useMemo(() => {
    let b = { v: 0, d: 0, s: 0 };
    grid.forEach((row, d) => row.forEach((v, s) => { if (v > b.v) b = { v, d, s }; }));
    return b.v ? `${DAYS[b.d]} ${SLOT_LABELS[b.s]} - ${SLOT_LABELS[(b.s + 1) % 12]}` : null;
  }, [grid]);

  const rows = (data?.needsAttention || []).map((r) => ({
    id: r.id,
    ref: pick(r, ['reference', 'reference_no', 'reference_number', 'ref']) || `#${r.id}`,
    title: pick(r, ['title']),
    type: pick(r, ['type', 'accident_type', 'type_name', 'category']),
    place: pick(r, ['location', 'location_name', 'address']),
    created: r.created_at || r.createdAt,
    status: r.status,
  }));
  const tabs = ['all', ...new Set(rows.map((r) => r.status).filter(Boolean))];
  const shown = tab === 'all' ? rows : rows.filter((r) => r.status === tab);

  return (
    <div className="container">
      <section className="ax" data-mode={dark ? 'dark' : 'light'}>
        <header className="ax-head">
          <div>
            <h1>Analytics</h1>
            <p className="ax-crumb"><span>Dashboard</span> / Analytics</p>
            <p className="ax-muted ax-small">Public reports are not official until verified.</p>
          </div>
          <div className="ad ax-filters"><DashboardFilters filters={filters} years={years} categories={categories} onChange={setFilters} /></div>
        </header>
        {error && !data && <p className="ax-error">Could not load analytics. Check that the server is running.</p>}
        {USE_MOCK && <p className="ax-muted ax-small">Showing sample data.</p>}

        <div className="ax-top">
          <div className="ax-kpis">
            <div className="ax-hero-kpi">
              <span className="ax-hero-ico"><Icon name="file" size={20} /></span>
              <h3>Total Submitted</h3>
              <div className="ax-hero-foot">
                <b>{busy ? '-' : val(data?.kpis?.submitted)}</b>
                <Chip pct={delta(data?.kpis?.submitted)} />
              </div>
            </div>
            {KPI_ROWS.map(([key, title, icon]) => (
              <div className="ax-card ax-kpi" key={key}>
                <div className="ax-kpi-head"><span className="ax-ico"><Icon name={icon} /></span><span>{title}</span></div>
                <b>{busy ? '-' : val(data?.kpis?.[key])}</b>
                <Chip pct={delta(data?.kpis?.[key])} />
              </div>
            ))}
          </div>

          <div className="ax-card">
            <div className="ax-card-head"><h2>Reports per month</h2><span className="ax-pill">{year}</span></div>
            <div className="ax-big">{pins.length}<small> reports with a date</small></div>
            {pins.length ? <ComboChart rows={trend} dark={dark} /> : <p className="ax-muted ax-note">Needs a date on each report location from the API.</p>}
          </div>
        </div>

        <div className="ax-mid">
          <div className="ax-card">
            <div className="ax-card-head"><h2>Vehicle Types</h2></div>
            {byVehicle.length ? <ProgressList rows={byVehicle} /> : <p className="ax-muted ax-note">No data</p>}
          </div>
          <div className="ax-card">
            <div className="ax-card-head"><h2>Accident Types</h2><span className="ax-muted ax-small">{scopeLabel}</span></div>
            {byType.length ? <RankList rows={byType} /> : <p className="ax-muted ax-note">No data</p>}
          </div>
          <div className="ax-card ax-wide">
            <div className="ax-card-head"><h2>Busy Periods</h2><span className="ax-pill">{year}</span></div>
            {pins.length ? (
              <>
                <div className="ax-heat-meta">
                  <span>Highest activity <b>{peak || '-'}</b></span><HeatLegend dark={dark} />
                </div>
                <Heat grid={grid} dark={dark} />
              </>
            ) : <p className="ax-muted ax-note">Needs a date on each report location from the API.</p>}
          </div>
        </div>

        <div className="ax-low">
          <div className="ax-card">
            <div className="ax-card-head"><h2>Report Pipeline</h2><span className="ax-pill">{year}</span></div>
            {pipeTotal ? <ProgressList rows={pipeline.filter((r) => r.value)} /> : <p className="ax-muted ax-note">No reports yet</p>}
          </div>
          <div className="ax-card">
            <div className="ax-card-head"><h2>Injury Level</h2><span className="ax-muted ax-small">{scopeLabel}</span></div>
            {byInjury.length ? <Donut rows={byInjury} colors={INJURY} dark={dark} /> : <p className="ax-muted ax-note">No data</p>}
          </div>
        </div>

        <div className="ax-card ax-table-card">
          <div className="ax-card-head">
            <h2>Report List</h2>
            <div className="ax-tabs">
              {tabs.map((t) => (
                <button key={t} type="button" className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
                  {t === 'all' ? 'All' : stageLabel(t)}
                </button>
              ))}
            </div>
          </div>
          <div className="ax-scroll">
            <table className="ax-table">
              <thead><tr><th>Reference</th><th>Report</th><th>Location</th><th>Submitted</th><th>Progress</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id ?? r.ref}>
                    <td className="ax-ref">{r.ref}</td>
                    <td><b>{r.title || r.type}</b>{r.title && r.type ? <small>{r.type}</small> : null}</td>
                    <td>{r.place}</td>
                    <td>{fmtDate(r.created)}</td>
                    <td>
                      <div className="ax-prog">
                        <div className="ax-bar"><i style={{ width: `${STAGE_PROGRESS[r.status] ?? 0}%` }} /></div>
                        <span>{STAGE_PROGRESS[r.status] ?? 0}%</span>
                      </div>
                    </td>
                    <td><span className="ax-status" style={{ '--s': stageColor(r.status) }}>{stageLabel(r.status)}</span></td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={6} className="ax-muted ax-note">Nothing in this list.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <p className="ax-muted ax-small ax-foot">
          Each report is counted in the month it was submitted. Pending = Submitted + Under Review + Needs Clarification.
          Verified = verified by staff and not rejected. Closed = Resolved. KPIs and the pipeline always include every report;
          the scope filter affects the injury, type and vehicle widgets.
        </p>
      </section>
    </div>
  );
}
