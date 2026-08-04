import { fmt } from '@/lib/finance';

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
  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  const range = maxV - minV || 1;

  const x = (i) => padding.left + (i / Math.max(series.length - 1, 1)) * plotW;
  const y = (v) => padding.top + plotH - ((v - minV) / range) * plotH;

  const linePath = (key) =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  const zeroY = y(0);

  return (
    <div className="trend-chart">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {/* zero baseline */}
        <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#e2e6ec" strokeWidth="1" />
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
