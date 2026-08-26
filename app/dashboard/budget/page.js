import { BUDGET_ENTITIES, BUDGET_YEARS } from '@/lib/finance';
import { buildClassBudget, sumClassBudgets, buildWageSummary } from '@/lib/budget';
import {
  fetchBudgetInputs, fetchBudgetWagePeople, fetchBudgetPayIncrease, fetchForecastRows,
  fetchGlRows, fetchMonths, fetchProfile,
} from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import PeriodTabs from '@/components/PeriodTabs';
import BudgetTable from '@/components/BudgetTable';
import WageSummary from '@/components/WageSummary';
import AumSchedule from '@/components/AumSchedule';

export const dynamic = 'force-dynamic';

const ALL_CLASSES = ['RIA', 'IJT', 'Admin'];

export default async function BudgetPage({ searchParams }) {
  const entity =
    BUDGET_ENTITIES.find((e) => e.key === searchParams?.entity) || BUDGET_ENTITIES[0];

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await fetchProfile(supabase, user.id) : null;
  const canEdit = profile?.role === 'admin';
  const wageClasses = profile?.wage_classes || [];

  const [inputs, wagePeople, personPct, structure, monthRows] = await Promise.all([
    fetchBudgetInputs(),
    fetchBudgetWagePeople(),
    fetchBudgetPayIncrease(),
    fetchForecastRows(ALL_CLASSES),
    fetchMonths(),
  ]);

  // The annualisation base is 2026 actuals through the last CLOSED month, so a partial month
  // never drags the run rate down. Derived from the months table rather than hardcoded.
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
    closedMonths: closedMonths.length,
    years: BUDGET_YEARS,
  }));

  const byClass = Object.fromEntries(ALL_CLASSES.map((c, i) => [c, perClass[i]]));
  const singleClass = entity.classes.length === 1 ? entity.classes[0] : null;
  const rows = singleClass
    ? byClass[singleClass]
    : sumClassBudgets(entity.classes.map((c) => byClass[c]), BUDGET_YEARS);

  // The % adjustments are per class, so they are only editable on a single-class view --
  // there is no one number to change on the combined Wendal Total.
  const pctByKey = {};
  inputs.pct
    .filter((p) => p.class_key === singleClass)
    .forEach((p) => { pctByKey[`${p.account}|${p.year}`] = Number(p.pct) || 0; });

  // Per-person wages are row-level gated, so this is already limited to the classes this
  // person may see. Intersect with the displayed entity to work out whether to warn them.
  const visibleHere = entity.classes.filter((c) => wageClasses.includes(c));
  const pctByPerson = {};
  personPct.forEach((p) => {
    pctByPerson[`${p.first_name} ${p.last_name}|${p.year}`] = Number(p.pct) || 0;
  });
  const people = buildWageSummary(
    wagePeople, entity.classes, pctByPerson, inputs.payIncrease, BUDGET_YEARS
  );
  const restrictedTo = visibleHere.length && visibleHere.length < entity.classes.length
    ? visibleHere.join(', ')
    : null;

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
          The adjustment percentages, the AUM schedule and the pay increases are{' '}
          <strong>shared</strong> — one plan of record everyone sees, not personal what-ifs.{' '}
          {canEdit
            ? 'Click any of them to change it; every figure here and on the 5 Year Trend tab recomputes.'
            : 'Only an admin can change them.'}
          {!singleClass && ' Adjustment percentages are set on an individual business unit, not on the combined total.'}
        </p>
        <p className="small-muted">
          Click a year total on any account budgeted from 2026 to see the vendors behind it —
          each one&apos;s 2026 spend through {closedLabel}, annualised to twelve months and moved
          by that account&apos;s adjustment percentage.
        </p>
      </div>
      {/* The AUM schedule only drives RIA's Management Fee and Fee Cap Expense, so it is shown
          on RIA and on the Wendal Total that contains it -- on InnerJoin and Admin it would be
          a table of numbers that changes nothing on the page. */}
      {entity.classes.includes('RIA') && <AumSchedule aum={inputs.aum} canEdit={canEdit} />}
      <div className="card">
        <BudgetTable
          rows={rows}
          classKey={singleClass}
          classKeys={entity.classes}
          pctByKey={pctByKey}
          canEdit={canEdit && Boolean(singleClass)}
        />
      </div>
      <WageSummary
        people={people}
        payIncrease={inputs.payIncrease}
        canEdit={canEdit}
        restrictedTo={restrictedTo}
      />
    </div>
  );
}
