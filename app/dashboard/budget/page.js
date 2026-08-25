import { BUDGET_ENTITIES, buildBudgetRows, budgetIsEmpty } from '@/lib/finance';
import { fetchBudgetRows } from '@/lib/queries';
import PeriodTabs from '@/components/PeriodTabs';
import BudgetTable from '@/components/BudgetTable';

export const dynamic = 'force-dynamic';

const ALL_CLASSES = ['RIA', 'IJT', 'Admin'];

export default async function BudgetPage({ searchParams }) {
  const entity =
    BUDGET_ENTITIES.find((e) => e.key === searchParams?.entity) || BUDGET_ENTITIES[0];

  const budgetRows = await fetchBudgetRows(ALL_CLASSES);
  const rows = buildBudgetRows(budgetRows, entity.classes);
  const empty = budgetIsEmpty(rows);

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
          2028, with each year totalled at the end of its twelve months. Wendal Inc. Total is the
          three classes summed, so it can never disagree with them.
        </p>
        {empty && (
          <p className="stale-warning">
            The budget framework is in place but no numbers have been generated yet — every line
            reads zero. Once the calculation method is defined, the figures load into this same
            table and the 5 Year Trend tab&apos;s 2027 and 2028 columns and charts fill in from
            them automatically.
          </p>
        )}
      </div>
      <div className="card">
        <BudgetTable rows={rows} />
      </div>
    </div>
  );
}
