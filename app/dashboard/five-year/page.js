import { annualBucketsFor, forecastBucketsFor } from '@/lib/finance';
import { fetchAnnualSummary, fetchForecastRows } from '@/lib/queries';
import FiveYearTable from '@/components/FiveYearTable';

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

export default async function FiveYearTrendPage() {
  const [annualRows, forecastRows] = await Promise.all([
    fetchAnnualSummary(),
    fetchForecastRows(['RIA', 'IJT', 'Admin']),
  ]);

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
    </div>
  );
}
