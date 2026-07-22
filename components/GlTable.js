import { isFlippedRow, fmt } from '@/lib/finance';
import Var from './Var';

// Account-level actual vs. budget table. Drill-down, wage tables, and forecast columns are
// phase 2 -- this is the core GL account view only.
export default function GlTable({ rows }) {
  let lastSection = null;
  return (
    <table>
      <thead>
        <tr><th>Account</th><th>Actual</th><th>Budget</th><th>Fav/(Unfav)</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const showHeader = r.section !== lastSection && !r.subtotal;
          if (showHeader) lastSection = r.section;
          const flip = isFlippedRow(r);
          return (
            <>
              {showHeader && (
                <tr className="section-hdr" key={`hdr-${r.section}-${i}`}>
                  <td colSpan={4}>{r.section || ''}</td>
                </tr>
              )}
              <tr key={r.account} className={r.subtotal ? 'total-row' : ''}>
                <td style={r.subtotal ? undefined : { paddingLeft: 18 }}>{r.account}</td>
                <td>{fmt(r.actual)}</td>
                <td>{fmt(r.budget)}</td>
                <td><Var actual={r.actual} budget={r.budget} flip={flip} /></td>
              </tr>
            </>
          );
        })}
      </tbody>
    </table>
  );
}
