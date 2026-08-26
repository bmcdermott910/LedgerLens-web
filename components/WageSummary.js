import { BUDGET_YEARS, fmt } from '@/lib/finance';
import DriverInput from './DriverInput';

// The employee schedule under the budget table: everyone whose pay hits the displayed business
// unit, their annual cost in each budget year, split Operating vs SG&A. These figures add up to
// the Operating Wages and SG&A Wages lines in the table above, to the penny.
export default function WageSummary({ people, payIncrease, canEdit, restrictedTo }) {
  // Someone whose wage access covers only part of the displayed entity sees only their own
  // people, so this schedule will not add up to the wage lines above it. Say so rather than
  // leaving them to wonder whether the numbers are wrong.
  if (!people.length) {
    return (
      <div className="card">
        <h2>Budgeted Wages by Employee</h2>
        <p className="small-muted">
          Per-person wages are restricted. The wage totals in the table above are unaffected.
        </p>
      </div>
    );
  }
  const totalFor = (year, key) => people.reduce((s, p) => s + p.years[year][key], 0);

  return (
    <div className="card">
      <h2>Budgeted Wages by Employee</h2>
      <p className="small-muted">
        Monthly pay is the 31 July plus 15 August 2026 payroll journal entries — one month at the
        current run rate. Pay increases take effect 1 March, so January and February each year
        still run at the prior rate.
      </p>
      <p className="small-muted">
        Pay increase:{' '}
        {BUDGET_YEARS.map((y) => (
          <span key={y} style={{ marginRight: 14 }}>
            {y}{' '}
            <DriverInput
              payload={{ kind: 'setting', key: 'pay_increase_pct', year: y }}
              value={((payIncrease[y] || 0) * 100).toFixed(1)}
              display={`${((payIncrease[y] || 0) * 100).toFixed(1)}%`}
              canEdit={canEdit}
              width={58}
              suffix="%"
            />
          </span>
        ))}
      </p>
      {restrictedTo && (
        <p className="stale-warning">
          You can see per-person wages for {restrictedTo} only, so this schedule covers those
          people alone and will not add up to the wage lines in the table above.
        </p>
      )}
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
