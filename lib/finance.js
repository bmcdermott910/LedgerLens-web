// Shared finance logic, ported directly from the proven LedgerLens static-HTML prototype
// (app2.js). Keeping this identical is what makes phase-1 numbers match the old dashboard exactly.

// Reporting periods, the trend month range and the forecast horizon are NO LONGER defined here.
// They are derived at request time from the `months` table by buildPeriodModel() in lib/periods.js,
// so loading a new month rolls the dashboard forward without a code change. This file keeps only
// the calculation logic, which is period-agnostic.

// Tabs with a `classes` array are entity tabs served by app/dashboard/[cls]/page.js. The two
// without one are their own routes (Board Summary at /dashboard, the 5 Year Trend at its own
// static segment, which Next.js matches ahead of the [cls] catch-all).
export const TABS = [
  { key: '', label: 'Board Summary' },
  { key: 'five-year', label: 'Board Summary — 5 Year Trend' },
  { key: 'balance-sheet', label: 'Board Summary — Balance Sheet' },
  { key: 'budget', label: '2027–2028 Budget' },
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

// ---------------------------------------------------------------------------
// Balance sheet -- Board Summary — Balance Sheet tab
// ---------------------------------------------------------------------------
//
// One combined balance sheet for all of Wendal Inc. (RIA + IJT + Admin). There is no class
// dimension: the QuickBooks balance sheet is not run by class, so `balance_sheet_lines` holds
// one row per account per as-of date and nothing here filters by entity.
//
// BS_ROWS is the board presentation, line for line, in the order the BOD workbook prints it.
// A row either rolls up `groups` (values of balance_sheet_lines.grouping) or is a subtotal of
// earlier rows named in `sum`. `less` subtracts a grouping from the line.
//
// The one non-obvious line is Other long term assets. "Loan to Connetic RIA" (an asset) and
// "Loan from Wendal" (a liability) are the two halves of the same intercompany balance, mapped
// to "Other long term assets" and "Intercompany elimination - LT" respectively. Showing both
// gross would inflate the balance sheet on each side by the same amount, so the elimination
// grouping is netted out of Other long term assets -- exactly what the BOD workbook does.
export const BS_ROWS = [
  { key: 'assetsHdr', label: 'Assets', header: true },
  { key: 'cash', label: 'Cash and cash equivalents', indent: true, groups: ['Cash and cash equivalents'] },
  { key: 'ar', label: 'Accounts receivable', indent: true, groups: ['Accounts receivable'] },
  { key: 'inventory', label: 'Inventories - net', indent: true, groups: ['Inventories - net'] },
  { key: 'oca', label: 'Other current assets', indent: true, groups: ['Other current assets'] },
  { key: 'tca', label: 'Total current assets', bold: true, sum: ['cash', 'ar', 'inventory', 'oca'] },
  { key: 'fa', label: 'Fixed assets, net', indent: true, groups: ['Fixed assets, net'] },
  { key: 'ia', label: 'Intangible assets', indent: true, groups: ['Intangible assets'] },
  {
    key: 'ola',
    label: 'Other long term assets',
    indent: true,
    groups: ['Other long term assets'],
    less: ['Intercompany elimination - LT'],
  },
  { key: 'ta', label: 'Total assets', bold: true, rule: true, sum: ['tca', 'fa', 'ia', 'ola'] },

  { key: 'liabHdr', label: 'Liabilities', header: true },
  { key: 'ap', label: 'Accounts payable', indent: true, groups: ['Accounts payable'] },
  { key: 'contract', label: 'Contract liabilities', indent: true, groups: ['Contract liabilities'] },
  { key: 'ocl', label: 'Other current liabilities', indent: true, groups: ['Other current liabilities'] },
  {
    key: 'payroll',
    label: 'Payroll and related liabilities',
    indent: true,
    groups: ['Payroll and related liabilities'],
  },
  { key: 'tcl', label: 'Total current liabilities', bold: true, sum: ['ap', 'contract', 'ocl', 'payroll'] },
  { key: 'ltl', label: 'Long term liabilities', indent: true, groups: ['Long Term Liabilities'] },
  { key: 'tl', label: 'Total liabilities', bold: true, rule: true, sum: ['tcl', 'ltl'] },

  { key: 'equity', label: "Members' equity", groups: ['Members equity'] },
  {
    key: 'tle',
    label: "Total liabilities and members' equity",
    bold: true,
    rule: true,
    sum: ['tl', 'equity'],
  },
];

// The groupings that legitimately have no presentation line of their own, because they are
// netted into one. Anything else missing from BS_ROWS would silently drop off the statement,
// so buildBalanceSheet reports it rather than letting the sheet stop balancing in silence.
const BS_NETTED_GROUPS = new Set(['Intercompany elimination - LT']);

// rows: [{ period_end, account, grouping, sort_order, amount }] straight from
// balance_sheet_lines. Returns the periods oldest-first, the value of every BS_ROWS line in
// each period, the account detail behind each non-subtotal line, and any grouping in the data
// that no line picks up.
export function buildBalanceSheet(rows) {
  const periods = [...new Set(rows.map((r) => r.period_end))].sort();

  const byGroup = {};
  rows.forEach((r) => {
    const g = (byGroup[r.grouping] ||= {});
    g[r.period_end] = (g[r.period_end] || 0) + Number(r.amount || 0);
  });

  const values = {};
  BS_ROWS.forEach((row) => {
    if (row.header) return;
    values[row.key] = Object.fromEntries(periods.map((p) => {
      let v = 0;
      (row.groups || []).forEach((g) => { v += byGroup[g]?.[p] || 0; });
      (row.less || []).forEach((g) => { v -= byGroup[g]?.[p] || 0; });
      (row.sum || []).forEach((k) => { v += values[k]?.[p] || 0; });
      return [p, v];
    }));
  });

  // Account detail, in the source workbook's own account order. An account that is zero in
  // every period on screen is dropped -- the chart of accounts carries a long tail of dormant
  // accounts, and printing them makes the drill-down harder to read, not more complete.
  const detail = {};
  BS_ROWS.forEach((row) => {
    if (!row.groups && !row.less) return;
    const wanted = new Map();
    rows.forEach((r) => {
      const isLess = (row.less || []).includes(r.grouping);
      if (!isLess && !(row.groups || []).includes(r.grouping)) return;
      const label = isLess ? `${r.account} (eliminated)` : r.account;
      const entry = wanted.get(label) || { account: label, sort: r.sort_order, amounts: {} };
      entry.amounts[r.period_end] = (entry.amounts[r.period_end] || 0)
        + (isLess ? -Number(r.amount || 0) : Number(r.amount || 0));
      wanted.set(label, entry);
    });
    detail[row.key] = [...wanted.values()]
      .filter((a) => periods.some((p) => Math.round(a.amounts[p] || 0) !== 0))
      .sort((a, b) => a.sort - b.sort);
  });

  const claimed = new Set();
  BS_ROWS.forEach((r) => [...(r.groups || []), ...(r.less || [])].forEach((g) => claimed.add(g)));
  const unmapped = [...new Set(rows.map((r) => r.grouping))]
    .filter((g) => !claimed.has(g) && !BS_NETTED_GROUPS.has(g));

  return { periods, values, detail, unmapped };
}

// Board presentation is to the nearest $1,000, matching the BOD balance sheet workbook. Every
// line is rounded from its own exact value rather than from rounded components, so a subtotal
// can differ by $1,000 from the lines above it -- same behaviour as the workbook.
export function fmtK(n) {
  if (n === undefined || n === null) return '—';
  const r = Math.round(Number(n) / 1000) * 1000;
  const v = Math.abs(r).toLocaleString();
  return r < 0 ? '(' + v + ')' : v;
}

export const SECTION_ORDER = ['Income', 'COGS', 'SGA', 'OtherIncome', 'OtherExpense'];
const ALWAYS_NORMAL = new Set([
  'Gross Profit', 'Net Operating Income', 'Net Other Income', 'Net Income',
  'Total for Income', 'Total for Other Income',
]);

// Subtotal rows that are correct arithmetic but redundant on screen. "Net Other Income" sits
// directly under "Total for Other Income" and reads as a repeat of it -- for a class with no
// Other Expenses the two are identical to the penny. Net Income already carries the effect, so
// the account-level tables hide it. It is still computed and still feeds the Board Summary's
// "Other Income / (Expense), net" line; this only suppresses the duplicated-looking row.
const HIDDEN_DETAIL_ROWS = new Set(['Net Other Income']);

export function hideRedundantRows(rows) {
  return rows.filter((r) => !HIDDEN_DETAIL_ROWS.has(r.account));
}

// Attaches the canonical presentation fields from gl_account_order: the row's position in the
// QuickBooks class report, its indent depth, and -- for a "Total for X" row -- the accounts that
// total covers. Carrying the source layout rather than re-deriving a hierarchy is what keeps a
// subtotal sitting directly under the lines it totals.
//
// `order` is the map from fetchAccountOrder(). An account missing from it still renders; it
// simply has no position of its own (see sortBySourceOrder).
function withOrder(row, order) {
  const o = order && order[row.account];
  if (!o) return { ...row, sortOrder: null, depth: null, totalOf: null, members: null };
  return {
    ...row,
    sortOrder: o.sort_order,
    depth: o.depth,
    totalOf: o.total_of,
    members: o.members || null,
  };
}

// Sorts into source order. Rows the order table has never seen -- a GL account added since the
// last close -- keep their relative position and fall to the end rather than vanishing, so a new
// account shows up in the wrong place instead of silently disappearing from the statement.
function sortBySourceOrder(rows) {
  return rows
    .map((r, i) => [r, i])
    .sort((a, b) => {
      const ai = a[0].sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bi = b[0].sortOrder ?? Number.MAX_SAFE_INTEGER;
      return ai === bi ? a[1] - b[1] : ai - bi;
    })
    .map((pair) => pair[0]);
}

// Which rows an income statement actually prints. Three rules, applied in this order because
// each depends on the one before it:
//
//   1. Drop rows that are empty in every column -- an account with no activity this period.
//   2. Drop the rows that are arithmetically right but redundant on screen (HIDDEN_DETAIL_ROWS).
//   3. Drop any "Total for X" left covering one or fewer visible lines. A total of a single line
//      is the same number printed twice.
//
// Rule 3 runs *after* rule 1 deliberately: a group whose other members happen to be zero this
// period loses its total for this period only, and gets it back when they come back. A total
// whose group opener is a pure header row (Non-Recurring Revenue, Other Miscellaneous Income)
// self-corrects the same way, since a header is never among the rows and so never counts.
//
// `isEmpty` decides rule 1 and defaults to the actual/budget pair the GL table renders; the
// forecast table passes its own, since it prints rows the GL table would drop.
export function visibleStatementRows(rows, isEmpty) {
  const empty = isEmpty || ((r) => r.actual === 0 && r.budget === 0);
  const kept = hideRedundantRows(rows).filter((r) => !empty(r));
  const present = new Set(kept.map((r) => r.account));
  return kept.filter((r) => {
    if (!r.members) return true;
    return r.members.filter((m) => present.has(m)).length > 1;
  });
}

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
// months for YTD), then orders the result.
//
// With `order` (the map from fetchAccountOrder) the rows come out in the exact sequence of the
// QuickBooks class report: every "Total for X" directly under the lines it totals, child accounts
// under their parent, Net Income last. Without it the old section-by-section fallback applies,
// which groups each section's subtotals together at the end of that section.
export function combinedRows(rawRows, order) {
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
  const all = Object.values(map).map((r) => withOrder(r, order));
  if (order) return sortBySourceOrder(all);
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
export function buildForecastRows(forecastRows, forecastRules, overrides, classKeys, forecastMonthCount, order) {
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

  const withFields = out.map((r) => withOrder(r, order));
  if (order) return sortBySourceOrder(withFields);
  const orderedOut = [];
  SECTION_ORDER.forEach((sec) => {
    const inSec = withFields.filter((r) => r.section === sec);
    orderedOut.push(...inSec.filter((r) => !r.subtotal));
    orderedOut.push(...inSec.filter((r) => r.subtotal));
  });
  orderedOut.push(...withFields.filter((r) => !SECTION_ORDER.includes(r.section)));
  return orderedOut;
}

// ---------------------------------------------------------------------------------------
// 5 Year Trend
// ---------------------------------------------------------------------------------------

// The six independent lines every full-year column is built from. Everything else on the
// 5 Year Trend tab is derived from these, so a total can never disagree with its own parts.
export const ANNUAL_BUCKETS = ['income', 'cogsPayroll', 'cogsOther', 'sgaPayroll', 'sgaOther', 'otherIncomeNet'];

// Expands the six primitives into the full BUCKET_ROWS shape used by the Board Summary, so
// both tabs read down the page in exactly the same order with the same arithmetic.
export function deriveAnnualBuckets(p) {
  const income = p.income || 0;
  const cogsPayroll = p.cogsPayroll || 0;
  const cogsOther = p.cogsOther || 0;
  const sgaPayroll = p.sgaPayroll || 0;
  const sgaOther = p.sgaOther || 0;
  const otherIncomeNet = p.otherIncomeNet || 0;
  const cogsTotal = cogsPayroll + cogsOther;
  const grossProfit = income - cogsTotal;
  const sgaTotal = sgaPayroll + sgaOther;
  const netOperatingIncome = grossProfit - sgaTotal;
  return {
    income, cogsPayroll, cogsOther, cogsTotal, grossProfit,
    sgaPayroll, sgaOther, sgaTotal, netOperatingIncome, otherIncomeNet,
    netIncome: netOperatingIncome + otherIncomeNet,
  };
}

// Sums the stored annual_summary rows for one entity (one or more classes) and one year.
// Returns null when that year holds nothing for those classes, which is what lets the table
// print an em dash for a year nobody has supplied yet rather than a misleading row of zeros.
export function annualBucketsFor(annualRows, classKeys, year) {
  const mine = annualRows.filter((r) => classKeys.includes(r.class_key) && Number(r.year) === year);
  if (!mine.length) return null;
  const p = {};
  mine.forEach((r) => {
    p[r.bucket] = (p[r.bucket] || 0) + (Number(r.amount) || 0);
  });
  return deriveAnnualBuckets(p);
}

// Derives the same six primitives from the live forecast baseline, so the 2026 column on the
// 5 Year Trend tab is the Forecast tab's own full-year totals rather than a second copy of
// them that could drift. Uses the stored baseline, deliberately ignoring per-user what-if
// overrides -- a board trend should not move because someone was experimenting on another tab.
export function forecastBucketsFor(forecastRows, classKeys) {
  const mine = forecastRows.filter((r) => classKeys.includes(r.class_key));
  if (!mine.length) return null;
  const total = (account) =>
    mine.filter((r) => r.account === account)
      .reduce((sum, r) => sum + (Number(r.forecast_total) || 0), 0);

  // forecast_rows carries only the nine major subtotals per class -- unlike gl_line_items it has
  // no "Total for Operating Wages" / "Total for SG&A Wages" row -- so the payroll split has to be
  // summed from the wage-flagged leaf accounts in each section. The Other lines are then taken as
  // the section subtotal minus payroll, which keeps both halves footing to the stored total.
  const wageTotal = (section) =>
    mine.filter((r) => r.is_wage && r.section === section)
      .reduce((sum, r) => sum + (Number(r.forecast_total) || 0), 0);

  const cogsPayroll = wageTotal('COGS');
  const sgaPayroll = wageTotal('SGA');
  return deriveAnnualBuckets({
    income: total('Total for Income'),
    cogsPayroll,
    cogsOther: total('Total for Cost of Goods Sold') - cogsPayroll,
    sgaPayroll,
    sgaOther: total('Total for Expenses') - sgaPayroll,
    otherIncomeNet: total('Net Other Income'),
  });
}

// Reorders a row list (e.g. the forecast table) to match the exact account sequence of a
// reference row list (e.g. the Actual vs. Budget table), so both tables read top-to-bottom in
// the same order.
//
// An account in `rows` but not in the reference -- a line with a forecast but no actuals in the
// selected period, such as IJT AI Workshop viewed as MTD September -- slots in at its own
// canonical position instead of being dumped after Net Income. Only a row with no position at
// all falls to the end.
export function reorderToMatch(rows, referenceRows) {
  const orderIndex = {};
  referenceRows.forEach((r, i) => {
    orderIndex[r.account] = i;
  });
  const anchors = referenceRows
    .filter((r) => r.sortOrder !== null && r.sortOrder !== undefined)
    .map((r) => [r.sortOrder, orderIndex[r.account]]);
  // Where an unmatched row belongs: just after the last reference row that precedes it in the
  // canonical order. Fractional so it sorts between two reference rows without disturbing them.
  const slotFor = (row) => {
    if (row.sortOrder === null || row.sortOrder === undefined) return Number.MAX_SAFE_INTEGER;
    let slot = -0.5;
    anchors.forEach(([src, idx]) => {
      if (src < row.sortOrder && idx > slot) slot = idx + 0.5;
    });
    return slot;
  };
  return [...rows].sort((a, b) => {
    const ai = orderIndex[a.account] ?? slotFor(a);
    const bi = orderIndex[b.account] ?? slotFor(b);
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

// ---------------------------------------------------------------------------------------
// Quarterly cash & runway (5 Year Trend tab)
// ---------------------------------------------------------------------------------------

// Cash burn is NOT Net Operating Income for actual months. Per the finance team's CHARTS
// workbook it is net income with the non-cash and one-off items stripped out:
//   burn = Net Income − Unrealized Gain/Loss − Distribution Income - Freedom IOT LLC
// The first is a mark-to-market swing that never moves cash; the second is the one-off gain on
// the Freedom IOT divestiture (June 2026), which would otherwise read as a month of positive
// operations. Recomputing the workbook's own months this way lands within ~1% of its published
// doomsday figures from April 2026 on; the residual is the August restatements, which moved
// May-July after that workbook was generated.
const BURN_EXCLUDED_ACCOUNTS = ['Unrealized Gain/Loss', 'Distribution Income - Freedom IOT LLC'];

// Forward months have no such breakdown, so the forecast's Net Operating Income line is used as
// the projected cash usage -- the stated assumption for this chart.
//
// This covers 2026 only. The 2027/2028 months come from the budget engine (lib/budget.js) and
// are appended by the caller -- deliberately not read from annual_summary here, so a budget year
// can never be counted twice.
export function monthlyBurnSeries(glRows, forecastRows, months) {
  const actualByMonth = {};
  glRows.forEach((r) => {
    const m = r.month_key;
    if (!actualByMonth[m]) actualByMonth[m] = { ni: 0, excluded: 0 };
    if (r.account === 'Net Income') actualByMonth[m].ni += Number(r.actual) || 0;
    if (BURN_EXCLUDED_ACCOUNTS.includes(r.account)) actualByMonth[m].excluded += Number(r.actual) || 0;
  });

  const forecastMonthly = forecastRows
    .filter((r) => r.account === 'Net Operating Income')
    .reduce((sum, r) => sum + (Number(r.monthly_forecast) || 0), 0);

  // Walk all TWELVE calendar months of the forecast year, not just the rows in the months table.
  // That table only holds months that have been loaded -- eight of them as of August 2026 -- so
  // building the series from it stops the projection dead at the last loaded month and leaves
  // Q3 and Q4 with no cash figure at all. The unloaded months are exactly the ones the forecast
  // is for, so they take the forecast rate.
  //
  // A partial month (is_complete false) is deliberately projected rather than annualised from
  // half a month of actuals, which would read as a sudden collapse in the burn rate.
  const baseYear = months.length ? months[months.length - 1].year : null;
  const loaded = {};
  months.forEach((m) => { loaded[m.key] = m; });

  const series = baseYear === null ? [] : MONTH_NAMES.map((key) => {
    const m = loaded[key];
    const a = actualByMonth[key];
    if (m && m.is_complete && a) {
      return { key, year: baseYear, burn: a.ni - a.excluded, isActual: true };
    }
    return { key, year: baseYear, burn: forecastMonthly, isActual: false };
  });

  return series;
}

// Quarter-end cash and runway, Q1 of `startYear` through Q4 of `endYear`.
//
// Cash is the reported balance for any quarter that ends on or before the last month in
// cash_metrics, and is rolled forward from that last reported balance by the burn series after
// that. Runway (the "doomsday clock") is cash divided by the average monthly burn of that
// quarter's three months, expressed in years.
//
// A quarter with no data on either side returns null values, which the chart renders as a gap
// rather than as zero -- that is what leaves 2027 and 2028 empty until their budgets exist.
export function buildQuarterlySeries(cashMetrics, burnSeries, startYear, endYear) {
  const QUARTER_END = { 1: 'March', 2: 'June', 3: 'September', 4: 'December' };
  const byKey = {};
  burnSeries.forEach((b) => { byKey[`${b.year}|${b.key}`] = b; });

  const cashByLabel = {};
  cashMetrics.forEach((c) => { cashByLabel[c.month_label] = Number(c.total_cash); });
  const lastReported = cashMetrics.length ? cashMetrics[cashMetrics.length - 1] : null;

  // Roll cash forward month by month from the last reported balance.
  const projectedCash = {};
  if (lastReported) {
    let running = Number(lastReported.total_cash);
    const startIdx = burnSeries.findIndex(
      (b) => `${MONTH_ABBREV_3(b.key)} ${b.year}` === lastReported.month_label
    );
    for (let i = startIdx + 1; i >= 0 && i < burnSeries.length; i += 1) {
      running += burnSeries[i].burn;
      projectedCash[`${burnSeries[i].year}|${burnSeries[i].key}`] = running;
    }
  }

  const out = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let q = 1; q <= 4; q += 1) {
      const endMonth = QUARTER_END[q];
      const label = `Q${q} ${String(year).slice(2)}`;
      const reported = cashByLabel[`${MONTH_ABBREV_3(endMonth)} ${year}`];
      const cash = reported !== undefined ? reported : projectedCash[`${year}|${endMonth}`];
      const isActual = reported !== undefined;

      const qMonths = [(q - 1) * 3, (q - 1) * 3 + 1, (q - 1) * 3 + 2]
        .map((i) => byKey[`${year}|${MONTH_NAMES[i]}`])
        .filter(Boolean);
      const avgBurn = qMonths.length === 3
        ? qMonths.reduce((s, m) => s + m.burn, 0) / 3
        : null;

      const runway = cash !== undefined && avgBurn !== null && avgBurn < 0
        ? cash / -avgBurn / 12
        : null;

      out.push({
        label,
        year,
        quarter: q,
        cash: cash === undefined ? null : cash,
        runway,
        isActual,
      });
    }
  }
  return out;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function MONTH_ABBREV_3(key) { return String(key).slice(0, 3); }

// ---------------------------------------------------------------------------------------
// 2027-2028 Budget
// ---------------------------------------------------------------------------------------

export const BUDGET_YEARS = [2027, 2028];

// The four views on the Budget tab. Wendal Total is summed on the fly from the three classes
// rather than stored, so it can never disagree with them.
export const BUDGET_ENTITIES = [
  { key: 'wendal', label: 'Wendal Inc. Total', classes: ['RIA', 'IJT', 'Admin'] },
  { key: 'ria', label: 'Connetic RIA', classes: ['RIA'] },
  { key: 'ijt', label: 'InnerJoin Technologies', classes: ['IJT'] },
  { key: 'admin', label: 'Admin', classes: ['Admin'] },
];

export const MONTH_COLS = ['m01','m02','m03','m04','m05','m06','m07','m08','m09','m10','m11','m12'];
export const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// MONTH_COLS is retained for the budget table header; the budget itself is computed in
// lib/budget.js from budget_rules and its drivers, not read from a table of stored numbers.
