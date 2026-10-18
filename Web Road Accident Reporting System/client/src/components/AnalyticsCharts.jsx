import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot,
} from 'recharts';
import { useThemeColors } from '../theme';

/* Analytics kit. Every colour comes from the app's design tokens (index.css), so the page follows
   the light/dark toggle like the rest of the site. Recharts needs concrete colour strings for SVG
   attributes, so those come from useThemeColors(); plain HTML uses hsl(var(--token)) directly. */

export const STAGES = [
  ['submitted', 'Submitted'],
  ['under_review', 'Under review'],
  ['needs_clarification', 'Needs clarification'],
  ['verified', 'Verified'],
  ['assigned', 'Assigned'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
  ['rejected', 'Rejected'],
];
export const STAGE_PROGRESS = {
  submitted: 15, under_review: 30, needs_clarification: 30, verified: 50,
  assigned: 65, in_progress: 80, resolved: 100, rejected: 0,
};
export const stageLabel = (k) => STAGES.find((s) => s[0] === k)?.[1] || String(k).replace(/_/g, ' ');
export const stageVar = (k) => `var(--status-${k})`;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const SLOT_LABELS = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];

const pretty = (s) => String(s).replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
const num = (v) => (v && typeof v === 'object' ? Number(v.count ?? v.value ?? v.total ?? 0) : Number(v) || 0);
export const toRows = (obj) =>
  Object.entries(obj || {})
    .map(([key, v]) => ({ key, name: pretty(key), value: num(v) }))
    .sort((a, b) => b.value - a.value);

/* ---------------- icons ---------------- */
const PATHS = {
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>,
  check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  alert: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  chevron: <polyline points="6 9 12 15 18 9" />,
  reset: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
};
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
);

/* ---------------- small pieces ---------------- */
/* `badUp`: a rise is bad news (pending, fatalities), so it shows red instead of green. */
export function Delta({ pct, badUp = false, compareYear }) {
  if (pct == null || Number.isNaN(Number(pct))) {
    return <span className="an-muted an-small">No {compareYear} data to compare</span>;
  }
  const v = Number(pct);
  if (v === 0) return <span className="an-delta is-flat">No change<span className="an-delta-vs">vs {compareYear}</span></span>;
  const up = v > 0;
  const good = badUp ? !up : up;
  return (
    <span className={`an-delta ${good ? 'is-good' : 'is-bad'}`}>
      <svg viewBox="0 0 10 10" width="9" height="9" fill="currentColor" aria-hidden="true">
        <path d={up ? 'M5 1.6 9.2 8.2H0.8z' : 'M5 8.4 0.8 1.8h8.4z'} />
      </svg>
      {Math.abs(v).toFixed(1)}%
      <span className="an-delta-vs">vs {compareYear}</span>
    </span>
  );
}

export function ProgressList({ rows, color }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="an-plist">
      {rows.map((r) => {
        const p = Math.round((r.value / total) * 100);
        return (
          <li key={r.key}>
            <div className="an-plist-top">
              <b>{r.name}</b>
              <span className="an-muted">{r.value} {r.value === 1 ? 'report' : 'reports'}</span>
              <span className="an-plist-pct">{p}%</span>
            </div>
            <div className="an-bar"><i style={{ width: `${p}%`, background: r.color || color || 'hsl(var(--accent))' }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

export function RankList({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="an-rank">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="an-badge">{r.name.slice(0, 1)}</span>
          <div className="an-rank-main">
            <b>{r.name}</b>
            <div className="an-bar"><i style={{ width: `${(r.value / max) * 100}%` }} /></div>
          </div>
          <span className="an-rank-n"><b>{r.value}</b><small>{r.value === 1 ? 'report' : 'reports'}</small></span>
        </li>
      ))}
    </ul>
  );
}

export const Legend = ({ items }) => (
  <ul className="an-key">
    {items.map((i) => <li key={i.name}><i style={{ background: i.color }} />{i.name}</li>)}
  </ul>
);

/* ---------------- charts ---------------- */
const tip = {
  contentStyle: {
    background: 'hsl(var(--surface-2))', border: '1px solid hsl(var(--line) / 0.2)', borderRadius: 10,
    fontSize: 12, boxShadow: '0 10px 28px hsl(var(--shadow-color) / var(--shadow-alpha))',
  },
  labelStyle: { color: 'hsl(var(--text-3))', marginBottom: 2 },
  itemStyle: { color: 'hsl(var(--text-1))' },
};
const axisProps = (c) => ({ stroke: c.muted, fontSize: 11, tickLine: false, axisLine: false });

/* Two bars per month: the selected year against the comparison year. */
export function GroupedBars({ rows, currentName, previousName }) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ left: -18, right: 4, top: 8 }} barGap={3} barCategoryGap="24%">
        <CartesianGrid vertical={false} strokeDasharray="3 5" stroke={c.grid} />
        <XAxis dataKey="month" {...axisProps(c)} />
        <YAxis allowDecimals={false} {...axisProps(c)} />
        <Tooltip {...tip} cursor={{ fill: c.grid }} />
        <Bar dataKey="current" name={currentName} fill={c.accent} radius={[6, 6, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        <Bar dataKey="previous" name={previousName} fill={c.status.in_progress} radius={[6, 6, 0, 0]} maxBarSize={14} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* Smooth gradient line with the best month picked out by a dot and a drop line. */
export function SmoothLine({ rows, dataKey, name, unit = '' }) {
  const c = useThemeColors();
  const best = rows.reduce((b, r, i) => (r[dataKey] > rows[b][dataKey] ? i : b), 0);
  const peak = rows[best];
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={rows} margin={{ left: -18, right: 8, top: 22 }}>
        <defs>
          <linearGradient id="an-line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c.accent} />
            <stop offset="100%" stopColor={c.violet} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 5" stroke={c.grid} />
        <XAxis dataKey="month" {...axisProps(c)} />
        <YAxis allowDecimals={false} domain={[0, 100]} unit={unit} {...axisProps(c)} />
        <Tooltip {...tip} formatter={(v) => [`${v}${unit}`, name]} cursor={{ stroke: c.grid }} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke="url(#an-line-grad)" strokeWidth={3}
          dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
        {peak?.[dataKey] > 0 && (
          <ReferenceDot x={peak.month} y={peak[dataKey]} r={5} fill={c.violet} stroke={c.accentText} strokeWidth={2}
            label={{ value: `${peak[dataKey]}${unit}`, position: 'top', fill: c.violet, fontSize: 11, fontWeight: 600 }} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* Filled area for a running total; the comparison year is a dashed outline behind it. */
export function AreaTrend({ rows, currentName, previousName }) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={rows} margin={{ left: -18, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="an-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.accent} stopOpacity={0.4} />
            <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 5" stroke={c.grid} />
        <XAxis dataKey="month" {...axisProps(c)} />
        <YAxis allowDecimals={false} {...axisProps(c)} />
        <Tooltip {...tip} cursor={{ stroke: c.grid }} />
        <Area type="monotone" dataKey="previous" name={previousName} stroke={c.muted} strokeDasharray="4 4"
          strokeWidth={1.5} fill="none" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="current" name={currentName} stroke={c.accent} strokeWidth={2.5}
          fill="url(#an-area-grad)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* Multi-colour ring with the total in the hole and a two-column legend underneath. */
export function Ring({ rows, colorFor, label }) {
  const c = useThemeColors();
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="an-ring">
      <div className="an-ring-chart">
        <PieChart width={190} height={190}>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={62} outerRadius={86}
            paddingAngle={rows.length > 1 ? 3 : 0} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}
            isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.key} fill={colorFor(r.key, c)} />)}
          </Pie>
          <Tooltip {...tip} />
        </PieChart>
        <div className="an-ring-c"><b>{total}</b><small>{label}</small></div>
      </div>
      <ul className="an-ring-legend">
        {rows.map((r) => (
          <li key={r.key}>
            <i style={{ background: colorFor(r.key, c) }} />
            <span>{r.name}</span>
            <b>{r.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Day x 2-hour grid. Busier cells are darker; the busiest is called out in amber. */
const heatShade = (v, max) => {
  if (!v) return 'hsl(var(--line) / 0.07)';
  if (v === max && max > 1) return 'hsl(var(--level-heavy))';
  const a = [0.28, 0.55, 0.9][Math.min(2, Math.floor((v / max) * 3))];
  return `hsl(var(--accent) / ${a})`;
};
export function Heat({ grid }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="an-heat">
      {DAYS.map((d, di) => (
        <div key={d} className="an-heat-row">
          <span>{d}</span>
          {grid[di].map((v, si) => (
            <i key={si} style={{ background: heatShade(v, max) }}
              title={`${d} ${SLOT_LABELS[si]}: ${v} report${v === 1 ? '' : 's'}`} />
          ))}
        </div>
      ))}
      <div className="an-heat-row an-heat-x">
        <span />
        {SLOT_LABELS.map((l) => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}
export const HeatLegend = () => (
  <span className="an-heat-legend">
    Less
    {[0.28, 0.55, 0.9].map((a) => <i key={a} style={{ background: `hsl(var(--accent) / ${a})` }} />)}
    <i style={{ background: 'hsl(var(--level-heavy))' }} />
    More
  </span>
);
