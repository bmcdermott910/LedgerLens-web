import { buildBalanceSheet, fmtK } from '@/lib/finance';
import { fetchBalanceSheetLines } from '@/lib/queries';
import BalanceSheetTable from '@/components/BalanceSheetTable';

export const dynamic = 'force-dynamic';

// How many as-of dates the tab shows: the current balance sheet plus the three quarter ends
// behind it.
const PERIOD_COUNT = 4;

// period_end is a plain date string ('2026-09-29'); parsing it with `new Date()` would apply
// the server's timezone and can slide it a day. Split it instead.
function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function fmtDate(iso) {
  const { y, m, d } = parts(iso);
  return `${m}/${d}/${y}`;
}

// Quarter ends are labelled as such; anything else is an interim balance sheet run mid-quarter,
// which is what the right-hand column normally is.
function periodSublabel(iso) {
  const { y, m, d } = parts(iso);
  const quarterEnd = (m === 3 && d === 31) || (m === 6 && d === 30)
    || (m === 9 && d === 30) || (m === 12 && d === 31);
  if (quarterEnd) return `Q${Math.ceil(m / 3)} ${y}`;
  return 'Interim';
}

export default async function BalanceSheetPage() {
  const lines = await fetchBalanceSheetLines(PERIOD_COUNT);

  if (!lines.length) {
    return (
      <div className="card">
        <h2>Board Summary — Balance Sheet</h2>
        <p className="small-muted">
          No balance sheet has been loaded yet. Load the QuickBooks balance sheet export into
          <code> balance_sheet_lines</code> and this tab fills in.
        </p>
      </div>
    );
  }

  const { periods, values, detail, unmapped } = buildBalanceSheet(lines);
  const columns = periods.map((p) => ({
    key: p,
    label: fmtDate(p),
    sublabel: periodSublabel(p),
  }));

  // A balance sheet that does not balance is a load error, not a presentation choice, so say so
  // on the page rather than leaving a reader to add the columns up and find out.
  const latest = periods[periods.length - 1];
  const outOfBalance = periods.filter(
    (p) => Math.abs((values.ta[p] || 0) - (values.tle[p] || 0)) >= 1,
  );

  return (
    <div>
      <div className="card">
        <h2>Board Summary — Balance Sheet</h2>
        <p className="small-muted">
          One combined balance sheet for all of Wendal Inc. — Connetic RIA, InnerJoin
          Technologies and Admin together. Unlike the P&amp;L tabs there is no split by class:
          the balance sheet is not run by class in QuickBooks. Freedom IOT is excluded.
        </p>
        <p className="small-muted">
          The columns roll: the three prior quarter ends plus the date the current balance sheet
          was run, here {fmtDate(latest)}. Loading a newer export adds a column on the right and
          drops the oldest, with no code change. Every column is restated on the newest export,
          so a prior quarter here reflects adjusting entries booked since that quarter closed and
          can differ slightly from the figure in an earlier board package.
        </p>
        <p className="small-muted">
          Accounts roll into the presentation lines using the mapping in the BOD balance sheet
          workbook. The intercompany loan between Wendal and Connetic RIA is eliminated against
          Other long term assets rather than shown gross on both sides.
        </p>
        {unmapped.length > 0 && (
          <p className="stale-warning">
            {unmapped.length} account grouping{unmapped.length === 1 ? '' : 's'} in the data
            {unmapped.length === 1 ? ' is' : ' are'} not on any presentation line and{' '}
            {unmapped.length === 1 ? 'is' : 'are'} missing from the totals below:{' '}
            {unmapped.join(', ')}.
          </p>
        )}
        {outOfBalance.length > 0 && (
          <p className="stale-warning">
            Out of balance at {outOfBalance.map(fmtDate).join(', ')} — total assets do not equal
            total liabilities and members&apos; equity. The load is incomplete; treat these
            columns as unreliable until it is corrected. Difference at{' '}
            {fmtDate(outOfBalance[0])}:{' '}
            {fmtK((values.ta[outOfBalance[0]] || 0) - (values.tle[outOfBalance[0]] || 0))}.
          </p>
        )}
      </div>
      <BalanceSheetTable columns={columns} values={values} detail={detail} />
    </div>
  );
}
