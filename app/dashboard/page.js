import { notFound } from 'next/navigation';
import { combinedRows, computeBuckets, topVariances } from '@/lib/finance';
import { buildPeriodModel, resolvePeriod } from '@/lib/periods';
import { fetchGlRows, fetchCashMetrics, fetchMonths, fetchForecastMeta } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import BucketCard from '@/components/BucketCard';
import MetricChart from '@/components/MetricChart';
import AskBox from '@/components/AskBox';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { label: 'Wendal Inc. (RIA + IJT + Admin)', classes: ['RIA', 'IJT', 'Admin'] },
  { label: 'Connetic RIA (RIA)', classes: ['RIA'] },
  { label: 'InnerJoin Technologies (IJT)', classes: ['IJT'] },
  { label: 'Admin', classes: ['Admin'] },
];

// Compact dollar labels for the cash chart's axis and summary line, e.g. 4898284 -> "$4.9M".
function fmtCash(n) {
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(1) + 'M';
  else if (abs >= 1_000) s = Math.round(abs / 1000) + 'k';
  else s = Math.round(abs).toString();
  return (neg ? '-$' : '$') + s;
}

// The doomsday clock is a count of years, not dollars -- two decimals reads naturally at the
// range this metric sits in (roughly 1.9 to 2.6).
function fmtYears(n) {
  return Number(n).toFixed(2);
}

export default async function BoardSummaryPage({ searchParams }) {
  // Periods and their labels are derived from the `months` table, so loading a new month rolls
  // these buttons forward with no code change.
  const [monthRows, forecastMeta] = await Promise.all([fetchMonths(), fetchForecastMeta()]);
  const model = buildPeriodModel(monthRows, forecastMeta);
  const period = resolvePeriod(model, searchParams?.period);
  if (!period) notFound();

  const [sections, cashMetrics] = await Promise.all([
    Promise.all(
      SECTIONS.map(async (s) => {
        const rows = await fetchGlRows(s.classes, period.months);
        // combinedRows() is computed once and used twice: the bucket summary table, and the
        // Key Drivers bullets, which rank the individual accounts underneath those buckets.
        const combined = combinedRows(rows);
        return { ...s, buckets: computeBuckets(combined), drivers: topVariances(combined) };
      })
    ),
    fetchCashMetrics(),
  ]);

  // The Ask box stays hidden until an API key is configured in Vercel, so shipping this code
  // early can't surface a feature that would only error out when someone tried it.
  const askEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  // The cash metrics table is loaded independently of the GL, so the charts are driven by
  // whatever months it actually contains rather than by the selected P&L period.
  const cashSeries = cashMetrics.map((m) => ({ label: m.month_label, value: Number(m.total_cash) }));
  const clockSeries = cashMetrics
    .filter((m) => m.doomsday_years !== null)
    .map((m) => ({ label: m.month_label, value: Number(m.doomsday_years) }));

  return (
    <div>
      <div className="card">
        <h2>Board Presentation — Actual vs. Budget</h2>
        <PeriodTabs periods={model.periods} current={period.key} basePath="/dashboard" />
        <p className="small-muted">Freedom IOT is intentionally excluded from LedgerLens.</p>
      </div>
      {askEnabled && (
        <div className="card">
          <h2>Ask about these numbers</h2>
          <p className="small-muted">
            Ask why a line is above or below budget, or what is driving it. Answers are generated from
            this dashboard&apos;s own figures, and the supporting numbers are shown with every answer.
          </p>
          <AskBox period={period.key} />
        </div>
      )}
      {sections.map((s) => (
        <BucketCard key={s.label} title={s.label} buckets={s.buckets} drivers={s.drivers} />
      ))}
      {cashMetrics.length > 0 && (
        <div className="card">
          <h2>
            Cash &amp; Runway — {cashMetrics[0].month_label} through{' '}
            {cashMetrics[cashMetrics.length - 1].month_label}
          </h2>
          <div className="trend-grid">
            <MetricChart
              title="Total Cash & Current Investments"
              series={cashSeries}
              formatValue={fmtCash}
            />
            <MetricChart
              title="Doomsday Clock (Years)"
              series={clockSeries}
              formatValue={fmtYears}
              subtitle="Years of runway remaining at the current burn rate."
            />
          </div>
        </div>
      )}
    </div>
  );
}
