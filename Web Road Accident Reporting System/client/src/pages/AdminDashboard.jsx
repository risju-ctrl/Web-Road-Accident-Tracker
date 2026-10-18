import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useThemeColors } from '../theme';
import { ReportMap } from '../components/MapView';
import {
  Card, KpiCard, DashboardFilters, StageRail, DonutCard, HorizontalBarCard,
  VehicleStrip, NeedsAttentionTable, WidgetState, daysWaiting
} from '../components/dashboard/DashboardWidgets';
import { mockDashboard } from '../components/dashboard/mockDashboard';
import '../dashboard.css';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DASHBOARD === 'true';
const THIS_YEAR = new Date().getFullYear();

const KPI_ROWS = [
  ['submitted', 'Total Submitted'],
  ['pending', 'Pending'],
  ['verified', 'Verified (official)'],
  ['closed', 'Resolved / Closed'],
  ['fatal', 'Reports with Fatalities']
];

const isEmpty = (o) => !o || Object.keys(o).length === 0;
const stageName = (s) => s.replace(/_/g, ' ');

export default function AdminDashboard() {
  const c = useThemeColors();
  const [filters, setFilters] = useState({ year: THIS_YEAR, compareYear: THIS_YEAR - 1, scope: 'verified', typeId: '', location: '' });
  const [location, setLocation] = useState('');
  // The selected pipeline stage: a lens on the map and the queue, never a
  // rewrite of the counts above it.
  const [stage, setStage] = useState('submitted');
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // The location box is applied after a short pause so each keystroke is not a request.
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

  const injuryColors = { none: c.green, injuries: c.amber, fatalities: c.red, unknown: c.muted };
  // Colour minimap pins by report status so the map reads as analytics at a glance.
  const mapColor = (r) => c.status[r.status] || c.muted;
  const st = { loading: loading && !data, error: error && !data };

  const attention = data?.needsAttention || [];
  const over7 = attention.filter((r) => daysWaiting(r.created_at) >= 7).length;
  const pendingValue = data?.kpis?.pending?.value;
  const fatalValue = data?.kpis?.fatal?.value;
  const scoped = stage
    ? { pins: (data?.locations || []).filter((r) => r.status === stage), rows: attention.filter((r) => r.status === stage) }
    : { pins: data?.locations || [], rows: attention };
  const lens = stage ? stageName(stage) : null;

  return (
    <div className="container">
      <section className="ad">
        {/* One line of operational status: how bad is it, and what is overdue. */}
        <div className="ad-sit" role="status">
          <span><i className="ad-dot" style={{ background: c.amber }} /><b className="numeric">{pendingValue ?? '—'}</b> pending</span>
          <span><i className="ad-dot" style={{ background: over7 ? c.red : c.muted }} /><b className="numeric">{over7}</b> waiting over 7 days</span>
          <span><i className="ad-dot" style={{ background: c.red }} /><b className="numeric">{fatalValue ?? '—'}</b> reports with fatalities in {year}</span>
          {USE_MOCK && <span className="ad-sit-note">Showing sample data.</span>}
        </div>

        <header className="ad-hd">
          <div className="ad-brand">
            <h1>AGAP Analytics</h1>
            <p className="ad-sub">Public reports are not official until verified.</p>
          </div>
          <DashboardFilters filters={filters} years={years} categories={categories} onChange={setFilters} />
        </header>

        <div className="ad-kpis">
          {KPI_ROWS.map(([key, title]) => (
            <KpiCard key={key} title={title} kpi={data?.kpis?.[key]} {...st} />
          ))}
        </div>

        {/* The lifecycle rail is the console's spine. */}
        <div className="ad-railwrap">
          <h2 className="ad-sec-title">Report pipeline · {year}</h2>
          <StageRail counts={data?.pipeline || {}} selected={stage} onSelect={setStage} loading={st.loading} />
          <p className="ad-scope">
            {lens ? `Map and queue scoped to ${lens}.` : 'Map and queue show every stage.'}{' '}
            Counts never change with this selection.
          </p>
        </div>

        <section className="ad-panel ad-map" aria-label="Accident map">
          <h2 className="ad-sec-title">Report locations{lens ? ` · ${lens}` : ''}</h2>
          <div className="ad-map-frame">
            <ReportMap
              reports={scoped.pins}
              fitToReports
              colorFor={mapColor}
              basemap="night"
              height={400}
            />
          </div>
          <div className="ad-map-legend">
            {stage ? (
              <span><span className="ad-dot" style={{ background: c.status[stage] }} />{lens}</span>
            ) : (
              <>
                <span><span className="ad-dot" style={{ background: c.green }} />Verified</span>
                <span><span className="ad-dot" style={{ background: c.amber }} />Pending review</span>
              </>
            )}
            <span className="ad-count numeric">{scoped.pins.length} on map</span>
          </div>
        </section>

        {/* A column of cards, not a panel of cards: the panel chrome would nest
            a second frosted edge inside the first. */}
        <div className="ad-charts">
          <Card title="Reports by Accident Type">
            <WidgetState {...st} empty={isEmpty(data?.byType)}>
              <HorizontalBarCard data={data?.byType || {}} />
            </WidgetState>
          </Card>
          <Card title={`Reports by Injury Level (${scope === 'all' ? 'All submitted' : 'Verified only'})`}>
            <WidgetState {...st} empty={isEmpty(data?.byInjury)}>
              <DonutCard data={data?.byInjury || {}} colors={injuryColors} name="Reports by injury level" />
            </WidgetState>
          </Card>
          <Card title="Reports by Vehicle Type">
            <WidgetState {...st} empty={isEmpty(data?.byVehicle)}>
              <VehicleStrip data={data?.byVehicle || {}} />
            </WidgetState>
          </Card>
        </div>

        <section className="ad-panel ad-na" aria-label="Needs attention">
          <div className="ad-na-hd">
            <h2 className="ad-sec-title">Needs attention{lens ? ` · ${lens}` : ''} · oldest first</h2>
            {over7 > 0 && (
              <span className="ad-alert"><b className="numeric">{over7}</b> reports have waited over 7 days</span>
            )}
          </div>
          <WidgetState
            {...st}
            empty={!scoped.rows.length}
            emptyText={lens ? `Nothing is waiting in ${lens}` : 'Nothing is waiting for review'}
          >
            <NeedsAttentionTable rows={scoped.rows} />
          </WidgetState>
        </section>

        <div className="ad-df">
          <b>How numbers are counted.</b> Each report is counted in the month it was submitted. <b>Total Submitted</b> = all reports.
          {' '}<b>Pending</b> = Submitted + Under Review + Needs Clarification. <b>Verified</b> = verified by staff and not rejected.
          {' '}<b>Closed</b> = Resolved. <b>Fatalities</b> = reports marked as involving fatalities.
          {' '}KPIs and the pipeline always include every report. The scope filter affects the injury, type, vehicle and map widgets;
          the pipeline rail only lenses the map pins and the queue below it.
        </div>
      </section>
    </div>
  );
}
