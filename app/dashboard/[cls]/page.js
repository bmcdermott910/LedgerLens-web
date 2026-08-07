import { notFound } from 'next/navigation';
import { TABS, combinedRows, combineWagesByPerson, buildTrendSeries, buildForecastRows, reorderToMatch } from '@/lib/finance';
import { buildPeriodModel, resolvePeriod } from '@/lib/periods';
import {
  fetchGlRows, fetchWagesByPerson, fetchEmployeeBudgets, fetchForecastRows, fetchForecastRules,
  fetchForecastOverrides, fetchMonths, fetchForecastMeta,
} from '@/lib/queries';
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

  // Periods, the trend range and the forecast horizon all come from the data now.
  const [monthRows, forecastMeta] = await Promise.all([fetchMonths(), fetchForecastMeta()]);
  const model = buildPeriodModel(monthRows, forecastMeta);
  const period = resolvePeriod(model, searchParams?.period);
  if (!period) notFound();

  const rows = await fetchGlRows(tab.classes, period.months);
  const combined = combinedRows(rows);

  const [wageRows, budgetRows, trendRows] = await Promise.all([
    fetchWagesByPerson(tab.classes, period.months),
    fetchEmployeeBudgets(),
    fetchGlRows(tab.classes, model.trendMonths),
  ]);
  const people = combineWagesByPerson(wageRows, budgetRows, tab.classes, period.months.length);
  const trend = buildTrendSeries(trendRows, model.trendMonths);

  // The forecast picks up where actuals stop, so it only renders on the period that ends at the
  // last completed month -- which period that is now depends on whether a partial month is loaded.
  const showForecast = period.key === model.forecastPeriodKey;
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
    forecastRowsBuilt = reorderToMatch(
      buildForecastRows(baseline, rules, overrides, tab.classes, model.forecastMonthCount),
      combined
    );
  }

  return (
    <div>
      <div className="card">
        <h2>{tab.label} — Actual vs. Budget by GL Account</h2>
        <PeriodTabs
          periods={model.periods}
          current={period.key}
          basePath={`/dashboard/${tab.key}`}
          labelOverrides={model.entityPeriodLabels}
        />
        <p className="small-muted">Click on amounts in the Actual column to see the detail of the account.</p>
      </div>
      <div className="card">
        <GlTable rows={combined} classKeys={tab.classes} monthKeys={period.months} />
      </div>
      {showForecast && (
        <div className="card">
          <h2>Forecast — What If</h2>
          {model.forecastIsStale && (
            <p className="stale-warning">
              This forecast was generated from actuals through {model.forecastBaseLabel} and has not
              been refreshed since newer months were loaded. Treat the forecast columns as out of
              date until it is regenerated.
            </p>
          )}
          <p className="small-muted">
            Baseline built from actuals through {model.forecastBaseLabel}, projected over{' '}
            {model.forecastMonthCount} remaining month{model.forecastMonthCount === 1 ? '' : 's'}. Each
            account follows its standard method (trailing 3-month average, wage-based, or % of another
            account). Click any Monthly Forecast value to enter your own what-if number — accounts
            calculated as a % of another account will update automatically. Click the × next to a
            custom value to reset it back to default.
          </p>
          <ForecastTable rows={forecastRowsBuilt} tabKey={tab.key} />
        </div>
      )}
      <div className="card">
        <h2>Wages by Person</h2>
        <WageTable people={people} />
      </div>
      {model.trendMonths.length > 1 && (
        <div className="card">
          <h2>Trends — {model.trendRangeLabel}</h2>
          <div className="trend-grid">
            <TrendChart title="Revenue" series={trend.map((t) => ({ month: t.month, ...t.revenue }))} />
            <TrendChart title="Cost of Goods Sold" series={trend.map((t) => ({ month: t.month, ...t.cogs }))} />
            <TrendChart title="SG&A" series={trend.map((t) => ({ month: t.month, ...t.sga }))} />
            <TrendChart title="Net Income" series={trend.map((t) => ({ month: t.month, ...t.netIncome }))} />
            <TrendChart title="Marketing (all accounts)" series={trend.map((t) => ({ month: t.month, ...t.marketing }))} />
            <TrendChart title="Wages + Subcontractor" series={trend.map((t) => ({ month: t.month, ...t.wagesSubcontractor }))} />
          </div>
        </div>
      )}
    </div>
  );
}
