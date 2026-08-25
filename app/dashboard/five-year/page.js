import {
  annualBucketsFor, forecastBucketsFor, monthlyBurnSeries, buildQuarterlySeries,
} from '@/lib/finance';
import {
  fetchAnnualSummary, fetchForecastRows, fetchCashMetrics, fetchGlRows, fetchMonths,
} from '@/lib/queries';
import FiveYearTable from '@/components/FiveYearTable';
import QuarterChart from '@/components/QuarterChart';

export const dynamic = 'force-dynamic';

// Same four entities as the Board Summary tab, in the same order.
const ENTITIES = [
  { label: 'Wendal Inc. (RIA + IJT + Admin)', classes: ['RIA', 'IJT', 'Admin'] },
  { label: 'Connetic RIA (RIA)', classes: ['RIA'] },
  { label: 'InnerJoin Technologies (IJT)', classes: ['IJT'] },
  { label: 'Admin', classes: ['Admin'] },
];

// 2026 is derived from forecast_rows rather than stored, so this tab can never disagree with
// the Forecast tab. Every other year comes from annual_summary; a year with no rows there
// renders as em dashes until someone supplies it.
const FORECAST_FROM_ROWS = 2026;
const YEARS = [
  { year: 2024, sublabel: 'Actual' },
  { year: 2025, sublabel: 'Actual' },
  { year: 2026, sublabel: 'Forecast' },
  { year: 2027, sublabel: 'Forecast' },
  { year: 2028, sublabel: 'Forecast' },
];

const ALL_CLASSES = ['RIA', 'IJT', 'Admin'];

// Compact dollar labels for the cash axis, e.g. 4898284 -> "$4.9M". Same as the Board Summary.
function fmtCash(n) {
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(1) + 'M';
  else if (abs >= 1_000) s = Math.round(abs / 1000) + 'k';
  else s = Math.round(abs).toString();
  return (neg ? '-$' : '$') + s;
}

function fmtYears(n) {
  return Number(n).toFixed(2);
}

export default async function FiveYearTrendPage() {
  const [annualRows, forecastRows, cashMetrics, monthRows] = await Promise.all([
    fetchAnnualSummary(),
    fetchForecastRows(ALL_CLASSES),
    fetchCashMetrics(),
    fetchMonths(),
  ]);
  const glRows = await fetchGlRows(ALL_CLASSES, monthRows.map((m) => m.key));

  const burn = monthlyBurnSeries(glRows, forecastRows, monthRows, annualRows, [2027, 2028]);
  const quarters = buildQuarterlySeries(cashMetrics, burn, 2026, 2028);
  const lastReported = quarters.filter((q) => q.isActual).slice(-1)[0];

  const sections = ENTITIES.map((e) => ({
    label: e.label,
    columns: YEARS.map((y) => ({
      key: String(y.year),
      label: String(y.year),
      sublabel: y.sublabel,
      buckets:
        y.year === FORECAST_FROM_ROWS
          ? forecastBucketsFor(forecastRows, e.classes)
          : annualBucketsFor(annualRows, e.classes, y.year),
    })),
  }));

  return (
    <div>
      <div className="card">
        <h2>Board Summary — 5 Year Trend</h2>
        <p className="small-muted">
          Full-year income statement for each business unit. 2024 and 2025 are actuals from the
          QuickBooks profit-and-loss by class. 2026 is the current full-year forecast — the same
          totals shown on each entity&apos;s Forecast tab (year-to-date actuals plus the remaining
          forecast months), using the saved baseline rather than any personal what-if overrides.
          2027 and 2028 are placeholders until those forecasts are built.
        </p>
        <p className="small-muted">
          Freedom IOT is intentionally excluded. In 2024 and 2025 the Admin column also carries the
          G&amp;A, Wendal and Not-Specified classes, and IJT also carries InfoTap and Marcus
          Management, so the five columns are comparable across the full period.
        </p>
      </div>
      {sections.map((s) => (
        <FiveYearTable key={s.label} title={s.label} columns={s.columns} />
      ))}
      <div className="card">
        <h2>Cash &amp; Runway — quarterly, Q1 2026 through Q4 2028</h2>
        <p className="small-muted">
          Reported through {lastReported ? lastReported.label : 'n/a'}; projected after that. Cash
          rolls forward from the last reported balance using the forecast Net Operating Income as
          the monthly cash usage. Runway is cash divided by the average monthly burn of that
          quarter&apos;s three months. For reported months burn is net income excluding unrealized
          gains and losses and the one-off Freedom IOT divestiture gain, matching the CHARTS
          workbook. 2027 and 2028 stay empty until those budgets are built.
        </p>
        <div className="trend-grid">
          <QuarterChart
            title="Total Cash &amp; Current Investments"
            points={quarters}
            valueKey="cash"
            formatValue={fmtCash}
          />
          <QuarterChart
            title="Doomsday Clock (Years)"
            points={quarters}
            valueKey="runway"
            formatValue={fmtYears}
            subtitle="Years of runway remaining at that quarter's average burn rate."
          />
        </div>
      </div>
    </div>
  );
}
