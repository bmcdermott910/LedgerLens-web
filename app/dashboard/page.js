import { notFound } from 'next/navigation';
import { PERIODS, TABS, combinedRows, combineWagesByPerson } from '@/lib/finance';
import { fetchGlRows, fetchWagesByPerson, fetchEmployeeBudgets } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import GlTable from '@/components/GlTable';
import WageTable from '@/components/WageTable';

export const dynamic = 'force-dynamic';

export default async function ClassPage({ params, searchParams }) {
  const tab = TABS.find((t) => t.key === params.cls);
  if (!tab) notFound();

  const periodKey = searchParams?.period || 'ytd_current';
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[3];

  const rows = await fetchGlRows(tab.classes, period.months);
  const combined = combinedRows(rows);

  const [wageRows, budgetRows] = await Promise.all([
    fetchWagesByPerson(tab.classes, period.months),
    fetchEmployeeBudgets(),
  ]);
  const people = combineWagesByPerson(wageRows, budgetRows, tab.classes, period.months.length);

  return (
    <div>
      <div className="card">
        <h2>{tab.label} — Actual vs. Budget by GL Account</h2>
        <PeriodTabs current={period.key} basePath={`/dashboard/${tab.key}`} />
      </div>
      <div className="card">
        <GlTable rows={combined} classKeys={tab.classes} monthKeys={period.months} />
      </div>
      <div className="card">
        <h2>Wages by Person</h2>
        <WageTable people={people} />
      </div>
    </div>
  );
}
