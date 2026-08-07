// Shared finance logic, ported directly from the proven LedgerLens static-HTML prototype
// (app2.js). Keeping this identical is what makes phase-1 numbers match the old dashboard exactly.

// Reporting periods, the trend month range and the forecast horizon are NO LONGER defined here.
// They are derived at request time from the `months` table by buildPeriodModel() in lib/periods.js,
// so loading a new month rolls the dashboard forward without a code change. This file keeps only
// the calculation logic, which is period-agnostic.

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
// current tab's classes across the full month range (see trendMonths in lib/periods.js).
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

// Ancestor subtotals a leaf account's forecast total rolls up into, so a what-if override can
// be propagated to the right summary rows without re-deriving the entire nested waterfall from
// scratch. Matches the same chart-of-accounts structure used elsewhere in the app.
function ancestorSubtotals(section, isWage) {
  const out = [];
  if (section === 'Income') out.push('Total for Income');
  if (section === 'COGS') {
    if (isWage) out.push('Total for Operating Wages');
    out.push('Total for Cost of Goods Sold');
  }
  if (section === 'SGA') {
    if (isWage) out.push('Total for SG&A Wages');
    out.push('Total for Expenses');
  }
  if (section === 'OtherIncome') out.push('Total for Other Income');
  if (section === 'OtherExpense') out.push('Total for Other Expenses');
  return out;
}

// How much a $1 increase in a leaf account's forecast moves each downstream summary row, by
// section -- e.g. $1 more COGS decreases Gross Profit by $1, but $1 more Income increases it.
function waterfallDeltas(section, delta) {
  const out = {};
  if (section === 'Income') {
    out['Gross Profit'] = delta;
    out['Net Operating Income'] = delta;
    out['Net Income'] = delta;
  } else if (section === 'COGS') {
    out['Gross Profit'] = -delta;
    out['Net Operating Income'] = -delta;
    out['Net Income'] = -delta;
  } else if (section === 'SGA') {
    out['Net Operating Income'] = -delta;
    out['Net Income'] = -delta;
  } else if (section === 'OtherIncome') {
    out['Net Other Income'] = delta;
    out['Net Income'] = delta;
  } else if (section === 'OtherExpense') {
    out['Net Other Income'] = -delta;
    out['Net Income'] = -delta;
  }
  return out;
}

// Human-readable description of how an account's default forecast is derived, per the
// documented rules (avg3/zero/wage_base/pct_of) -- shown in its own column so it's clear what's
// being overridden before someone types in a custom number.
function forecastMethodLabel(rule) {
  if (!rule) return '—';
  switch (rule.rule_type) {
    case 'avg3':
      return 'Trailing 3-mo average';
    case 'zero':
      return 'Zero going forward';
    case 'wage_base':
      return 'July 15 payroll × 2';
    case 'pct_of':
      return `% of ${rule.base_account}`;
    default:
      return '—';
  }
}

// Combines baseline forecast_rows across the selected classes, applies any saved what-if
// overrides (with pct_of cascade so dependent accounts like payroll taxes move with their base
// account), and propagates the resulting deltas up through the summary subtotal rows. Returns
// the full row list ready to render, each with {account, section, subtotal, wage, method,
// monthlyForecast, forecastTotal, annualBudget, isOverridden}.
//
// forecastMonthCount is how many months the flat monthly rate applies to. It comes from
// forecast_meta -- what the stored baseline was actually generated with -- rather than a
// constant, so this arithmetic always matches the data it is operating on.
export function buildForecastRows(forecastRows, forecastRules, overrides, classKeys, forecastMonthCount) {
  const MONTHS = Number(forecastMonthCount) || 0;
  const combined = {};
  forecastRows.forEach((r) => {
    if (!combined[r.account]) {
      combined[r.account] = {
        account: r.account,
        section: r.section,
        subtotal: r.is_subtotal,
        wage: r.is_wage,
        monthlyForecast: 0,
        forecastTotal: 0,
        annualBudget: 0,
      };
    }
    combined[r.account].monthlyForecast += Number(r.monthly_forecast) || 0;
    combined[r.account].forecastTotal += Number(r.forecast_total) || 0;
    combined[r.account].annualBudget += Number(r.annual_budget) || 0;
  });

  const ruleByAccount = {};
  forecastRules.forEach((r) => {
    ruleByAccount[r.account] = r;
  });
  const overrideByAccount = {};
  overrides.forEach((o) => {
    overrideByAccount[o.account] = Number(o.monthly_amount);
  });

  const effectiveMonthlyCache = {};
  function effectiveMonthly(account) {
    if (effectiveMonthlyCache[account] !== undefined) return effectiveMonthlyCache[account];
    if (overrideByAccount[account] !== undefined) {
      effectiveMonthlyCache[account] = overrideByAccount[account];
      return effectiveMonthlyCache[account];
    }
    const rule = ruleByAccount[account];
    const baseline = combined[account];
    if (rule && rule.rule_type === 'pct_of' && rule.base_account && combined[rule.base_account]) {
      const baseBaseline = combined[rule.base_account];
      const pct = baseBaseline.monthlyForecast ? baseline.monthlyForecast / baseBaseline.monthlyForecast : 0;
      effectiveMonthlyCache[account] = pct * effectiveMonthly(rule.base_account);
      return effectiveMonthlyCache[account];
    }
    effectiveMonthlyCache[account] = baseline ? baseline.monthlyForecast : 0;
    return effectiveMonthlyCache[account];
  }

  const subtotalDeltas = {};
  const out = [];
  Object.values(combined).forEach((row) => {
    if (row.subtotal) return; // subtotals handled below, after all leaf deltas are known
    const monthly = effectiveMonthly(row.account);
    const ytdActualPortion = row.forecastTotal - row.monthlyForecast * MONTHS;
    const total = ytdActualPortion + monthly * MONTHS;
    const delta = total - row.forecastTotal;

    if (delta !== 0) {
      ancestorSubtotals(row.section, row.wage).forEach((name) => {
        subtotalDeltas[name] = (subtotalDeltas[name] || 0) + delta;
      });
      const waterfall = waterfallDeltas(row.section, delta);
      Object.keys(waterfall).forEach((name) => {
        subtotalDeltas[name] = (subtotalDeltas[name] || 0) + waterfall[name];
      });
    }

    out.push({
      ...row,
      method: forecastMethodLabel(ruleByAccount[row.account]),
      monthlyForecast: monthly,
      forecastTotal: total,
      isOverridden: overrideByAccount[row.account] !== undefined,
    });
  });

  Object.values(combined).forEach((row) => {
    if (!row.subtotal) return;
    const bump = subtotalDeltas[row.account] || 0;
    out.push({
      ...row,
      method: '',
      monthlyForecast: row.monthlyForecast + (MONTHS ? bump / MONTHS : 0),
      forecastTotal: row.forecastTotal + bump,
      isOverridden: false,
    });
  });

  const orderedOut = [];
  SECTION_ORDER.forEach((sec) => {
    const inSec = out.filter((r) => r.section === sec);
    orderedOut.push(...inSec.filter((r) => !r.subtotal));
    orderedOut.push(...inSec.filter((r) => r.subtotal));
  });
  orderedOut.push(...out.filter((r) => !SECTION_ORDER.includes(r.section)));
  return orderedOut;
}

// Reorders a row list (e.g. the forecast table) to match the exact account sequence of a
// reference row list (e.g. the Actual vs. Budget table), so both tables read top-to-bottom in
// the same order. Any account present in `rows` but not in the reference falls back to the end,
// keeping its relative position among other unmatched rows.
export function reorderToMatch(rows, referenceRows) {
  const orderIndex = {};
  referenceRows.forEach((r, i) => {
    orderIndex[r.account] = i;
  });
  return [...rows].sort((a, b) => {
    const ai = orderIndex[a.account] ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex[b.account] ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

// Picks the N general-ledger accounts with the largest budget variances -- favorable or
// unfavorable -- for the Key Drivers bullets on the Board Presentation tab.
//
// Leaf accounts only. Subtotals would otherwise dominate the list by construction (Total for
// Expenses is always larger than any single line inside it) while telling a reader nothing they
// can act on.
//
// Ranked on the absolute dollar variance, so a large favorable swing competes on equal footing
// with a large unfavorable one. Direction follows the same convention as every other variance in
// the app: on a cost line spending less than budget is favorable, on a revenue line earning more
// than budget is favorable. isFlippedRow() already encodes that.
export function topVariances(rows, limit = 6) {
  return rows
    .filter((r) => !r.subtotal)
    .map((r) => {
      const actual = r.actual || 0;
      const budget = r.budget || 0;
      const raw = actual - budget;
      return {
        account: r.account,
        actual,
        budget,
        variance: Math.abs(raw),
        isFav: (isFlippedRow(r) ? -raw : raw) >= 0,
      };
    })
    // A line that lands on budget to the dollar is not driving anything.
    .filter((r) => Math.round(r.variance) !== 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, limit);
}
