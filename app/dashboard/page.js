import { PERIODS, combinedRows, computeBuckets } from '@/lib/finance';
import { fetchGlRows, fetchCashMetrics } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import BucketCard from '@/components/BucketCard';
import MetricChart from '@/components/MetricChart';

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
  const periodKey = searchParams?.period || 'ytd_current';
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[3];

  const [sections, cashMetrics] = await Promise.all([
    Promise.all(
      SECTIONS.map(async (s) => {
        const rows = await fetchGlRows(s.classes, period.months);
        const buckets = computeBuckets(combinedRows(rows));
        return { ...s, buckets };
      })
    ),
    fetchCashMetrics(),
  ]);

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
        <PeriodTabs current={period.key} basePath="/dashboard" />
        <p className="small-muted">Freedom IOT is intentionally excluded from LedgerLens.</p>
      </div>
      {sections.map((s) => (
        <BucketCard key={s.label} title={s.label} buckets={s.buckets} />
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
