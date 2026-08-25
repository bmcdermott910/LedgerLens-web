import { BUDGET_YEARS, MONTH_SHORT, fmt } from '@/lib/finance';

// Detailed monthly P&L for the budget years: every account of the Forecast tab, twelve monthly
// columns per year, each year closing with its own total. Twenty-seven columns is wider than the
// page, so the whole table scrolls sideways inside its card and the account column is pinned so
// you never lose your place while scrolling.
export default function BudgetTable({ rows }) {
  let lastSection = null;

  return (
    <div className="table-scroll">
      <table className="budget-table">
        <thead>
          <tr>
            <th className="sticky-col" rowSpan={2}>Account</th>
            {BUDGET_YEARS.map((y) => (
              <th key={y} colSpan={13} className="year-band">{y}</th>
            ))}
          </tr>
          <tr>
            {BUDGET_YEARS.map((y) => [
              ...MONTH_SHORT.map((m) => <th key={`${y}-${m}`}>{m}</th>),
              <th key={`${y}-total`} className="year-total">Total</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const showHeader = r.section !== lastSection && !r.subtotal;
            if (showHeader) lastSection = r.section;
            return (
              <>
                {showHeader && (
                  <tr className="section-hdr" key={`hdr-${r.section}-${i}`}>
                    <td className="sticky-col" colSpan={27}>{r.section || ''}</td>
                  </tr>
                )}
                <tr key={r.account} className={r.subtotal ? 'total-row' : ''}>
                  <td className="sticky-col" style={r.subtotal ? undefined : { paddingLeft: 18 }}>
                    {r.account}
                  </td>
                  {BUDGET_YEARS.map((y) => [
                    ...r.years[y].map((v, m) => <td key={`${r.account}-${y}-${m}`}>{fmt(v)}</td>),
                    <td key={`${r.account}-${y}-total`} className="year-total">{fmt(r.totals[y])}</td>,
                  ])}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
