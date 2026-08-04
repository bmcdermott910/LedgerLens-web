import { fmt } from '@/lib/finance';

// Compact dollar formatting for Y-axis tick labels, e.g. 45000 -> "$45k", -1250000 -> "-$1.3M".
function fmtAxis(n) {
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(1) + 'M';
  else if (abs >= 1_000) s = Math.round(abs / 1000) + 'k';
  else s = Math.round(abs).toString();
  return (neg ? '-$' : '$') + s;
}

// Simple actual-vs-budget line chart rendered as raw SVG -- no charting library dependency,
// since adding one to this project would mean pasting a large package-lock.json through the
// GitHub web editor, which isn't practical with how we're shipping changes right now.
export default function TrendChart({ title, series }) {
  const width = 520;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = series.flatMap((d) => [d.actual, d.budget]);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  // Zoom the Y-axis to the data's actual range (plus a little padding) instead of always
  // forcing $0 as the floor -- a series that stays in a tight band (e.g. $150k-$180k) should
  // show its real month-to-month movement, not look like a flat line against a $0 baseline.
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1;
  const maxV = rawMax + pad;
  const minV = rawMin - pad;
  const range = maxV - minV || 1;

  const x = (i) => padding.left + (i / Math.max(series.length - 1, 1)) * plotW;
  const y = (v) => padding.top + plotH - ((v - minV) / range) * plotH;

  const linePath = (key) =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  const zeroY = y(0);

  // 4 evenly-spaced Y-axis ticks from min to max of the plotted range.
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minV + (range * i) / tickCount);

  return (
    <div className="trend-chart">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {/* Y-axis gridlines + labels */}
        {ticks.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={padding.left} y1={y(t)} x2={width - padding.right} y2={y(t)}
              stroke="#eef1f5" strokeWidth="1"
            />
            <text x={padding.left - 8} y={y(t) + 3} fontSize="10" fill="#6b7685" textAnchor="end">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {/* zero baseline (bolder if zero falls within the range) */}
        {minV < 0 && maxV > 0 && (
          <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#c7cedb" strokeWidth="1.2" />
        )}
        {/* budget line (dashed, muted) */}
        <path d={linePath('budget')} fill="none" stroke="#6b7685" strokeWidth="1.5" strokeDasharray="4,3" />
        {/* actual line (solid, accent) */}
        <path d={linePath('actual')} fill="none" stroke="#2f6fed" strokeWidth="2" />
        {series.map((d, i) => (
          <circle key={`a-${d.month}`} cx={x(i)} cy={y(d.actual)} r="2.5" fill="#2f6fed" />
        ))}
        {series.map((d, i) => (
          <text key={`lbl-${d.month}`} x={x(i)} y={height - 8} fontSize="10" fill="#6b7685" textAnchor="middle">
            {d.month.slice(0, 3)}
          </text>
        ))}
      </svg>
      <div className="trend-legend">
        <span><i className="dot actual" /> Actual</span>
        <span><i className="dot budget" /> Budget</span>
        <span className="small-muted">
          Latest: {fmt(series[series.length - 1]?.actual)} actual / {fmt(series[series.length - 1]?.budget)} budget
        </span>
      </div>
    </div>
  );
}
