// Turns an audit log's raw details into readable "Label  value" lines.
// The API can hand back the details as an object, a JSON string, or a JSON
// string that was encoded twice, so it is unwrapped up to twice before use.

const LABELS = {
  report_reference: 'Report',
  report_id: 'Report ID',
  verification_notes: 'Notes',
  findings: 'Findings',
  reason: 'Reason',
  description: 'Description'
};

const humanize = (value) => {
  const text = String(value).replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

function unwrap(details) {
  let value = details;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try { value = JSON.parse(value); } catch (e) { break; }
  }
  return value;
}

function toRows(details) {
  if (details === null || details === undefined || details === '') return [];
  if (typeof details !== 'object') return [['Details', String(details)]];

  const rest = { ...details };
  const rows = [];

  if ('old_status' in rest || 'new_status' in rest) {
    rows.push(['Status', `${humanize(rest.old_status ?? '?')} → ${humanize(rest.new_status ?? '?')}`]);
    delete rest.old_status;
    delete rest.new_status;
  }
  if ('from' in rest && 'to' in rest) {
    rows.push(['Role', `${humanize(rest.from)} → ${humanize(rest.to)}`]);
    delete rest.from;
    delete rest.to;
  }
  if ('role' in rest) {
    rows.push(['Role', humanize(rest.role)]);
    delete rest.role;
  }
  if ('is_active' in rest) {
    rows.push(['Account', Number(rest.is_active) ? 'Activated' : 'Deactivated']);
    delete rest.is_active;
  }

  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined || value === '') continue;
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    rows.push([LABELS[key] || humanize(key), text]);
  }
  return rows;
}

export default function AuditDetails({ details }) {
  const rows = toRows(unwrap(details));
  if (rows.length === 0) return <span style={{ color: 'hsl(var(--text-3))' }}>-</span>;

  return (
    <dl className="audit-details">
      {rows.map(([label, value], i) => (
        <div key={`${label}-${i}`}>
          <dt>{label}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
