// 2027-2028 budget engine.
//
// The budget is COMPUTED on every request from budget_rules plus the drivers (AUM schedule,
// per-account % adjustments, pay increase) and 2026 actuals -- never stored as a table of
// numbers. That is what keeps the Budget tab, the 5 Year Trend columns and the runway charts
// from ever disagreeing with each other or going stale after a driver changes.
//
// Source of the rules: "2027-2028 Budgeting Rules.xlsx" in the AI Budget Project folder.
// Four decisions confirmed with Brian on 2026-08-26 are baked in here:
//   1. SG&A benefit accounts key off SG&A Wages, not Operating Wages. The rules file said
//      Operating Wages for all thirteen benefit lines, which was a copy/paste slip.
//   2. An annualized figure is spread evenly -- one twelfth per month.
//   3. The 2028 % applies to the 2027 budget, so the two percentages compound.
//   4. "Through the previous month end" means the last CLOSED month (July 2026), so the
//      annualisation is YTD x 12/7 and the partial August is excluded.

import { SECTION_ORDER } from './finance';

export const BUDGET_MONTHS = 12;

// Management fee: 1.9% of AUM a year, billed monthly.
const MGMT_FEE_RATE = 0.019;

// Fee cap: the spread between the gross rate and the 2.65% cap, by AUM tier. Above $95M the
// account is zero. The rules file says "below $75M" for the first tier and "greater than $75M"
// for the second, which leaves exactly $75M unstated -- it is treated as the second tier here,
// and that matters: the AUM schedule hits exactly $75M in April 2028.
function feeCapMonthly(aum) {
  if (aum <= 0) return 0;
  if (aum < 75_000_000) return (aum * (0.029 - 0.0265)) / 12;
  if (aum <= 95_000_000) return (aum * (0.0275 - 0.0265)) / 12;
  return 0;
}

// The pay increase takes effect 1 March, so January and February of each year still run at the
// prior year's rate. 2028 compounds on top of 2027. The percentages are PER EMPLOYEE -- a person
// with no explicit figure falls back to the company-wide default, which the budget_wage_amounts()
// function already resolves, so everything below just reads the two numbers off the row.
export function wageFactor(year, monthIdx, p2027, p2028) {
  const afterMarch = monthIdx >= 2;          // monthIdx 0 = January
  if (year === 2027) return afterMarch ? 1 + p2027 : 1;
  return afterMarch ? (1 + p2027) * (1 + p2028) : 1 + p2027;
}

const r2 = (v) => Math.round(v * 100) / 100;

// The wage line for a month is the sum of each PERSON's rounded figure, not the rounded sum of
// the class. Rounding per person is what lets the employee summary chart underneath the table
// add up to the wage lines above it exactly rather than a few cents out -- and now that each
// person can carry a different increase, summing first would be wrong as well as imprecise.
function wageLineFor(people, year, monthIdx) {
  return people.reduce(
    (s, p) => s + r2(p.amount * wageFactor(year, monthIdx, p.pct2027, p.pct2028)),
    0
  );
}

// Nine subtotal rows per class, derived from the detail rather than budgeted, so a subtotal can
// never disagree with the lines underneath it. Same shape as the Forecast and GL tables.
function deriveSubtotals(detail, year, monthIdx) {
  const sec = (s) => detail.filter((r) => r.section === s)
    .reduce((t, r) => t + r.years[year][monthIdx], 0);
  const income = sec('Income');
  const cogs = sec('COGS');
  const sga = sec('SGA');
  const oi = sec('OtherIncome');
  const oe = sec('OtherExpense');
  const gross = income - cogs;
  const noi = gross - sga;
  const netOther = oi - oe;
  return {
    'Total for Income': income,
    'Total for Cost of Goods Sold': cogs,
    'Gross Profit': gross,
    'Total for Expenses': sga,
    'Net Operating Income': noi,
    'Total for Other Income': oi,
    'Total for Other Expenses': oe,
    'Net Other Income': netOther,
    'Net Income': noi + netOther,
  };
}

// Builds one class's full 24-month budget.
//
// `structure` is the account universe with its section / is_subtotal / is_wage flags, taken from
// forecast_rows so the budget lists exactly the accounts the Forecast tab does, in the same order.
export function buildClassBudget({
  classKey, structure, glRows, rules, wageBase, aum, pct, closedMonths, years,
}) {
  const ruleFor = {};
  rules.forEach((r) => { ruleFor[r.account] = r; });

  // --- 2026 actuals through the last closed month, per account ---
  const ytd = {};
  glRows.forEach((r) => {
    if (r.class_key !== classKey) return;
    ytd[r.account] = (ytd[r.account] || 0) + (Number(r.actual) || 0);
  });
  const annualise = (v) => (closedMonths > 0 ? (v * BUDGET_MONTHS) / closedMonths : 0);

  // --- each person's monthly wage for this class, split by type, with that person's own
  // increase percentages attached, before any increase is applied ---
  const peopleByType = { 'Operating Wages': [], 'SG&A Wages': [] };
  wageBase.forEach((r) => {
    if (r.class_key !== classKey) return;
    if (!peopleByType[r.wage_account]) return;
    peopleByType[r.wage_account].push({
      amount: Number(r.monthly_amount) || 0,
      pct2027: Number(r.pct_2027) || 0,
      pct2028: Number(r.pct_2028) || 0,
    });
  });

  const aumFor = {};
  aum.forEach((a) => { aumFor[`${a.year}|${a.month_num}`] = Number(a.aum) || 0; });

  const pctFor = {};
  pct.forEach((p) => {
    if (p.class_key === classKey) pctFor[`${p.account}|${p.year}`] = Number(p.pct) || 0;
  });

  // Cumulative % factor: 2027 lifts the 2026 annualised base, 2028 compounds on 2027.
  const pctFactor = (account, year) => {
    const f27 = 1 + (pctFor[`${account}|2027`] || 0);
    if (year === 2027) return f27;
    return f27 * (1 + (pctFor[`${account}|2028`] || 0));
  };

  const detailAccounts = structure.filter((s) => !s.is_subtotal);
  const out = structure.map((s) => ({
    account: s.account,
    section: s.section,
    subtotal: s.is_subtotal,
    wage: s.is_wage,
    method: ruleFor[s.account]?.method || (s.is_subtotal ? 'derived' : 'zero'),
    methodLabel: s.is_subtotal ? '' : (ruleFor[s.account]?.note || 'Zero'),
    years: Object.fromEntries(years.map((y) => [y, new Array(BUDGET_MONTHS).fill(0)])),
  }));
  const byAccount = {};
  out.forEach((r) => { byAccount[r.account] = r; });

  years.forEach((year) => {
    for (let m = 0; m < BUDGET_MONTHS; m += 1) {
      // Pass 1 -- everything that does not depend on another budgeted line.
      detailAccounts.forEach((s) => {
        const rule = ruleFor[s.account];
        const row = byAccount[s.account];
        if (!rule) { row.years[year][m] = 0; return; }
        switch (rule.method) {
          case 'zero':
            row.years[year][m] = 0;
            break;
          case 'annualized_2026':
            row.years[year][m] =
              (annualise(ytd[s.account] || 0) / BUDGET_MONTHS) * pctFactor(s.account, year);
            break;
          case 'wage_base':
            row.years[year][m] = wageLineFor(peopleByType[s.account] || [], year, m);
            break;
          case 'aum_fee':
            row.years[year][m] = (aumFor[`${year}|${m + 1}`] || 0) * MGMT_FEE_RATE / BUDGET_MONTHS;
            break;
          case 'aum_fee_cap':
            row.years[year][m] = feeCapMonthly(aumFor[`${year}|${m + 1}`] || 0);
            break;
          default:
            break;                            // ratio rules handled in pass 2
        }
      });

      // Pass 2 -- ratio rules, which read a pass-1 figure for the same month.
      detailAccounts.forEach((s) => {
        const rule = ruleFor[s.account];
        if (!rule || (rule.method !== 'pct_of_wages' && rule.method !== 'pct_of_sales')) return;
        const baseYtd = ytd[rule.base_account] || 0;
        const ratio = baseYtd !== 0 ? (ytd[s.account] || 0) / baseYtd : 0;
        const baseRow = byAccount[rule.base_account];
        const baseBudget = baseRow ? baseRow.years[year][m] : 0;
        byAccount[s.account].years[year][m] = ratio * baseBudget;
      });

      // Round the detail BEFORE deriving subtotals from it. Deriving first and rounding after
      // leaves a subtotal a few cents off the lines it is meant to total, once twelve months of
      // sixty accounts have each been rounded independently.
      detailAccounts.forEach((s) => {
        const row = byAccount[s.account];
        row.years[year][m] = r2(row.years[year][m]);
      });

      // Pass 3 -- subtotals from the rounded detail.
      const derived = deriveSubtotals(out.filter((r) => !r.subtotal), year, m);
      Object.entries(derived).forEach(([account, value]) => {
        if (byAccount[account]) byAccount[account].years[year][m] = value;
      });
    }
  });

  // Round once, at the end, so the monthly figures and their totals agree.
  out.forEach((r) => {
    years.forEach((y) => {
      r.years[y] = r.years[y].map((v) => Math.round(v * 100) / 100);
    });
    r.totals = Object.fromEntries(
      years.map((y) => [y, Math.round(r.years[y].reduce((a, b) => a + b, 0) * 100) / 100])
    );
  });

  return orderRows(out);
}

// Three subtotals share the OtherExpense section, so "detail first, subtotals after" is not
// enough to place them -- without an explicit rank they come out in whatever order the structure
// query happened to return, which is how Net Income ended up above Net Other Income. Ranked here
// so the statement always reads the way it is presented to the board: the detail, then the
// section total, then the net, and Net Income as the last line of the whole budget.
const SUBTOTAL_ORDER = [
  'Total for Income',
  'Total for Cost of Goods Sold',
  'Gross Profit',
  'Total for Expenses',
  'Net Operating Income',
  'Total for Other Income',
  'Total for Other Expenses',
  'Net Other Income',
  'Net Income',
];

function orderRows(rows) {
  const rank = (r) => {
    const i = SUBTOTAL_ORDER.indexOf(r.account);
    return i === -1 ? SUBTOTAL_ORDER.length : i;
  };
  const ordered = [];
  SECTION_ORDER.forEach((sec) => {
    const inSec = rows.filter((r) => r.section === sec);
    ordered.push(...inSec.filter((r) => !r.subtotal));
    ordered.push(...inSec.filter((r) => r.subtotal).sort((a, b) => rank(a) - rank(b)));
  });
  ordered.push(...rows.filter((r) => !SECTION_ORDER.includes(r.section)));
  return ordered;
}

// Sums several classes' budgets into one -- how Wendal Inc. Total is produced. Subtotals add
// across classes just as the detail does, so the total's Net Income equals the sum of the parts.
export function sumClassBudgets(perClass, years) {
  const byAccount = {};
  const order = [];
  perClass.forEach((rows) => {
    rows.forEach((r) => {
      if (!byAccount[r.account]) {
        byAccount[r.account] = {
          account: r.account, section: r.section, subtotal: r.subtotal, wage: r.wage,
          method: r.method, methodLabel: r.methodLabel,
          years: Object.fromEntries(years.map((y) => [y, new Array(BUDGET_MONTHS).fill(0)])),
        };
        order.push(byAccount[r.account]);
      }
      years.forEach((y) => {
        r.years[y].forEach((v, i) => { byAccount[r.account].years[y][i] += v; });
      });
    });
  });
  order.forEach((r) => {
    r.totals = Object.fromEntries(
      years.map((y) => [y, Math.round(r.years[y].reduce((a, b) => a + b, 0) * 100) / 100])
    );
    years.forEach((y) => { r.years[y] = r.years[y].map((v) => Math.round(v * 100) / 100); });
  });
  return orderRows(order);
}

// The employee summary that sits under the budget table: each person's annual wages for the
// displayed entity, split Operating vs SG&A, with the pay increase applied from 1 March.
// `pctByPerson` is keyed "First Last|year" and holds this person's own increase; anyone without
// an explicit figure falls back to `defaultPct[year]`, the company-wide setting. The same
// fallback is applied inside budget_wage_amounts() on the database side, so the schedule below
// and the wage lines in the table above always agree.
export function buildWageSummary(wageBase, classKeys, pctByPerson, defaultPct, years) {
  const pctFor = (name, year) => {
    const own = pctByPerson[`${name}|${year}`];
    return own === undefined ? (Number(defaultPct[year]) || 0) : Number(own) || 0;
  };
  // Rounds each month exactly as the budget's wage line does, so this chart adds up to the
  // Operating Wages and SG&A Wages rows above it to the penny.
  const annualFor = (monthly, year, p27, p28) => {
    let t = 0;
    for (let m = 0; m < BUDGET_MONTHS; m += 1) t += r2(monthly * wageFactor(year, m, p27, p28));
    return r2(t);
  };

  // Annualise each class/person/type row on its own and add the results, rather than summing a
  // person's monthly pay across classes first. Someone split across two business units is
  // rounded once per class in the budget's wage line, so the chart has to do the same to match.
  const people = {};
  wageBase
    .filter((w) => classKeys.includes(w.class_key))
    .forEach((w) => {
      const name = `${w.first_name} ${w.last_name}`;
      if (!people[name]) {
        people[name] = {
          name, firstName: w.first_name, lastName: w.last_name,
          operatingMonthly: 0, sgaMonthly: 0,
          pct: Object.fromEntries(years.map((y) => [y, pctFor(name, y)])),
          years: Object.fromEntries(years.map((y) => [y, { operating: 0, sga: 0, total: 0 }])),
        };
      }
      const amount = Number(w.monthly_amount) || 0;
      const key = w.wage_account === 'Operating Wages' ? 'operating' : 'sga';
      people[name][`${key}Monthly`] += amount;
      years.forEach((y) => {
        const add = annualFor(amount, y, pctFor(name, 2027), pctFor(name, 2028));
        people[name].years[y][key] += add;
        people[name].years[y].total += add;
      });
    });

  return Object.values(people)
    .map((p) => {
      years.forEach((y) => {
        p.years[y].operating = r2(p.years[y].operating);
        p.years[y].sga = r2(p.years[y].sga);
        p.years[y].total = r2(p.years[y].total);
      });
      return p;
    })
    .sort((a, b) => (b.years[years[0]].total - a.years[years[0]].total));
}

// The six Board-Summary primitives for one budget year, read off a computed budget. Lets the
// 5 Year Trend tab's 2027/2028 columns come from the same engine as the Budget tab rather than
// from a separately stored figure that could drift.
export function budgetAnnualBuckets(rows, year) {
  const total = (account) => {
    const r = rows.find((x) => x.account === account);
    return r ? r.totals[year] : 0;
  };
  const wageTotal = (section) => rows
    .filter((r) => !r.subtotal && r.wage && r.section === section)
    .reduce((s, r) => s + r.totals[year], 0);

  const cogsPayroll = wageTotal('COGS');
  const sgaPayroll = wageTotal('SGA');
  return {
    income: total('Total for Income'),
    cogsPayroll,
    cogsOther: total('Total for Cost of Goods Sold') - cogsPayroll,
    sgaPayroll,
    sgaOther: total('Total for Expenses') - sgaPayroll,
    otherIncomeNet: total('Net Other Income'),
  };
}

// The twelve monthly Net Operating Income figures for a budget year -- the cash usage the
// runway charts roll forward on.
export function budgetMonthlyNOI(rows, year) {
  const r = rows.find((x) => x.account === 'Net Operating Income');
  return r ? r.years[year] : new Array(BUDGET_MONTHS).fill(0);
}
