import { useMemo, useState } from 'react';
import {
  INSIGHT_PERIODS,
  WEEKDAYS,
  changeLabel,
  dayLabel,
  downloadCsv,
  hourCounts,
  isoDay,
  roadRanking,
  splitPeriods,
  toCsv,
  weekdayCounts
} from '../services/mapInsights';

const hourText = hour => `${String(hour).padStart(2, '0')}:00`;

function Bars({ counts, labels, peakIndex, unit }) {
  const max = Math.max(1, ...counts);

  return (
    <div className="mp-bars" role="img" aria-label={`${unit} pattern`}>
      {counts.map((count, i) => (
        <span
          key={i}
          className={`mp-bar-col ${i === peakIndex && count > 0 ? 'is-peak' : ''}`}
          title={`${labels[i]}: ${count} ${count === 1 ? 'report' : 'reports'}`}
        >
          <i style={{ height: `${count === 0 ? 2 : 6 + (count / max) * 94}%` }} />
        </span>
      ))}
    </div>
  );
}

function Delta({ now, before, compare }) {
  if (!compare) return null;

  const label = changeLabel(now, before);
  if (label === null) return null;

  const dir = label === 'new' || now > before ? 'up' : now < before ? 'down' : 'flat';

  return (
    <span className={`mp-delta is-${dir}`} title={`Previous period: ${before}`}>
      {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'} {label}
    </span>
  );
}

// Patterns that help decide where and when to patrol: weekday and hour of day,
// the roads with the most reports compared with the period before, and CSV export.
// `reports` should already exclude rejected reports. `when` maps report id to the
// moment the accident happened. `anchorMs` is the end of the period being viewed.
export default function InsightsPanel({ reports, when, anchorMs, onPickReport }) {
  const [periodKey, setPeriodKey] = useState('30d');
  const period = INSIGHT_PERIODS.find(option => option.key === periodKey) || INSIGHT_PERIODS[1];
  const compare = period.days !== Infinity;

  const data = useMemo(() => {
    const { current, previous } = splitPeriods(reports, when, anchorMs, period.days);
    const weekdays = weekdayCounts(current, when);
    const hours = hourCounts(current, when);
    const roads = roadRanking(current, previous, when);
    const serious = current.filter(r => r.severity === 'fatal' || r.severity === 'major').length;
    const seriousBefore = previous.filter(r => r.severity === 'fatal' || r.severity === 'major').length;

    return { current, previous, weekdays, hours, roads, serious, seriousBefore };
  }, [reports, when, anchorMs, period.days]);

  const peakDay = data.weekdays.indexOf(Math.max(...data.weekdays));
  const peakHour = data.hours.counts.indexOf(Math.max(...data.hours.counts));
  const hasDays = data.current.length > 0;
  const hasHours = data.hours.timed > 0;

  const exportInsights = () => {
    const rows = [
      ['Road accident insights'],
      ['Period', period.label, 'Ending', isoDay(anchorMs)],
      [],
      ['Section', 'Label', 'Reports', 'Previous period', 'Change'],
      ['Summary', 'All reports', data.current.length, compare ? data.previous.length : '', compare ? changeLabel(data.current.length, data.previous.length) || '' : ''],
      ['Summary', 'Fatal or major', data.serious, compare ? data.seriousBefore : '', compare ? changeLabel(data.serious, data.seriousBefore) || '' : ''],
      ...WEEKDAYS.map((name, i) => ['Weekday', name, data.weekdays[i], '', '']),
      ...data.hours.counts.map((count, hour) => ['Hour', hourText(hour), count, '', '']),
      ...data.roads.map(row => [
        'Road',
        row.label,
        row.now,
        compare ? row.before : '',
        compare ? changeLabel(row.now, row.before) || '' : ''
      ])
    ];

    downloadCsv(`accident-insights-${period.key}-${isoDay(anchorMs)}.csv`, toCsv(rows));
  };

  const exportReports = () => {
    const rows = [
      ['Reference', 'Title', 'Location', 'Severity', 'Status', 'Accident date', 'Accident time', 'Latitude', 'Longitude'],
      ...data.current.map(report => {
        const stamp = when.get(report.id);
        const moment = Number.isFinite(stamp?.ms) ? new Date(stamp.ms) : null;
        const pad = n => String(n).padStart(2, '0');

        return [
          report.report_reference,
          report.title,
          report.location,
          report.severity || '',
          String(report.status || '').replace(/_/g, ' '),
          moment ? isoDay(stamp.ms) : '',
          moment && stamp.timed ? `${pad(moment.getHours())}:${pad(moment.getMinutes())}` : '',
          report.latitude ?? '',
          report.longitude ?? ''
        ];
      })
    ];

    downloadCsv(`accident-reports-${period.key}-${isoDay(anchorMs)}.csv`, toCsv(rows));
  };

  return (
    <>
      <div className="mp-seg" role="group" aria-label="Insights period">
        {INSIGHT_PERIODS.map(option => (
          <button
            key={option.key}
            type="button"
            className={periodKey === option.key ? 'is-on' : ''}
            aria-pressed={periodKey === option.key}
            onClick={() => setPeriodKey(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mp-note mp-note--tight">
        {compare
          ? `Up to ${dayLabel(anchorMs)}, compared with the ${period.days} days before.`
          : `Every report up to ${dayLabel(anchorMs)}.`}
      </p>

      <div className="mp-kpis">
        <div className="mp-kpi">
          <span>Reports</span>
          <strong className="numeric">{data.current.length}</strong>
          <Delta now={data.current.length} before={data.previous.length} compare={compare} />
        </div>
        <div className="mp-kpi">
          <span>Fatal or major</span>
          <strong className="numeric">{data.serious}</strong>
          <Delta now={data.serious} before={data.seriousBefore} compare={compare} />
        </div>
        <div className="mp-kpi">
          <span>Busiest day</span>
          <strong>{hasDays ? WEEKDAYS[peakDay] : '–'}</strong>
          <em>{hasDays ? `${data.weekdays[peakDay]} reports` : 'No data'}</em>
        </div>
      </div>

      <h3 className="mp-sec">By day of week</h3>
      {hasDays ? (
        <>
          <Bars counts={data.weekdays} labels={WEEKDAYS} peakIndex={peakDay} unit="Weekday" />
          <div className="mp-bars-axis mp-bars-axis--week" aria-hidden="true">
            {WEEKDAYS.map(name => <span key={name}>{name.charAt(0)}</span>)}
          </div>
        </>
      ) : (
        <p className="mp-empty">No reports in this period.</p>
      )}

      <h3 className="mp-sec">By hour of day</h3>
      {hasHours ? (
        <>
          <Bars
            counts={data.hours.counts}
            labels={data.hours.counts.map((_, hour) => hourText(hour))}
            peakIndex={peakHour}
            unit="Hour"
          />
          <div className="mp-bars-axis" aria-hidden="true">
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>
          <p className="mp-note mp-note--tight">
            Peak hour: {hourText(peakHour)} to {hourText((peakHour + 1) % 24)}.
            {data.hours.timed < data.current.length
              ? ` ${data.current.length - data.hours.timed} ${data.current.length - data.hours.timed === 1 ? 'report has' : 'reports have'} no time and ${data.current.length - data.hours.timed === 1 ? 'is' : 'are'} left out.`
              : ''}
          </p>
        </>
      ) : (
        <p className="mp-empty">
          {hasDays ? 'None of these reports has a time of day.' : 'No reports in this period.'}
        </p>
      )}

      <h3 className="mp-sec">Accident-prone roads</h3>
      {data.roads.length === 0 ? (
        <p className="mp-empty">No reports in this period.</p>
      ) : (
        <ol className="mp-roads">
          {data.roads.map((row, index) => (
            <li key={row.key}>
              <button
                type="button"
                className="mp-road"
                onClick={() => row.latest && onPickReport(row.latest)}
                title="Show the latest report on this road"
              >
                <span className={`mp-rank sev-${row.worst}`}>{index + 1}</span>
                <span className="mp-road-text">
                  <strong>{row.label}</strong>
                  <em>{row.now} {row.now === 1 ? 'report' : 'reports'}{compare ? ` · before: ${row.before}` : ''}</em>
                </span>
                <Delta now={row.now} before={row.before} compare={compare} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="mp-note mp-note--tight">
        Roads are read from the first part of each report&apos;s location text, so spelling differences count as separate roads.
      </p>

      <h3 className="mp-sec">Export</h3>
      <div className="mp-export">
        <button type="button" className="btn btn-secondary" onClick={exportInsights} disabled={!hasDays}>
          Insights CSV
        </button>
        <button type="button" className="btn btn-secondary" onClick={exportReports} disabled={!hasDays}>
          Reports CSV
        </button>
      </div>
    </>
  );
}
