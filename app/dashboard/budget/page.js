import { BUDGET_ENTITIES, BUDGET_YEARS } from '@/lib/finance';
import { buildClassBudget, sumClassBudgets, buildWageSummary } from '@/lib/budget';
import {
  fetchBudgetInputs, fetchForecastRows, fetchGlRows, fetchMonths,
} from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import BudgetTable from '@/components/BudgetTable';
import WageSummary from '@/components/WageSummary';

export const dynamic = 'force-dynamic';

const ALL_CLASSES = ['RIA', 'IJT', 'Admin'];

export default async function BudgetPage({ searchParams }) {
  const entity =
    BUDGET_ENTITIES.find((e) => e.key === searchParams?.entity) || BUDGET_ENTITIES[0];

  const [inputs, structure, monthRows] = await Promise.all([
    fetchBudgetInputs(),
    fetchForecastRows(ALL_CLASSES),
    fetchMonths(),
  ]);

  // The annualisation base is 2026 actuals through the last CLOSED month, so a partial month
  // never drags the run rate down. Derived from the months table rather than hardcoded, so it
  // moves on its own as months are loaded.
  const closedMonths = monthRows.filter((m) => m.is_complete);
  const glRows = await fetchGlRows(ALL_CLASSES, closedMonths.map((m) => m.key));
  const closedLabel = closedMonths.length
    ? `${closedMonths[closedMonths.length - 1].key} ${closedMonths[closedMonths.length - 1].year}`
    : 'n/a';

  const perClass = ALL_CLASSES.map((classKey) => buildClassBudget({
    classKey,
    structure: structure.filter((s) => s.class_key === classKey),
    glRows,
    rules: inputs.rules,
    wageBase: inputs.wageBase,
    aum: inputs.aum,
    pct: inputs.pct,
    payIncrease: inputs.payIncrease,
    closedMonths: closedMonths.length,
    years: BUDGET_YEARS,
  }));

  const byClass = Object.fromEntries(ALL_CLASSES.map((c, i) => [c, perClass[i]]));
  const rows = entity.classes.length === 1
    ? byClass[entity.classes[0]]
    : sumClassBudgets(entity.classes.map((c) => byClass[c]), BUDGET_YEARS);

  const people = buildWageSummary(
    inputs.wageBase, entity.classes, inputs.payIncrease, BUDGET_YEARS
  );

  const aumRows = inputs.aum
    .filter((a) => a.month_num === 1 || a.month_num === 4 || a.month_num === 7 || a.month_num === 10)
    .sort((a, b) => a.year - b.year || a.month_num - b.month_num);

  return (
    <div>
      <div className="card">
        <h2>2027–2028 Budget — {entity.label}</h2>
        <PeriodTabs
          periods={BUDGET_ENTITIES}
          current={entity.key}
          basePath="/dashboard/budget"
          param="entity"
        />
        <p className="small-muted">
          Monthly detail for every account on the Forecast tab, January 2027 through December
          2028, each year totalled at the end of its twelve months. Built per the 2027–2028
          Budgeting Rules: most accounts are 2026 actuals through {closedLabel} annualised and
          spread evenly, benefit accounts follow their 2026 ratio to the wage line they sit under,
          and the RIA fee lines come off the AUM schedule. Wendal Inc. Total is the three classes
          summed. Subtotals are derived from the detail, so they always foot.
        </p>
        <p className="small-muted">
          AUM schedule driving Management Fee and Fee Cap Expense:{' '}
          {aumRows.map((a) => `Q${Math.floor((a.month_num - 1) / 3) + 1} ${a.year} $${(Number(a.aum) / 1e6).toFixed(0)}M`).join(' · ')}
        </p>
        <p className="stale-warning">
          Read-only for now. The manual adjustments — a % increase or decrease per account per
          year, the AUM schedule and the pay increase — are stored as drivers and currently sit at
          their defaults (0% account adjustments, 3% pay increases). Editing them in the browser is
          the next step.
        </p>
      </div>
      <div className="card">
        <BudgetTable rows={rows} />
      </div>
      <WageSummary people={people} payIncrease={inputs.payIncrease} />
    </div>
  );
}
