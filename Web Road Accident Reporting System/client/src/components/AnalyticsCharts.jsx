import { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, Cell, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

/* Light "Analytics" kit: icons, chart pieces and helpers. Recharts is the library Tremor is built on. */

export const RED = '#e5383b';
export const STAGES = [
  ['submitted', 'Submitted', '#94a3b8'],
  ['under_review', 'Under review', '#f59e0b'],
  ['needs_clarification', 'Needs clarification', '#f97316'],
  ['verified', 'Verified', '#06b6d4'],
  ['assigned', 'Assigned', '#8b5cf6'],
  ['in_progress', 'In progress', '#3b82f6'],
  ['resolved', 'Resolved', '#10b981'],
  ['rejected', 'Rejected', '#ef4444'],
];
export const STAGE_PROGRESS = {
  submitted: 15, under_review: 30, needs_clarification: 30, verified: 50,
  assigned: 65, in_progress: 80, resolved: 100, rejected: 0,
};
export const stageLabel = (k) => STAGES.find((s) => s[0] === k)?.[1] || String(k).replace(/_/g, ' ');
export const stageColor = (k) => STAGES.find((s) => s[0] === k)?.[2] || '#94a3b8';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const SLOT_LABELS = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];

const pretty = (s) => String(s).replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
const num = (v) => (v && typeof v === 'object' ? Number(v.count ?? v.value ?? v.total ?? 0) : Number(v) || 0);
export const toRows = (obj) =>
  Object.entries(obj || {})
    .map(([key, v]) => ({ key, name: pretty(key), value: num(v) }))
    .sort((a, b) => b.value - a.value);

/* ---------------- theme ---------------- */
/* Follows the app's own light/dark setting: data-theme / class on <html>, else the page background colour. */
function readDark() {
  const html = document.documentElement, body = document.body;
  const attr = html.dataset.theme || html.getAttribute('data-bs-theme') || html.dataset.mode
    || body.dataset.theme || body.dataset.mode;
  if (attr) return /dark/i.test(attr);
  const cls = `${html.className} ${body.className}`;
  if (/\bdark\b/i.test(cls) || /theme-dark|dark-mode/i.test(cls)) return true;
  if (/\blight\b/i.test(cls) || /theme-light|light-mode/i.test(cls)) return false;
  for (const el of [body, html]) {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (m && (m[3] === undefined || Number(m[3]) > 0.05)) {
      return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 < 0.5;
    }
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}
export function useIsDark() {
  const [dark, setDark] = useState(readDark);
  useEffect(() => {
    const update = () => setDark(readDark());
    const mo = new MutationObserver(update);
    const watch = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-bs-theme', 'data-mode', 'style'] };
    mo.observe(document.documentElement, watch);
    mo.observe(document.body, watch);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', update);
    window.addEventListener('storage', update);
    return () => { mo.disconnect(); mq?.removeEventListener?.('change', update); window.removeEventListener('storage', update); };
  }, []);
  return dark;
}

/* ---------------- icons ---------------- */
const PATHS = {
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>,
  check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  alert: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
};
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
);

/* ---------------- small pieces ---------------- */
export const Chip = ({ pct }) => {
  if (pct == null) return <span className="ax-muted ax-small">no comparison</span>;
  const up = pct >= 0;
  return <span className={`ax-chip ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{pct}% {up ? '\u2197' : '\u2198'}</span>;
};

export function ProgressList({ rows, color = RED }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="ax-plist">
      {rows.map((r) => {
        const p = Math.round((r.value / total) * 100);
        return (
          <li key={r.key}>
            <div className="ax-plist-top">
              <b>{r.name}</b>
              <span className="ax-muted">{r.value} {r.value === 1 ? 'Report' : 'Reports'}</span>
              <span className="ax-plist-pct">{p}%</span>
            </div>
            <div className="ax-bar"><i style={{ width: `${p}%`, background: r.color || color }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

export function RankList({ rows }) {
  return (
    <ul className="ax-rank">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="ax-badge">{r.name.slice(0, 1)}</span>
          <b>{r.name}</b>
          <span className="ax-rank-n"><b>{r.value}</b><small>{r.value === 1 ? 'Report' : 'Reports'}</small></span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- charts ---------------- */
const tipFor = (dark) => ({
  contentStyle: dark
    ? { background: '#1b1b1d', border: '1px solid #2a2a2d', borderRadius: 10, fontSize: 12 }
    : { background: '#fff', border: '1px solid #ececee', borderRadius: 10, fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,.08)' },
  labelStyle: { color: dark ? '#9a9aa2' : '#6b6b73' },
  itemStyle: { color: dark ? '#f2f2f3' : '#1b1b1f' },
  cursor: { fill: 'rgba(229,56,59,.08)' },
});

/* Faded bars + smooth trend line; the busiest month is picked out in dark, like the reference. */
export function ComboChart({ rows, dark }) {
  const peak = rows.reduce((best, r, i) => (r.Reports > rows[best].Reports ? i : best), 0);
  const axis = { stroke: dark ? '#8f8f98' : '#9a9aa2', fontSize: 11, tickLine: false, axisLine: false };
  const bar = dark ? '#3b2427' : '#fbd9da';
  const hi = dark ? '#f4f4f5' : '#1f2023';
  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={rows} margin={{ left: -22, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke={dark ? '#2a2a2d' : '#efeff1'} />
        <XAxis dataKey="month" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tipFor(dark)} />
        <Bar dataKey="Reports" radius={[6, 6, 0, 0]} barSize={22} isAnimationActive={false}>
          {rows.map((r, i) => <Cell key={r.month} fill={i === peak && r.Reports ? hi : bar} />)}
        </Bar>
        <Line type="monotone" dataKey="Trend" stroke={RED} strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const heatScale = (dark) => (dark
  ? { empty: '#252528', lv: ['#4a2327', '#8a2f35', '#e5383b'], peak: '#f4f4f5' }
  : { empty: '#f6f6f7', lv: ['#fde3e3', '#f9b4b6', '#ee6a70'], peak: '#1f2023' });
export function Heat({ grid, dark }) {
  const sc = heatScale(dark);
  const max = Math.max(1, ...grid.flat());
  const shade = (v) => (!v ? sc.empty : v === max && max > 1 ? sc.peak : sc.lv[Math.min(2, Math.floor((v / max) * 3))]);
  return (
    <div className="ax-heat">
      {DAYS.map((d, di) => (
        <div key={d} className="ax-heat-row">
          <span>{d}</span>
          {grid[di].map((v, si) => (
            <i key={si} style={{ background: shade(v) }} title={`${d} ${SLOT_LABELS[si]}: ${v} report${v === 1 ? '' : 's'}`} />
          ))}
        </div>
      ))}
      <div className="ax-heat-row ax-heat-x">
        <span />
        {SLOT_LABELS.map((l) => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}
export const HeatLegend = ({ dark }) => {
  const sc = heatScale(dark);
  return <span className="ax-legend">Less {[...sc.lv, sc.peak].map((c) => <i key={c} style={{ background: c }} />)} More</span>;
};

export function Donut({ rows, colors, dark }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="ax-donut">
      <div className="ax-donut-chart">
        <PieChart width={150} height={150}>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70}
            paddingAngle={rows.length > 1 ? 3 : 0} cornerRadius={5} stroke="none" isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.key} fill={colors[r.key] || '#9ca3af'} />)}
          </Pie>
          <Tooltip {...tipFor(dark)} />
        </PieChart>
        <b>{total}</b>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <i style={{ background: colors[r.key] || '#9ca3af' }} />
            <span>{r.name}</span><b>{r.value}</b>
            <span className="ax-muted">{total ? `${Math.round((r.value / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
