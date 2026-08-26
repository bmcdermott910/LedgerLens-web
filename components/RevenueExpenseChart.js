import { fmt } from '@/lib/finance';
import ChartHover from './ChartHover';

// Four series on one pair of axes, so revenue and spend can be read against their budgets in a
// single glance rather than by flicking between the small paired charts above. Revenue is green
// and expenses red because that is how a reader already expects them to sit; actuals are solid
// and budgets are the same hue dashed and lighter, so the pairing is obvious without the legend.
const SERIES = [
  { key: 'revenue', name: 'Total Revenue', color: '#1f9254', dash: null },
  { key: 'revenueBudget', name: 'Budgeted Revenue', color: '#7cc79b', dash: '5 4' },
  { key: 'expenses', name: 'Total Expenses', color: '#c0392b', dash: null },
  { key: 'expensesBudget', name: 'Budgeted Expenses', color: '#e0958c', dash: '5 4' },
];

function fmtAxis(n) {
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(2) + 'M';
  else if (abs >= 1_000) s = Math.round(abs / 1000) + 'k';
  else s = Math.round(abs).toString();
  return (neg ? '-$' : '$') + s;
}

export default function RevenueExpenseChart({ series, title, subtitle }) {
  // Twice the height and roughly twice the width of the small trend charts: four series in one
  // frame need the room, and this one sits full-width rather than in the two-column grid.
  const width = 1080;
  const height = 400;
  const padding = { top: 20, right: 24, bottom: 34, left: 76 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (!series.length) {
    return (
      <div className="trend-chart">
        <h3>{title}</h3>
        <p className="small-muted">No months loaded yet.</p>
      </div>
    );
  }

  const values = series.flatMap((d) => SERIES.map((s) => Number(d[s.key]) || 0));
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values, 0);   // spend and revenue are both positive, so anchor at 0
  const pad = (rawMax - rawMin) * 0.1 || Math.abs(rawMax) * 0.1 || 1;
  const maxV = rawMax + pad;
  const minV = rawMin;
  const range = maxV - minV || 1;

  const x = (i) => padding.left + (i / Math.max(series.length - 1, 1)) * plotW;
  const y = (v) => padding.top + plotH - ((v - minV) / range) * plotH;

  const path = (key) =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(d[key]) || 0)}`).join(' ');

  const ticks = Array.from({ length: 6 }, (_, i) => minV + (range * i) / 5);
  const totals = Object.fromEntries(
    SERIES.map((s) => [s.key, series.reduce((t, d) => t + (Number(d[s.key]) || 0), 0)])
  );

  return (
    <div className="trend-chart wide-chart">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {ticks.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={padding.left} y1={y(t)} x2={width - padding.right} y2={y(t)}
              stroke="#eef1f5" strokeWidth="1"
            />
            <text x={padding.left - 8} y={y(t) + 3} fontSize="11" fill="#6b7685" textAnchor="end">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {SERIES.map((s) => (
          <path
            key={s.key}
            d={path(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dash ? 1.8 : 2.4}
            strokeDasharray={s.dash || undefined}
          />
        ))}
        {SERIES.filter((s) => !s.dash).map((s) =>
          series.map((d, i) => (
            <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(Number(d[s.key]) || 0)} r="3" fill={s.color} />
          ))
        )}
        {/* This chart is wide enough to label every month, unlike the compact ones above. */}
        {series.map((d, i) => (
          <text key={`lbl-${d.label}`} x={x(i)} y={height - 10} fontSize="11" fill="#6b7685" textAnchor="middle">
            {d.label.slice(0, 3)}
          </text>
        ))}
        <ChartHover
          width={width}
          xs={series.map((d, i) => x(i))}
          plotTop={padding.top}
          plotBottom={padding.top + plotH}
          plotLeft={padding.left}
          plotRight={width - padding.right}
          entries={series.map((d) => ({
            label: d.label,
            rows: SERIES.map((s) => ({
              name: s.name,
              color: s.color,
              text: fmt(Number(d[s.key]) || 0),
              y: y(Number(d[s.key]) || 0),
            })),
          }))}
        />
      </svg>
      <div className="trend-legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i className="dot" style={{ background: s.color }} /> {s.name} {fmt(totals[s.key])}
          </span>
        ))}
      </div>
      {subtitle && <p className="small-muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
  );
}
