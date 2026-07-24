import { notFound } from 'next/navigation';
import { PERIODS, TABS, combinedRows } from '@/lib/finance';
import { fetchGlRows } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import GlTable from '@/components/GlTable';
 
export const dynamic = 'force-dynamic';
 
export default async function ClassPage({ params, searchParams }) {
  const tab = TABS.find((t) => t.key === params.cls);
  if (!tab) notFound();
 
  const periodKey = searchParams?.period || 'ytd_current';
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[3];
 
  const rows = await fetchGlRows(tab.classes, period.months);
  const combined = combinedRows(rows);
 
  return (
    <div>
      <div className="card">
        <h2>{tab.label} — Actual vs. Budget by GL Account</h2>
        <PeriodTabs current={period.key} basePath={`/dashboard/${tab.key}`} />
      </div>
      <div className="card">
        <GlTable rows={combined} classKeys={tab.classes} monthKeys={period.months} />
      </div>
    </div>
  );
}
