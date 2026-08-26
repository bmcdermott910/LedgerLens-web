import { MONTH_SHORT, BUDGET_YEARS } from '@/lib/finance';
import DriverInput from './DriverInput';

// The AUM schedule that drives RIA's Management Fee and Fee Cap Expense. Shared across everyone
// and editable by an admin; entered in millions because that is how it is discussed.
export default function AumSchedule({ aum, canEdit }) {
  const byKey = {};
  aum.forEach((a) => { byKey[`${a.year}|${a.month_num}`] = Number(a.aum) || 0; });

  return (
    <div className="card">
      <h2>Assets Under Management</h2>
      <p className="small-muted">
        Drives RIA Management Fee (AUM × 1.9% ÷ 12) and Fee Cap Expense (tiered: below $75M the
        spread is 0.25%, from $75M to $95M it is 0.10%, above $95M the account is zero). Figures
        are in millions. {canEdit
          ? 'Click any month to change it — the whole budget and both runway charts recompute.'
          : 'Only an admin can change these.'}
      </p>
      <div className="table-scroll">
        <table className="aum-table">
          <thead>
            <tr><th>Year</th>{MONTH_SHORT.map((m) => <th key={m}>{m}</th>)}</tr>
          </thead>
          <tbody>
            {BUDGET_YEARS.map((year) => (
              <tr key={year}>
                <td>{year}</td>
                {MONTH_SHORT.map((m, i) => {
                  const v = byKey[`${year}|${i + 1}`] || 0;
                  return (
                    <td key={`${year}-${m}`}>
                      <DriverInput
                        payload={{ kind: 'aum', year, monthNum: i + 1 }}
                        value={v / 1e6}
                        display={`$${(v / 1e6).toFixed(0)}M`}
                        canEdit={canEdit}
                        width={62}
                        suffix="M"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
