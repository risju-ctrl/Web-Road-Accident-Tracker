import { dayLabel } from '../services/mapInsights';

const WINDOWS = [
  { key: 'all', label: 'Build up', hint: 'Every report up to this day' },
  { key: '30d', label: '30 d', hint: 'Only the 30 days before this day' },
  { key: '7d', label: '7 d', hint: 'Only the 7 days before this day' }
];

const SPEEDS = [1, 2, 4];

function Glyph({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Time replay: a slider over every day that has data, with play and pause. The page
// does the filtering; this only draws the controls and the daily activity strip.
export default function ReplayBar({
  startMs,
  dayCount,
  index,
  onIndex,
  playing,
  onPlay,
  speed,
  onSpeed,
  windowKey,
  onWindow,
  strip,
  stats,
  shifted = false,
  onClose
}) {
  const currentMs = startMs + index * 86400000;
  const peak = Math.max(1, ...strip);

  return (
    <section className={`mp-replay ${shifted ? 'is-shifted' : ''}`} aria-label="Time replay">
      <div className="mp-replay-top">
        <button
          type="button"
          className="mp-replay-play"
          onClick={onPlay}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
        >
          {playing
            ? <Glyph d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            : <Glyph d="M8 5.5v13l11-6.5z" />}
        </button>

        <div className="mp-replay-date">
          <strong>{dayLabel(currentMs)}</strong>
          <span>
            {stats.reports} {stats.reports === 1 ? 'report' : 'reports'} · {stats.hotspots} {stats.hotspots === 1 ? 'hotspot' : 'hotspots'}
          </span>
        </div>

        <div className="mp-seg mp-seg--sm mp-replay-window" role="group" aria-label="Replay window">
          {WINDOWS.map(option => (
            <button
              key={option.key}
              type="button"
              className={windowKey === option.key ? 'is-on' : ''}
              aria-pressed={windowKey === option.key}
              title={option.hint}
              onClick={() => onWindow(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="mp-replay-speed"
          onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          aria-label={`Replay speed ${speed} times. Click to change.`}
        >
          {speed}x
        </button>

        <button type="button" className="mp-replay-live" onClick={onClose}>
          Back to live
        </button>
      </div>

      <div className="mp-replay-track">
        <div className="mp-replay-strip" aria-hidden="true">
          {strip.map((count, i) => (
            <i
              key={i}
              className={i / strip.length <= index / Math.max(1, dayCount - 1) ? 'is-past' : ''}
              style={{ height: `${count === 0 ? 2 : 8 + (count / peak) * 92}%` }}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, dayCount - 1)}
          step={1}
          value={index}
          onChange={event => onIndex(Number(event.target.value))}
          aria-label="Replay date"
          aria-valuetext={dayLabel(currentMs)}
        />
      </div>

      <div className="mp-replay-ends" aria-hidden="true">
        <span>{dayLabel(startMs)}</span>
        <span>{dayLabel(startMs + (dayCount - 1) * 86400000)}</span>
      </div>
    </section>
  );
}
