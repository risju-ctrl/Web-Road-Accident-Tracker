import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '../../theme';

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const label = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Whole days a report has been waiting, floored at zero.
export const daysWaiting = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

// Shows a skeleton, an error, or an empty message; otherwise renders the children.
export function WidgetState({ loading, error, empty, children, emptyText = 'No data for these filters' }) {
  if (loading) return <div className="ad-skel" role="status" aria-label="Loading" />;
  if (error) return <div className="ad-state ad-err" role="alert">Could not load this widget</div>;
  if (empty) return <div className="ad-state">{emptyText}</div>;
  return children;
}

export function Card({ area, title, children }) {
  return (
    <section className={`ad-card${area ? ` ad-${area}` : ''}`} aria-label={title}>
      {title && <h2 className="ad-sec-title">{title}</h2>}
      {children}
    </section>
  );
}

export function DashboardFilters({ filters, years, categories, onChange }) {
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value });
  return (
    <div className="ad-filters">
      <label>Year
        <select value={filters.year} onChange={set('year')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
      </label>
      <label>Compare Year
        <select value={filters.compareYear} onChange={set('compareYear')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
      </label>
      <label>Charts &amp; map scope
        <select value={filters.scope} onChange={set('scope')}>
          <option value="verified">Verified only</option>
          <option value="all">All submitted</option>
        </select>
      </label>
      <label>Accident Type
        <select value={filters.typeId} onChange={set('typeId')}>
          <option value="">All types</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Location
        <input type="search" value={filters.location} onChange={set('location')} placeholder="Barangay / municipality" />
      </label>
    </div>
  );
}

// Drawn caret at the same stroke weight as the vehicle glyphs, so the delta
// reads as part of the icon system rather than as a text character.
const Caret = ({ up }) => (
  <svg className="ad-caret" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
    <path d={up ? 'M5 1.6 9.2 8.2H0.8z' : 'M5 8.4 0.8 1.8h8.4z'} />
  </svg>
);

export function YoyBadge({ value }) {
  if (value === null || value === undefined) return <span className="ad-yoy ad-yoy-none">— no comparison</span>;
  const down = value < 0;
  return (
    <span className={`ad-yoy ${down ? 'ad-dn' : 'ad-up'}`}>
      <Caret up={!down} /> {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// One compact reading in the KPI strip: the number carries the rank by scale,
// colour is left to carry meaning only.
export function KpiCard({ title, kpi, loading, error }) {
  return (
    <div className="ad-kpi" role="group" aria-label={title}>
      <WidgetState loading={loading} error={error} empty={!kpi}>
        {kpi && (
          <>
            <b className="ad-kv numeric">{fmt(kpi.value)}</b>
            <span className="ad-kl">{title}</span>
            <YoyBadge value={kpi.yoy} />
          </>
        )}
      </WidgetState>
    </div>
  );
}

// The console's spine: all eight lifecycle stages with counts and their share of
// the pipeline. Selecting a stage scopes the map and the queue only — it is a
// lens on the view, never a rewrite of the counts.
const STAGES = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];

export function StageRail({ counts, selected, onSelect, loading }) {
  const c = useThemeColors();
  const total = STAGES.reduce((a, s) => a + (Number(counts[s]) || 0), 0) || 1;

  if (loading) {
    return (
      <div className="ad-rail" aria-hidden="true">
        {STAGES.map((s) => <div key={s} className="ad-skel ad-stage-skel" />)}
      </div>
    );
  }

  return (
    <div className="ad-rail" role="group" aria-label="Report pipeline stages; selects the stage shown on the map and queue">
      {STAGES.map((s) => {
        const n = Number(counts[s]) || 0;
        const flag = s === 'needs_clarification';
        return (
          <button
            key={s}
            type="button"
            className={`ad-stage${selected === s ? ' is-sel' : ''}${flag ? ' is-flag' : ''}`}
            aria-pressed={selected === s}
            onClick={() => onSelect(selected === s ? null : s)}
          >
            <i className="ad-pip" style={{ background: c.status[s] }} aria-hidden="true" />
            <span className="ad-stage-n">{label(s)}</span>
            <b className="ad-stage-c numeric">{fmt(n)}</b>
            <span className="ad-stage-bar" aria-hidden="true">
              <span style={{ width: `${(n / total) * 100}%`, background: c.status[s] }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DonutCard({ data, colors, name }) {
  const items = Object.entries(data).map(([k, v], i) => ({ key: k, name: label(k), value: v, color: colors[k] || colors.__fallback[i % colors.__fallback.length] }));
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="ad-donut">
      <div className="ring" role="img" aria-label={`${name}: ${items.map((i) => `${i.name} ${i.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
              {items.map((i) => <Cell key={i.key} fill={i.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--surface-2))',
                border: '1px solid hsl(var(--line) / var(--line-strong-alpha))',
                borderRadius: '6px',
                color: 'hsl(var(--text-1))',
                fontSize: '0.8125rem',
                padding: '6px 8px'
              }}
              labelStyle={{ color: 'hsl(var(--text-1))' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="ctr numeric">{fmt(total)}</div>
      </div>
      <ul className="ad-lg">
        {items.map((i) => (
          <li key={i.key}><i style={{ background: i.color }} />{i.name} <b>{total ? ((i.value / total) * 100).toFixed(1) : 0}%</b></li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBarCard({ data }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div role="img" aria-label={`Bar chart: ${rows.map(([k, v]) => `${k} ${v}`).join(', ')}`}>
      {rows.map(([k, v]) => (
        <div className="ad-bar" key={k}>
          <span className="l" title={k}>{k}</span>
          <div className="tr"><div className="f ad-bar-fill" style={{ width: `${Math.max((v / max) * 85, 1)}%` }} /><b className="numeric">{fmt(v)}</b></div>
        </div>
      ))}
    </div>
  );
}

// Vehicle marks are drawn glyphs, not emoji, so weight and stroke stay
// consistent and the strip survives any font fallback.
const VEHICLE_GLYPH = {
  Motorcycle: 'M5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm14 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 12.5h5l3-4h4l2.2 4M12 8.5 9.5 12',
  Tricycle: 'M6 16a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 13.5V7h6l3 4h3M8.5 7v3',
  Car: 'M4 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.5 12.5 6 8h12l1.5 4.5M4 12.5h16',
  Truck: 'M3 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 12.5V6h9v6.5M12 9h4l3 3v.5',
  'Bus/Jeepney': 'M5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 12.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.5M5 9h14M9 4v5',
  Bicycle: 'M6 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 13l4-6h5l3 6M10 7h5',
  Other: 'M4 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.5 12.5 6 8h12l1.5 4.5',
  Unspecified: 'M12 17v.01M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.3-1.4 1-1.4 1.9v.3'
};

export function VehicleStrip({ data }) {
  const c = useThemeColors();
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="ad-veh">
      {rows.map(([k, v]) => (
        <div key={k}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke={c.accentText} strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={VEHICLE_GLYPH[k] || VEHICLE_GLYPH.Other} />
          </svg>
          <b className="numeric">{fmt(v)}</b><small>{k}</small>
        </div>
      ))}
    </div>
  );
}

export function NeedsAttentionTable({ rows }) {
  return (
    <div className="ad-scroll">
      <table className="ad-tbl">
        <thead><tr><th>Reference</th><th>Title</th><th>Type</th><th>Location</th><th>Status</th><th>Submitted</th><th>Waiting</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const d = daysWaiting(r.created_at);
            const hot = d >= 7;
            return (
              <tr key={r.id} className={hot ? 'is-hot' : undefined}>
                <td><Link to={`/reports/${r.id}`} className="ad-ref">{r.report_reference}</Link></td>
                <td><Link to={`/reports/${r.id}`}>{r.title}</Link></td>
                <td>{r.category_name || 'Uncategorized'}</td>
                <td>{r.location}</td>
                <td><span className={`badge badge-${r.status}`}>{label(r.status)}</span></td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td className={`ad-wait numeric${hot ? ' is-hot' : ''}`}>{d} d</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
