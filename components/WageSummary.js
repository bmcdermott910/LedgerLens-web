import { BUDGET_YEARS, fmt } from '@/lib/finance';

// The employee schedule under the budget table: everyone whose pay hits the displayed business
// unit, their annual cost in each budget year, split Operating vs SG&A. These figures add up to
// the Operating Wages and SG&A Wages lines in the table above, to the penny.
export default function WageSummary({ people, payIncrease }) {
  if (!people.length) return null;
  const totalFor = (year, key) => people.reduce((s, p) => s + p.years[year][key], 0);

  return (
    <div className="card">
      <h2>Budgeted Wages by Employee</h2>
      <p className="small-muted">
        Monthly pay is the 31 July plus 15 August 2026 payroll journal entries — one month at the
        current run rate. Pay increases of{' '}
        {BUDGET_YEARS.map((y) => `${((payIncrease[y] || 0) * 100).toFixed(1)}% in ${y}`).join(' and ')}{' '}
        take effect 1 March, so January and February each year still run at the prior rate.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>Employee</th>
              <th rowSpan={2}>Monthly now</th>
              {BUDGET_YEARS.map((y) => <th key={y} colSpan={3} className="year-band">{y}</th>)}
            </tr>
            <tr>
              {BUDGET_YEARS.map((y) => [
                <th key={`${y}-o`}>Operating</th>,
                <th key={`${y}-s`}>SG&amp;A</th>,
                <th key={`${y}-t`} className="year-total">Total</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{fmt(p.operatingMonthly + p.sgaMonthly)}</td>
                {BUDGET_YEARS.map((y) => [
                  <td key={`${p.name}-${y}-o`}>{fmt(p.years[y].operating)}</td>,
                  <td key={`${p.name}-${y}-s`}>{fmt(p.years[y].sga)}</td>,
                  <td key={`${p.name}-${y}-t`} className="year-total">{fmt(p.years[y].total)}</td>,
                ])}
              </tr>
            ))}
            <tr className="total-row">
              <td>Total</td>
              <td>{fmt(people.reduce((s, p) => s + p.operatingMonthly + p.sgaMonthly, 0))}</td>
              {BUDGET_YEARS.map((y) => [
                <td key={`t-${y}-o`}>{fmt(totalFor(y, 'operating'))}</td>,
                <td key={`t-${y}-s`}>{fmt(totalFor(y, 'sga'))}</td>,
                <td key={`t-${y}-t`} className="year-total">{fmt(totalFor(y, 'total'))}</td>,
              ])}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
