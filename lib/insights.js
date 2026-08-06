// Fixed, auditable lookups that back the "Ask about these numbers" box.
//
// Design note: the language model is NEVER given database access and never does arithmetic.
// It can only choose one of the lookups below and supply parameters from a closed set of
// options. Every figure it quotes is computed here, by the same finance.js helpers the
// dashboard tables use, so an answer can't disagree with what's on screen.
//
// Each lookup returns { title, columns, rows, notes } -- a small display-ready table that is
// both handed to the model as JSON and rendered underneath its answer as supporting evidence.

import { PERIODS, combinedRows, computeBuckets, BUCKET_ROWS } from './finance';
import { fetchGlRows, fetchTransactions, fetchWagesByPerson, fetchEmployeeBudgets } from './queries';
import { combineWagesByPerson } from './finance';

export const ENTITIES = {
  'wendal-inc': { label: 'Wendal Inc. (RIA + IJT + Admin)', classes: ['RIA', 'IJT', 'Admin'] },
  ria: { label: 'Connetic RIA', classes: ['RIA'] },
  ijt: { label: 'InnerJoin Technologies (IJT)', classes: ['IJT'] },
  admin: { label: 'Admin', classes: ['Admin'] },
};

export const SECTION_LABELS = {
  Income: 'Income / Revenue',
  COGS: 'Cost of Goods Sold',
  SGA: 'SG&A / Operating Expenses',
  OtherIncome: 'Other Income',
  OtherExpense: 'Other Expense',
};

function resolveEntity(entity) {
  const e = ENTITIES[entity];
  if (!e) throw new Error(`Unknown entity "${entity}"`);
  return e;
}

function resolvePeriod(periodKey) {
  const p = PERIODS.find((x) => x.key === periodKey);
  if (!p) throw new Error(`Unknown period "${periodKey}"`);
  return p;
}

const num = (v) => Number(v) || 0;

// A blank budget and a zero budget mean different things: the first is "nobody set one", the
// second is "we planned to spend nothing". The dashboard renders both as 0, but an explanation
// that says "over a $0 budget" when no budget was ever entered is misleading, so the lookups
// track it explicitly and the model is instructed to say so.
function budgetIsUnset(rawRows, account) {
  const rows = rawRows.filter((r) => r.account === account);
  return rows.length > 0 && rows.every((r) => r.budget === null || r.budget === undefined);
}

// Positive variance = unfavorable for costs, favorable for revenue. `flip` marks a cost row.
function varianceOf(actual, budget, flip) {
  const raw = actual - budget;
  return { variance: raw, favorable: flip ? raw <= 0 : raw >= 0 };
}

const MONEY_COLS = (extra = []) => [
  { key: 'label', label: 'Line', type: 'text' },
  { key: 'actual', label: 'Actual', type: 'money' },
  { key: 'budget', label: 'Budget', type: 'money' },
  { key: 'variance', label: 'Variance', type: 'money' },
  { key: 'favorable', label: 'Fav/(Unfav)', type: 'fav' },
  ...extra,
];

// ---------------------------------------------------------------------------
// Lookup 1: the Board Summary bucket rollup for one entity and period.
// Answers "is X over or under budget, and by how much".
// ---------------------------------------------------------------------------
export async function bucketVariance({ entity, period }) {
  const e = resolveEntity(entity);
  const p = resolvePeriod(period);
  const raw = await fetchGlRows(e.classes, p.months);
  const buckets = computeBuckets(combinedRows(raw));

  const rows = BUCKET_ROWS.map((b) => {
    const v = buckets[b.key] || { actual: 0, budget: 0 };
    const actual = num(v.actual);
    const budget = num(v.budget);
    const { variance, favorable } = varianceOf(actual, budget, b.flip);
    return { label: b.label, actual, budget, variance, favorable };
  });

  return {
    title: `${e.label} — summary vs. budget, ${p.label}`,
    columns: MONEY_COLS(),
    rows,
    notes: [],
  };
}

// ---------------------------------------------------------------------------
// Lookup 2: the individual GL accounts inside one section of the P&L.
// Answers "what is actually driving that bucket" and "what are the biggest items".
// payroll: 'only' = wage/benefit accounts, 'exclude' = everything else, 'all' = both.
// ---------------------------------------------------------------------------
export async function sectionAccounts({ entity, period, section, payroll = 'all', sortBy = 'variance', limit = 12 }) {
  const e = resolveEntity(entity);
  const p = resolvePeriod(period);
  const raw = await fetchGlRows(e.classes, p.months);
  const combined = combinedRows(raw);

  const flip = section === 'COGS' || section === 'SGA' || section === 'OtherExpense';
  let rows = combined
    .filter((r) => r.section === section && !r.subtotal)
    .filter((r) => (payroll === 'only' ? r.wage : payroll === 'exclude' ? !r.wage : true))
    .map((r) => {
      const actual = num(r.actual);
      const budget = num(r.budget);
      const { variance, favorable } = varianceOf(actual, budget, flip);
      return { label: r.account, actual, budget, variance, favorable, noBudget: budgetIsUnset(raw, r.account) };
    })
    .filter((r) => r.actual !== 0 || r.budget !== 0);

  rows.sort((a, b) =>
    sortBy === 'actual'
      ? Math.abs(b.actual) - Math.abs(a.actual)
      : // "worst first": for costs the largest overspend, for revenue the largest shortfall
        (flip ? b.variance - a.variance : a.variance - b.variance)
  );

  const notes = [];
  const unset = rows.filter((r) => r.noBudget).map((r) => r.label);
  if (unset.length) {
    notes.push(
      `No budget was entered for these accounts (they are not $0 budgets, they are blank): ${unset.join(', ')}.`
    );
  }
  if (rows.length > limit) {
    notes.push(`Showing the top ${limit} of ${rows.length} accounts.`);
  }

  return {
    title: `${e.label} — ${SECTION_LABELS[section] || section}${
      payroll === 'only' ? ', payroll & benefits only' : payroll === 'exclude' ? ', excluding payroll' : ''
    }, ${p.label}`,
    columns: MONEY_COLS(),
    rows: rows.slice(0, limit),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Lookup 3: month-by-month history for a single account, so a variance can be
// described as "one unusual month" versus "running high all year".
// ---------------------------------------------------------------------------
export async function accountByMonth({ entity, period, account }) {
  const e = resolveEntity(entity);
  const p = resolvePeriod(period);
  const raw = await fetchGlRows(e.classes, p.months);

  const flip = raw.some((r) => r.account === account && ['COGS', 'SGA', 'OtherExpense'].includes(r.section));
  const rows = p.months.map((month) => {
    const inMonth = raw.filter((r) => r.account === account && r.month_key === month);
    const actual = inMonth.reduce((s, r) => s + num(r.actual), 0);
    const budget = inMonth.reduce((s, r) => s + num(r.budget), 0);
    const { variance, favorable } = varianceOf(actual, budget, flip);
    return { label: month, actual, budget, variance, favorable };
  });

  return {
    title: `${e.label} — "${account}" by month, ${p.label}`,
    columns: MONEY_COLS(),
    rows,
    notes: rows.every((r) => r.actual === 0 && r.budget === 0)
      ? [`No activity found for an account named "${account}" in this entity and period.`]
      : [],
  };
}

// ---------------------------------------------------------------------------
// Lookup 4: the actual transactions behind one account -- vendor names, dates,
// amounts. This is what turns "SG&A is high" into "it was these three invoices".
// ---------------------------------------------------------------------------
export async function accountTransactions({ entity, period, account, limit = 15 }) {
  const e = resolveEntity(entity);
  const p = resolvePeriod(period);
  const txns = await fetchTransactions(e.classes, p.months, account);

  const sorted = [...txns].sort((a, b) => Math.abs(num(b.amount)) - Math.abs(num(a.amount)));
  const total = txns.reduce((s, t) => s + num(t.amount), 0);
  const notes = [`${txns.length} transaction(s) totalling ${Math.round(total).toLocaleString()}.`];
  if (txns.length > limit) notes.push(`Showing the ${limit} largest by absolute amount.`);

  return {
    title: `${e.label} — transactions in "${account}", ${p.label}`,
    columns: [
      { key: 'label', label: 'Date', type: 'text' },
      { key: 'name', label: 'Payee / Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'actual', label: 'Amount', type: 'money' },
    ],
    rows: sorted.slice(0, limit).map((t) => ({
      label: t.txn_date || '',
      name: t.txn_name || t.txn_type || '',
      description: t.description || '',
      actual: num(t.amount),
    })),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Lookup 5: per-person wages vs. budgeted wages, for payroll variance questions.
// ---------------------------------------------------------------------------
export async function wagesByPerson({ entity, period }) {
  const e = resolveEntity(entity);
  const p = resolvePeriod(period);
  const [wageRows, budgetRows] = await Promise.all([
    fetchWagesByPerson(e.classes, p.months),
    fetchEmployeeBudgets(),
  ]);
  const people = combineWagesByPerson(wageRows, budgetRows, e.classes, p.months.length);

  return {
    title: `${e.label} — wages by person, ${p.label}`,
    columns: MONEY_COLS(),
    rows: people.map((person) => {
      const { variance, favorable } = varianceOf(person.actual, person.budget, true);
      return { label: person.name, actual: person.actual, budget: person.budget, variance, favorable };
    }),
    notes: [
      'Budgeted wages are not prorated for partial months, so a mid-month period will look favorable by roughly half a month.',
    ],
  };
}

export const LOOKUPS = {
  bucket_variance: bucketVariance,
  section_accounts: sectionAccounts,
  account_by_month: accountByMonth,
  account_transactions: accountTransactions,
  wages_by_person: wagesByPerson,
};

// Tool schemas handed to the model. The enums are what keep it inside known-good territory:
// it cannot invent an entity, a period, or a section that the lookups don't understand.
const ENTITY_ENUM = Object.keys(ENTITIES);
const PERIOD_ENUM = PERIODS.map((p) => p.key);
const SECTION_ENUM = ['Income', 'COGS', 'SGA', 'OtherIncome', 'OtherExpense'];

const entityProp = {
  type: 'string',
  enum: ENTITY_ENUM,
  description: 'Which entity to look at. "wendal-inc" is the consolidated RIA + IJT + Admin total.',
};
const periodProp = {
  type: 'string',
  enum: PERIOD_ENUM,
  description: 'Reporting period. Default to the period the user is currently viewing.',
};

export const TOOL_SCHEMAS = [
  {
    name: 'bucket_variance',
    description:
      'Top-level summary vs. budget for one entity and period: revenue, COGS split into payroll and other, gross profit, SG&A split into payroll and other, operating income and net income. Start here for any "why is X over/under budget" question to size the variance before drilling in.',
    input_schema: {
      type: 'object',
      properties: { entity: entityProp, period: periodProp },
      required: ['entity', 'period'],
    },
  },
  {
    name: 'section_accounts',
    description:
      'The individual GL accounts inside one section of the P&L, with actual, budget and variance. Use payroll="only" for the payroll & benefits buckets, payroll="exclude" for the "other costs" buckets, and sortBy="actual" when the user asks for the largest items rather than the largest variances.',
    input_schema: {
      type: 'object',
      properties: {
        entity: entityProp,
        period: periodProp,
        section: { type: 'string', enum: SECTION_ENUM },
        payroll: { type: 'string', enum: ['only', 'exclude', 'all'] },
        sortBy: { type: 'string', enum: ['variance', 'actual'] },
        limit: { type: 'integer', description: 'Max accounts to return, default 12.' },
      },
      required: ['entity', 'period', 'section'],
    },
  },
  {
    name: 'account_by_month',
    description:
      'Month-by-month actual vs. budget for a single named GL account. Use this to tell whether a variance is one unusual month or a run-rate problem. The account name must match exactly one returned by section_accounts.',
    input_schema: {
      type: 'object',
      properties: { entity: entityProp, period: periodProp, account: { type: 'string' } },
      required: ['entity', 'period', 'account'],
    },
  },
  {
    name: 'account_transactions',
    description:
      'The underlying transactions for a single named GL account -- date, payee, description, amount -- largest first. Use this to name the specific vendors or invoices behind a variance. The account name must match exactly one returned by section_accounts.',
    input_schema: {
      type: 'object',
      properties: {
        entity: entityProp,
        period: periodProp,
        account: { type: 'string' },
        limit: { type: 'integer', description: 'Max transactions to return, default 15.' },
      },
      required: ['entity', 'period', 'account'],
    },
  },
  {
    name: 'wages_by_person',
    description:
      'Actual vs. budgeted wages per employee for one entity and period. Use this when a payroll or benefits variance needs to be explained by headcount or by a specific person.',
    input_schema: {
      type: 'object',
      properties: { entity: entityProp, period: periodProp },
      required: ['entity', 'period'],
    },
  },
];
