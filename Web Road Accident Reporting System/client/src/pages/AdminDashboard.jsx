import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { mockDashboard } from '../components/dashboard/mockDashboard';
import {
  STAGES, STAGE_PROGRESS, stageLabel, stageVar, MONTHS, DAYS, SLOT_LABELS,
  Icon, Delta, ProgressList, RankList, Legend, GroupedBars, SmoothLine, AreaTrend, Ring, Heat, HeatLegend, toRows,
} from '../components/AnalyticsCharts';
import '../analytics.css';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DASHBOARD === 'true';
const THIS_YEAR = new Date().getFullYear();
const PAGE = 10;

const KPIS = [
  { key: 'submitted', title: 'Total submitted', icon: 'file', tone: '--accent' },
  { key: 'pending', title: 'Pending', icon: 'clock', tone: '--level-moderate', badUp: true },
  { key: 'verified', title: 'Verified (official)', icon: 'shield', tone: '--level-light' },
  { key: 'closed', title: 'Resolved / closed', icon: 'check', tone: '--level-none' },
  { key: 'fatal', title: 'With fatalities', icon: 'alert', tone: '--level-severe', badUp: true },
];
const INJURY_TOKEN = { none: '--level-none', injuries: '--level-moderate', fatalities: '--level-severe', unknown: '--text-3' };
const DEFAULT_FILTERS = { year: THIS_YEAR, compareYear: THIS_YEAR - 1, scope: 'verified', typeId: '', status: '', location: '' };

const val = (k) => Number(k?.value ?? 0);
const fmtDate = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
};
const sum = (a) => a.reduce((x, y) => x + y, 0);

function Field({ label, children }) {
  return <label className="an-field"><span>{label}</span>{children}</label>;
}

/* Export menu: downloads with the same year, scope, type, location and status the page is showing. */
function ExportMenu({ filters }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const run = async (format) => {
    setBusy(format);
    setError('');
    try {
      // Fetched with the auth header and saved as a blob, so the token never appears in a URL.
      const res = await api.get('/summaries/reports/export', {
        params: {
          format,
          year: filters.year,
          verified: filters.scope === 'all' ? 'all' : undefined,
          category_id: filters.typeId || undefined,
          status: filters.status || undefined,
          location: filters.location.trim() || undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${filters.scope}-${filters.year}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      console.error(err);
      setError('Could not export. Try again.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="an-export" ref={box}>
      <button type="button" className="btn btn-primary" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <Icon name="download" size={16} /> Export reports <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="an-menu" role="menu">
          <p className="an-menu-note">
            {filters.year} · {filters.scope === 'all' ? 'All submitted (includes unverified)' : 'Verified only'}
            {filters.status ? ` · ${stageLabel(filters.status)}` : ''}
          </p>
          <button type="button" role="menuitem" onClick={() => run('csv')} disabled={!!busy}>
            {busy === 'csv' ? 'Preparing CSV…' : 'Download CSV'}<small>Spreadsheet</small>
          </button>
          <button type="button" role="menuitem" onClick={() => run('pdf')} disabled={!!busy}>
            {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}<small>Printable</small>
          </button>
          {error && <p className="an-menu-err" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState('submitted');
  const [shown, setShown] = useState(PAGE);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  // Wait a moment after typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setLocation(filters.location.trim()), 400);
    return () => clearTimeout(t);
  }, [filters.location]);

  useEffect(() => {
    if (USE_MOCK) return;
    api.get('/accident-categories').then((r) => setCategories(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const { year, compareYear, scope, typeId, status } = filters;
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

  useEffect(() => { setShown(PAGE); }, [status, year, scope, typeId, location]);

  const years = useMemo(() => {
    const list = data?.meta?.years?.length ? [...data.meta.years] : [];
    [THIS_YEAR, THIS_YEAR - 1, +year, +compareYear].forEach((y) => { if (!list.includes(y)) list.push(y); });
    return list.sort((a, b) => b - a);
  }, [data, year, compareYear]);

  const sameYear = +year === +compareYear;
  const curName = sameYear ? `${year} (selected)` : String(year);
  const prevName = sameYear ? `${compareYear} (compare)` : String(compareYear);
  const scopeLabel = scope === 'all' ? 'All submitted' : 'Verified only';
  const busy = loading && !data;
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  // Month-by-month series come from the API, bucketed by the month each report was submitted.
  const series = (key) => ({
    current: data?.monthlySeries?.[key]?.current || Array(12).fill(0),
    previous: data?.monthlySeries?.[key]?.previous || Array(12).fill(0),
  });
  const metricMeta = KPIS.find((k) => k.key === metric);
  const bars = useMemo(() => {
    const s = series(metric);
    return MONTHS.map((month, i) => ({ month, current: s.current[i], previous: s.previous[i] }));
  }, [data, metric]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = useMemo(() => {
    const sub = series('submitted').current;
    const ver = series('verified').current;
    return MONTHS.map((month, i) => ({ month, rate: sub[i] ? Math.round((ver[i] / sub[i]) * 100) : 0 }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const overallRate = val(data?.kpis?.submitted) ? Math.round((val(data?.kpis?.verified) / val(data?.kpis?.submitted)) * 100) : 0;

  const running = useMemo(() => {
    const s = series('submitted');
    let a = 0, b = 0;
    return MONTHS.map((month, i) => { a += s.current[i]; b += s.previous[i]; return { month, current: a, previous: b }; });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const pipeline = STAGES.map(([key, name]) => ({ key, name, value: Number(data?.pipeline?.[key]) || 0 })).filter((r) => r.value);
  const pipeTotal = sum(pipeline.map((r) => r.value));
  const byType = toRows(data?.byType);
  const byVehicle = toRows(data?.byVehicle);
  const byInjury = toRows(data?.byInjury);

  // Busy periods use the date and time each accident happened (reports with a map pin).
  const grid = useMemo(() => {
    const g = DAYS.map(() => SLOT_LABELS.map(() => 0));
    (data?.locations || []).forEach((r) => {
      if (!r.accident_date || !r.accident_time) return;
      const d = new Date(r.accident_date);
      const hour = parseInt(String(r.accident_time).slice(0, 2), 10);
      if (Number.isNaN(d.getTime()) || Number.isNaN(hour)) return;
      g[d.getDay()][Math.floor(hour / 2)]++;
    });
    return g;
  }, [data]);
  const timed = sum(grid.flat());
  const peak = useMemo(() => {
    let b = { v: 0, d: 0, s: 0 };
    grid.forEach((row, d) => row.forEach((v, s) => { if (v > b.v) b = { v, d, s }; }));
    return b.v ? `${DAYS[b.d]} ${SLOT_LABELS[b.s]} to ${SLOT_LABELS[(b.s + 1) % 12]}` : null;
  }, [grid]);

  const all = data?.reportList || [];
  const rows = (status ? all.filter((r) => r.status === status) : all);
  const visible = rows.slice(0, shown);

  return (
    <div className="container">
      <section className="an">
        <header className="an-head">
          <div>
            <h1>Analytics</h1>
            <p className="an-crumb"><Link to="/dashboard">Dashboard</Link> / Analytics</p>
            <p className="an-muted an-small">Public reports are not official until verified.</p>
          </div>
          <ExportMenu filters={{ ...filters, location }} />
        </header>

        <div className="an-filters" role="group" aria-label="Analytics filters">
          <Field label="Year">
            <select value={year} onChange={set('year')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          </Field>
          <Field label="Compare with">
            <select value={compareYear} onChange={set('compareYear')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          </Field>
          <Field label="Charts & map scope">
            <select value={scope} onChange={set('scope')}>
              <option value="verified">Verified only</option>
              <option value="all">All submitted</option>
            </select>
          </Field>
          <Field label="Accident type">
            <select value={typeId} onChange={set('typeId')}>
              <option value="">All types</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={set('status')}>
              <option value="">All statuses</option>
              {STAGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <input type="search" value={filters.location} onChange={set('location')} placeholder="Barangay / municipality" />
          </Field>
          {dirty && (
            <button type="button" className="an-reset" onClick={() => { setFilters(DEFAULT_FILTERS); setLocation(''); }}>
              <Icon name="reset" size={14} /> Reset
            </button>
          )}
        </div>

        {error && !data && <p className="an-error" role="alert">Could not load analytics. Check that the server is running.</p>}
        {USE_MOCK && <p className="an-muted an-small">Showing sample data.</p>}

        <div className="an-kpis">
          {KPIS.map((k) => (
            <div className="an-card an-kpi" key={k.key} style={{ '--tone': `var(${k.tone})` }}>
              <div className="an-kpi-head">
                <span className="an-ico"><Icon name={k.icon} /></span>
                <h2 className="an-title">{k.title}</h2>
              </div>
              <b className="an-kpi-n">{busy ? '–' : val(data?.kpis?.[k.key]).toLocaleString('en-US')}</b>
              {busy ? <span className="an-muted an-small">Loading…</span>
                : <Delta pct={data?.kpis?.[k.key]?.yoy} badUp={k.badUp} compareYear={compareYear} />}
            </div>
          ))}
        </div>

        <div className="an-row an-row-wide">
          <div className="an-card">
            <div className="an-card-head">
              <div>
                <h2 className="an-title">Reports per month</h2>
                <p className="an-sub">{metricMeta.title}, {year} against {compareYear}</p>
              </div>
              <select className="an-mini" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Measure">
                {KPIS.map((k) => <option key={k.key} value={k.key}>{k.title}</option>)}
              </select>
            </div>
            <Legend items={[{ name: curName, color: 'hsl(var(--accent))' }, { name: prevName, color: 'hsl(var(--status-in_progress))' }]} />
            {sum(bars.map((b) => b.current + b.previous)) ? <GroupedBars rows={bars} currentName={curName} previousName={prevName} />
              : <p className="an-empty">No {metricMeta.title.toLowerCase()} reports in {year} or {compareYear}.</p>}
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <div>
                <h2 className="an-title">Report pipeline</h2>
                <p className="an-sub">Where every {year} report stands</p>
              </div>
            </div>
            {pipeTotal ? <Ring rows={pipeline} label="reports" colorFor={(k, c) => c.status[k] || c.muted} />
              : <p className="an-empty">No reports yet.</p>}
          </div>
        </div>

        <div className="an-row">
          <div className="an-card">
            <div className="an-card-head">
              <div>
                <h2 className="an-title">Verification rate</h2>
                <p className="an-sub">Share of each month's reports that are now verified</p>
              </div>
              <div className="an-avg">
                <span className="an-muted an-small">Overall {overallRate}%</span>
                <div className="an-bar"><i style={{ width: `${overallRate}%`, background: 'hsl(var(--level-violet))' }} /></div>
              </div>
            </div>
            {sum(rate.map((r) => r.rate)) ? <SmoothLine rows={rate} dataKey="rate" name="Verified" unit="%" />
              : <p className="an-empty">No verified reports in {year} yet.</p>}
          </div>

          <div className="an-card">
            <div className="an-card-head">
              <div>
                <h2 className="an-title">Running total</h2>
                <p className="an-sub">Submitted reports added up through the year</p>
              </div>
              <span className="an-big">{running[11].current.toLocaleString('en-US')}</span>
            </div>
            {running[11].current + running[11].previous ? <AreaTrend rows={running} currentName={curName} previousName={prevName} />
              : <p className="an-empty">No reports in {year} or {compareYear}.</p>}
          </div>
        </div>

        <div className="an-row an-row-3">
          <div className="an-card">
            <div className="an-card-head"><h2 className="an-title">Accident types</h2><span className="an-muted an-small">{scopeLabel}</span></div>
            {byType.length ? <RankList rows={byType} /> : <p className="an-empty">No data</p>}
          </div>
          <div className="an-card">
            <div className="an-card-head"><h2 className="an-title">Vehicle types</h2><span className="an-muted an-small">{scopeLabel}</span></div>
            {byVehicle.length ? <ProgressList rows={byVehicle} /> : <p className="an-empty">No data</p>}
          </div>
          <div className="an-card">
            <div className="an-card-head"><h2 className="an-title">Injury level</h2><span className="an-muted an-small">{scopeLabel}</span></div>
            {byInjury.length
              ? <Ring rows={byInjury} label="reports" colorFor={(k, c) => (k === 'unknown' ? c.muted : c[{ none: 'green', injuries: 'amber', fatalities: 'red' }[k]] || c.muted)} />
              : <p className="an-empty">No data</p>}
          </div>
        </div>

        <div className="an-card">
          <div className="an-card-head">
            <div>
              <h2 className="an-title">Busy periods</h2>
              <p className="an-sub">When accidents happened, by weekday and two-hour block</p>
            </div>
            <span className="an-pill">{year}</span>
          </div>
          {timed ? (
            <>
              <div className="an-heat-meta">
                <span>Highest activity <b>{peak || '–'}</b></span><HeatLegend />
              </div>
              <Heat grid={grid} />
            </>
          ) : <p className="an-empty">Needs reports with a map pin, accident date and time.</p>}
        </div>

        <div className="an-card an-table-card">
          <div className="an-card-head">
            <div>
              <h2 className="an-title">Report list</h2>
              <p className="an-sub">
                {rows.length} {rows.length === 1 ? 'report' : 'reports'} submitted in {year}{status ? `, ${stageLabel(status).toLowerCase()}` : ''}
              </p>
            </div>
          </div>
          <div className="an-scroll">
            <table className="an-table">
              <thead><tr><th>Reference</th><th>Report</th><th>Location</th><th>Submitted</th><th>Progress</th><th>Status</th></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="an-ref">{r.report_reference || `#${r.id}`}</td>
                    <td><b>{r.title || r.category_name}</b>{r.title && r.category_name ? <small>{r.category_name}</small> : null}</td>
                    <td>{r.location}</td>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>
                      <div className="an-prog">
                        <div className="an-bar"><i style={{ width: `${STAGE_PROGRESS[r.status] ?? 0}%` }} /></div>
                        <span>{STAGE_PROGRESS[r.status] ?? 0}%</span>
                      </div>
                    </td>
                    <td><span className="an-status" style={{ '--s': stageVar(r.status) }}>{stageLabel(r.status)}</span></td>
                  </tr>
                ))}
                {!visible.length && <tr><td colSpan={6} className="an-empty-cell">{busy ? 'Loading…' : 'No reports match these filters.'}</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <button type="button" className="btn btn-secondary an-more" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more
            </button>
          )}
        </div>

        <p className="an-muted an-small an-foot">
          Each report is counted in the month it was submitted. Pending = Submitted + Under Review + Needs Clarification.
          Verified = verified by staff and not rejected. Closed = Resolved. KPIs, the pipeline and the report list always include
          every report; the scope filter affects the injury, type, vehicle and busy-period widgets. Status filters the report list
          and the export.
        </p>
      </section>
    </div>
  );
}
