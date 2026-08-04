import { notFound } from 'next/navigation';
import { PERIODS, TABS, TREND_MONTHS, ENTITY_PERIOD_LABELS, combinedRows, combineWagesByPerson, buildTrendSeries, buildForecastRows, reorderToMatch } from '@/lib/finance';
import { fetchGlRows, fetchWagesByPerson, fetchEmployeeBudgets, fetchForecastRows, fetchForecastRules, fetchForecastOverrides } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import PeriodTabs from '@/components/PeriodTabs';
import GlTable from '@/components/GlTable';
import WageTable from '@/components/WageTable';
import TrendChart from '@/components/TrendChart';
import ForecastTable from '@/components/ForecastTable';

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
    fetchGlRows(tab.classes, TREND_MONTHS),
  ]);
  const people = combineWagesByPerson(wageRows, budgetRows, tab.classes, period.months.length);
  const trend = buildTrendSeries(trendRows, TREND_MONTHS);

  // The forecast/what-if view only makes sense on the "YTD thru last completed month" period --
  // same as the old HTML prototype -- since forecast months (July-Dec) pick up right where that
  // period's actuals leave off.
  const showForecast = period.key === 'ytd_prior';
  let forecastRowsBuilt = null;
  if (showForecast) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [baseline, rules, overrides] = await Promise.all([
      fetchForecastRows(tab.classes),
      fetchForecastRules(),
      user ? fetchForecastOverrides(supabase, user.id, tab.key) : Promise.resolve([]),
    ]);
    forecastRowsBuilt = reorderToMatch(buildForecastRows(baseline, rules, overrides, tab.classes), combined);
  }

  return (
    <div>
      <div className="card">
        <h2>{tab.label} — Actual vs. Budget by GL Account</h2>
        <PeriodTabs current={period.key} basePath={`/dashboard/${tab.key}`} labelOverrides={ENTITY_PERIOD_LABELS} />
        <p className="small-muted">Click on amounts in the Actual column to see the detail of the account.</p>
      </div>
      <div className="card">
        <GlTable rows={combined} classKeys={tab.classes} monthKeys={period.months} />
      </div>
      {showForecast && (
        <div className="card">
          <h2>2026 Forecast — What If</h2>
          <p className="small-muted">
            Default forecast follows each account&apos;s standard method (trailing 3-month average,
            wage-based, or % of another account). Click any Monthly Forecast value to enter your
            own what-if number -- accounts calculated as a % of another account will update
            automatically. Click the × next to a custom value to reset it back to default.
          </p>
          <ForecastTable rows={forecastRowsBuilt} tabKey={tab.key} />
        </div>
      )}
      <div className="card">
        <h2>Wages by Person</h2>
        <WageTable people={people} />
      </div>
      <div className="card">
        <h2>Trends — {TREND_MONTHS[0]} through {TREND_MONTHS[TREND_MONTHS.length - 1]} 2026</h2>
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
