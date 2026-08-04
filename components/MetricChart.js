// Single-series line chart for standalone monthly metrics that have no budget comparison
// (cash balance, doomsday clock). Same raw-SVG approach and visual language as TrendChart --
// no charting library dependency -- but one line instead of actual-vs-budget, and a pluggable
// value formatter so the same component handles dollars and plain numbers (e.g. "years").
export default function MetricChart({ title, series, formatValue, subtitle }) {
  const width = 520;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 64 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = series.map((d) => Number(d.value) || 0);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  // Zoom to the data's own range rather than anchoring at zero, matching TrendChart -- these
  // series move within a fairly narrow band and would otherwise read as flat lines.
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1;
  const maxV = rawMax + pad;
  const minV = rawMin - pad;
  const range = maxV - minV || 1;

  const x = (i) => padding.left + (i / Math.max(series.length - 1, 1)) * plotW;
  const y = (v) => padding.top + plotH - ((v - minV) / range) * plotH;

  const linePath = series
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(d.value) || 0)}`)
    .join(' ');

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minV + (range * i) / tickCount);

  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;

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
        <path d={linePath} fill="none" stroke="#2f6fed" strokeWidth="2" />
        {series.map((d, i) => (
          <circle key={`pt-${d.label}`} cx={x(i)} cy={y(Number(d.value) || 0)} r="2.5" fill="#2f6fed" />
        ))}
        {/* Only every other month is labelled -- 12 full labels would overlap at this width. */}
        {series.map((d, i) =>
          i % 2 === 0 ? (
            <text key={`lbl-${d.label}`} x={x(i)} y={height - 8} fontSize="10" fill="#6b7685" textAnchor="middle">
              {d.label}
            </text>
          ) : null
        )}
      </svg>
      <div className="trend-legend">
        <span className="small-muted">
          {series[0]?.label}: {formatValue(first)} → {series[series.length - 1]?.label}: {formatValue(last)}
          {' '}({change >= 0 ? '+' : '−'}{formatValue(Math.abs(change))})
        </span>
      </div>
      {subtitle && <p className="small-muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
  );
}
