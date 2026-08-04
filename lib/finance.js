// Shared finance logic, ported directly from the proven LedgerLens static-HTML prototype
// (app2.js). Keeping this identical is what makes phase-1 numbers match the old dashboard exactly.

// NOTE: month names are hardcoded for now, same as the prototype. Once new months' data is
// imported regularly, this should become dynamic (e.g. derived from the latest month present
// in gl_line_items) rather than a fixed list -- flagged for a follow-up, not phase 1.
export const PERIODS = [
  { key: 'mtd_prior', label: 'MTD — June 2026', months: ['June'] },
  { key: 'mtd_current', label: 'MTD — July 1–15, 2026 (partial)', months: ['July'] },
  { key: 'ytd_prior', label: 'YTD thru June 2026', months: ['January', 'February', 'March', 'April', 'May', 'June'] },
  { key: 'ytd_current', label: 'YTD thru July 15, 2026', months: ['January', 'February', 'March', 'April', 'May', 'June', 'July'] },
];

export const TABS = [
  { key: '', label: 'Board Summary' },
  { key: 'wendal-inc', label: 'Wendal Inc.', classes: ['Admin', 'RIA', 'IJT'] },
  { key: 'ria', label: 'RIA', classes: ['RIA'] },
  { key: 'ijt', label: 'IJT', classes: ['IJT'] },
  { key: 'admin', label: 'Admin', classes: ['Admin'] },
];

export const BUCKET_ROWS = [
  { key: 'income', label: 'Sales / Revenue', flip: false },
  { key: 'cogsPayroll', label: 'COGS — Payroll & Benefits', indent: true, flip: true },
  { key: 'cogsOther', label: 'COGS — Other Operating Costs', indent: true, flip: true },
  { key: 'cogsTotal', label: 'Total Cost of Goods Sold', bold: true, flip: true },
  { key: 'grossProfit', label: 'Gross Profit', bold: true, rule: true, flip: false },
  { key: 'sgaPayroll', label: 'SG&A — Payroll & Benefits', indent: true, flip: true },
  { key: 'sgaOther', label: 'SG&A — Other Costs', indent: true, flip: true },
  { key: 'sgaTotal', label: 'Total SG&A', bold: true, flip: true },
  { key: 'netOperatingIncome', label: 'Net Operating Income', bold: true, rule: true, flip: false },
  { key: 'otherIncomeNet', label: 'Other Income / (Expense), net', indent: true, flip: false },
  { key: 'netIncome', label: 'Net Income', bold: true, rule: true, flip: false },
];

export const SECTION_ORDER = ['Income', 'COGS', 'SGA', 'OtherIncome', 'OtherExpense'];
// Full set of months with real data -- trend charts always show the whole trailing history
// regardless of which period tab (MTD/YTD) is selected, since a trend needs multiple points.
export const ALL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July'];
const ALWAYS_NORMAL = new Set([
  'Gross Profit', 'Net Operating Income', 'Net Other Income', 'Net Income',
  'Total for Income', 'Total for Other Income',
]);

export function isFlippedRow(r) {
  if (ALWAYS_NORMAL.has(r.account)) return false;
  return r.section === 'COGS' || r.section === 'SGA' || r.section === 'OtherExpense';
}

export function fmt(n) {
  if (n === undefined || n === null) return '—';
  const neg = n < 0;
  const v = Math.abs(Math.round(n)).toLocaleString();
  return neg ? '(' + v + ')' : v;
}

// Returns { isFav, text } instead of an HTML string -- React components render the className.
export function fmtVar(actual, budget, flip) {
  const raw = (actual || 0) - (budget || 0);
  const favMagnitude = flip ? -raw : raw;
  const isFav = favMagnitude >= 0;
  const abs = Math.abs(Math.round(raw)).toLocaleString();
  return { isFav, text: isFav ? abs : '(' + abs + ')' };
}

// rawRows: [{account, section, is_subtotal, is_wage, actual, budget}, ...] from one or more
// class/month combinations. Sums duplicate accounts (e.g. combining RIA+IJT+Admin, or multiple
// months for YTD), then orders section-by-section (leaf rows before that section's subtotal rows)
// so an account that's zero/absent in early months doesn't get appended after Net Income.
export function combinedRows(rawRows) {
  const map = {};
  rawRows.forEach((r) => {
    if (!map[r.account]) {
      map[r.account] = {
        account: r.account,
        section: r.section,
        subtotal: r.is_subtotal,
        wage: r.is_wage,
        actual: 0,
        budget: 0,
      };
    }
    map[r.account].actual += Number(r.actual) || 0;
    map[r.account].budget += Number(r.budget) || 0;
  });
  const all = Object.values(map);
  const out = [];
  SECTION_ORDER.forEach((sec) => {
    const inSec = all.filter((r) => r.section === sec);
    out.push(...inSec.filter((r) => !r.subtotal));
    out.push(...inSec.filter((r) => r.subtotal));
  });
  out.push(...all.filter((r) => !SECTION_ORDER.includes(r.section)));
  return out;
}

function getVal(rows, label) {
  const r = rows.find((r) => r.account === label);
  return r ? { actual: r.actual || 0, budget: r.budget || 0 } : { actual: 0, budget: 0 };
}

function sumWage(rows, subtotalLabel) {
  const r = rows.find((r) => r.subtotal && r.account === subtotalLabel);
  if (r) return { actual: r.actual || 0, budget: r.budget || 0 };
  let a = 0, b = 0;
  rows.forEach((r) => {
    if (r.wage) {
      a += r.actual || 0;
      b += r.budget || 0;
    }
  });
  return { actual: a, budget: b };
}

const WEIGHT_KEY = { Admin: 'weight_admin', IJT: 'weight_ijt', RIA: 'weight_ria' };

// Combines per-person actual wages (wages_monthly, already filtered to the selected
// classes/months) with each person's budgeted wage for that same class/period, derived from
// employee_budget's annual salary and class allocation weights. Budget is NOT prorated for
// partial months (e.g. the July 1-15 MTD period still uses a full month of budget) -- same
// convention as gl_line_items, so actual-vs-budget pacing reads the same way everywhere else
// in the app. classKeys/monthsCount describe the current tab + period selection.
export function combineWagesByPerson(wageRows, budgetRows, classKeys, monthsCount) {
  const actualByName = {};
  wageRows.forEach((r) => {
    const name = `${r.first_name} ${r.last_name}`;
    actualByName[name] = (actualByName[name] || 0) + (Number(r.amount) || 0);
  });

  const budgetByName = {};
  budgetRows.forEach((r) => {
    const name = `${r.first_name} ${r.last_name}`;
    const weight = classKeys.reduce((sum, c) => sum + (Number(r[WEIGHT_KEY[c]]) || 0), 0);
    const monthlyRate = (Number(r.salary_2026) || 0) / 12;
    budgetByName[name] = (budgetByName[name] || 0) + monthlyRate * weight * monthsCount;
  });

  const names = new Set([...Object.keys(actualByName), ...Object.keys(budgetByName)]);
  return Array.from(names)
    .map((name) => ({
      name,
      actual: actualByName[name] || 0,
      budget: budgetByName[name] || 0,
    }))
    .filter((p) => p.actual !== 0 || p.budget !== 0)
    .sort((a, b) => b.actual - a.actual);
}

// Derives the Board Summary bucket rollup directly from an already-combined row list
// (see combinedRows above) -- equivalent to the old Python compute_buckets(), just run
// on demand in JS instead of being precomputed server-side ahead of time.
export function computeBuckets(rows) {
  const income = getVal(rows, 'Total for Income');
  const cogs = getVal(rows, 'Total for Cost of Goods Sold');
  const cogsPayroll = sumWage(rows, 'Total for Operating Wages');
  const expenses = getVal(rows, 'Total for Expenses');
  const sgaPayroll = sumWage(rows, 'Total for SG&A Wages');
  const gross = getVal(rows, 'Gross Profit');
  const noi = getVal(rows, 'Net Operating Income');
  const otherNet = getVal(rows, 'Net Other Income');
  const netIncome = getVal(rows, 'Net Income');
  const cogsOther = { actual: cogs.actual - cogsPayroll.actual, budget: cogs.budget - cogsPayroll.budget };
  const sgaOther = { actual: expenses.actual - sgaPayroll.actual, budget: expenses.budget - sgaPayroll.budget };
  return {
    income,
    cogsTotal: cogs,
    cogsPayroll,
    cogsOther,
    grossProfit: gross,
    sgaTotal: expenses,
    sgaPayroll,
    sgaOther,
    otherIncomeNet: otherNet,
    netOperatingIncome: noi,
    netIncome,
  };
}

// Sums every leaf (non-subtotal) account whose name starts with the given prefix -- used for
// the "all Marketing accounts combined" trend line.
function sumAccountsPrefix(rows, prefix) {
  let a = 0, b = 0;
  rows.forEach((r) => {
    if (!r.subtotal && r.account && r.account.startsWith(prefix)) {
      a += r.actual || 0;
      b += r.budget || 0;
    }
  });
  return { actual: a, budget: b };
}

// Builds the six trend lines requested: Revenue, COGS, SG&A, Net Income, all-Marketing-accounts
// combined, and (Operating Wages + SG&A Wages + Subcontractor) combined -- one data point per
// month in `months`, each with {actual, budget}. rawRows should already be scoped to the
// current tab's classes across the full month range (see ALL_MONTHS).
export function buildTrendSeries(rawRows, months) {
  return months.map((month) => {
    const monthRows = combinedRows(rawRows.filter((r) => r.month_key === month));
    const buckets = computeBuckets(monthRows);
    const marketing = sumAccountsPrefix(monthRows, 'Marketing');
    const wagesSubcontractor = {
      actual: buckets.cogsPayroll.actual + buckets.sgaPayroll.actual + getVal(monthRows, 'Subcontractor').actual,
      budget: buckets.cogsPayroll.budget + buckets.sgaPayroll.budget + getVal(monthRows, 'Subcontractor').budget,
    };
    return {
      month,
      revenue: buckets.income,
      cogs: buckets.cogsTotal,
      sga: buckets.sgaTotal,
      netIncome: buckets.netIncome,
      marketing,
      wagesSubcontractor,
    };
  });
}
