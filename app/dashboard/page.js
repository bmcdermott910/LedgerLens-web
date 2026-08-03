import { PERIODS, combinedRows, computeBuckets } from '@/lib/finance';
import { fetchGlRows } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import BucketCard from '@/components/BucketCard';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { label: 'Wendal Inc. (RIA + IJT + Admin)', classes: ['RIA', 'IJT', 'Admin'] },
  { label: 'Connetic RIA (RIA)', classes: ['RIA'] },
  { label: 'InnerJoin Technologies (IJT)', classes: ['IJT'] },
  { label: 'Admin', classes: ['Admin'] },
];

export default async function BoardSummaryPage({ searchParams }) {
  const periodKey = searchParams?.period || 'ytd_current';
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[3];

  const sections = await Promise.all(
    SECTIONS.map(async (s) => {
      const rows = await fetchGlRows(s.classes, period.months);
      const buckets = computeBuckets(combinedRows(rows));
      return { ...s, buckets };
    })
  );

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
    </div>
  );
}
