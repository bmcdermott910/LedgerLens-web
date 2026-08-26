import ChartHover from './ChartHover';

// Quarterly single-series line chart for the 5 Year Trend tab. Same visual language as
// MetricChart, with two differences that the forward-looking view needs:
//   - a null value is a gap, not a zero, so quarters whose budget does not exist yet simply
//     stop the line instead of dragging it to the floor;
//   - actual quarters draw solid, projected quarters dashed and hollow, so nobody mistakes a
//     forecast point for a reported one.
export default function QuarterChart({
  title, points, valueKey, formatValue, formatExact, subtitle,
}) {
  // See MetricChart: the axis may abbreviate, the tooltip should not.
  const exact = formatExact || formatValue;
  const width = 520;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 64 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const withValue = points
    .map((p, i) => ({ ...p, i, value: p[valueKey] }))
    .filter((p) => p.value !== null && p.value !== undefined && Number.isFinite(Number(p.value)));

  if (!withValue.length) {
    return (
      <div className="trend-chart">
        <h3>{title}</h3>
        <p className="small-muted">No data yet.</p>
      </div>
    );
  }

  const values = withValue.map((p) => Number(p.value));
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1;
  const maxV = rawMax + pad;
  const minV = rawMin - pad;
  const range = maxV - minV || 1;

  const x = (i) => padding.left + (i / Math.max(points.length - 1, 1)) * plotW;
  const y = (v) => padding.top + plotH - ((v - minV) / range) * plotH;

  // One solid path across the reported quarters, one dashed path across the projected ones.
  // The dashed path starts at the last reported point so the two join up rather than floating.
  const lastActualIdx = withValue.reduce((acc, p, k) => (p.isActual ? k : acc), -1);
  const solid = withValue.slice(0, lastActualIdx + 1);
  const dashed = lastActualIdx >= 0 ? withValue.slice(lastActualIdx) : withValue;
  const toPath = (pts) =>
    pts.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i)} ${y(Number(p.value))}`).join(' ');

  const ticks = Array.from({ length: 5 }, (_, i) => minV + (range * i) / 4);
  const first = withValue[0];
  const last = withValue[withValue.length - 1];
  const change = Number(last.value) - Number(first.value);

  return (
    <div className="trend-chart">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {ticks.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={padding.left} y1={y(t)} x2={width - padding.right} y2={y(t)}
              stroke="#eef1f5" strokeWidth="1"
            />
            <text x={padding.left - 8} y={y(t) + 3} fontSize="10" fill="#6b7685" textAnchor="end">
              {formatValue(t)}
            </text>
          </g>
        ))}
        {solid.length > 1 && <path d={toPath(solid)} fill="none" stroke="#2f6fed" strokeWidth="2" />}
        {dashed.length > 1 && (
          <path d={toPath(dashed)} fill="none" stroke="#2f6fed" strokeWidth="2" strokeDasharray="5 4" />
        )}
        {withValue.map((p) => (
          <circle
            key={`pt-${p.label}`}
            cx={x(p.i)} cy={y(Number(p.value))} r="2.8"
            fill={p.isActual ? '#2f6fed' : '#fff'}
            stroke="#2f6fed" strokeWidth="1.5"
          />
        ))}
        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text key={`lbl-${p.label}`} x={x(i)} y={height - 8} fontSize="10" fill="#6b7685" textAnchor="middle">
              {p.label}
            </text>
          ) : null
        )}
        <ChartHover
          width={width}
          xs={points.map((p, i) => x(i))}
          plotTop={padding.top}
          plotBottom={padding.top + plotH}
          plotLeft={padding.left}
          plotRight={width - padding.right}
          entries={points.map((p) => {
            const v = p[valueKey];
            const has = v !== null && v !== undefined && Number.isFinite(Number(v));
            return {
              label: p.label,
              rows: [{
                name: p.isActual ? 'Reported' : 'Projected',
                color: '#2f6fed',
                text: has ? exact(Number(v)) : 'no data yet',
                y: has ? y(Number(v)) : null,
              }],
            };
          })}
        />
      </svg>
      <div className="trend-legend">
        <span><span className="dot actual" /> Reported</span>
        <span><span className="dot projected" /> Projected</span>
        <span className="small-muted">
          {first.label}: {formatValue(Number(first.value))} → {last.label}:{' '}
          {formatValue(Number(last.value))} ({change >= 0 ? '+' : '−'}
          {formatValue(Math.abs(change))})
        </span>
      </div>
      {subtitle && <p className="small-muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
  );
}
