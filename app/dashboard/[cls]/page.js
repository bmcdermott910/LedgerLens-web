import { notFound } from 'next/navigation';
import { PERIODS, TABS, ALL_MONTHS, combinedRows, combineWagesByPerson, buildTrendSeries } from '@/lib/finance';
import { fetchGlRows, fetchWagesByPerson, fetchEmployeeBudgets } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import GlTable from '@/components/GlTable';
import WageTable from '@/components/WageTable';
import TrendChart from '@/components/TrendChart';

export const dynamic = 'force-dynamic';

export default async function ClassPage({ params, searchParams }) {
  const tab = TABS.find((t) => t.key === params.cls);
  if (!tab) notFound();

  const periodKey = searchParams?.period || 'ytd_current';
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[3];

  const rows = await fetchGlRows(tab.classes, period.months);
  const combined = combinedRows(rows);

  const [wageRows, budgetRows, trendRows] = await Promise.all([
    fetchWagesByPerson(tab.classes, period.months),
    fetchEmployeeBudgets(),
    fetchGlRows(tab.classes, ALL_MONTHS),
  ]);
  const people = combineWagesByPerson(wageRows, budgetRows, tab.classes, period.months.length);
  const trend = buildTrendSeries(trendRows, ALL_MONTHS);

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
      <div className="card">
        <h2>Trends — {ALL_MONTHS[0]} through {ALL_MONTHS[ALL_MONTHS.length - 1]} 2026</h2>
        <div className="trend-grid">
          <TrendChart title="Revenue" series={trend.map((t) => ({ month: t.month, ...t.revenue }))} />
          <TrendChart title="Cost of Goods Sold" series={trend.map((t) => ({ month: t.month, ...t.cogs }))} />
          <TrendChart title="SG&A" series={trend.map((t) => ({ month: t.month, ...t.sga }))} />
          <TrendChart title="Net Income" series={trend.map((t) => ({ month: t.month, ...t.netIncome }))} />
          <TrendChart title="Marketing (all accounts)" series={trend.map((t) => ({ month: t.month, ...t.marketing }))} />
          <TrendChart title="Wages + Subcontractor" series={trend.map((t) => ({ month: t.month, ...t.wagesSubcontractor }))} />
        </div>
      </div>
    </div>
  );
}
