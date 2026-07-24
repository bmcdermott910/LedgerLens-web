'use client';
 
import { useState } from 'react';
import { isFlippedRow, fmt } from '@/lib/finance';
import Var from './Var';
import TransactionDrilldown from './TransactionDrilldown';
 
// Account-level actual vs. budget table. Leaf (non-subtotal) rows are clickable and open a
// drill-down modal showing the underlying transactions for that account across whichever
// classes/months are currently selected (passed down from the dashboard page).
export default function GlTable({ rows, classKeys, monthKeys }) {
  const [selectedAccount, setSelectedAccount] = useState(null);
  let lastSection = null;
 
  return (
    <>
      <table>
        <thead>
          <tr><th>Account</th><th>Actual</th><th>Budget</th><th>Fav/(Unfav)</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const showHeader = r.section !== lastSection && !r.subtotal;
            if (showHeader) lastSection = r.section;
            const flip = isFlippedRow(r);
            const clickable = !r.subtotal;
            return (
              <>
                {showHeader && (
                  <tr className="section-hdr" key={`hdr-${r.section}-${i}`}>
                    <td colSpan={4}>{r.section || ''}</td>
                  </tr>
                )}
                <tr
                  key={r.account}
                  className={r.subtotal ? 'total-row' : clickable ? 'clickable-row' : ''}
                  onClick={clickable ? () => setSelectedAccount(r.account) : undefined}
                >
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
 
      {selectedAccount && (
        <TransactionDrilldown
          account={selectedAccount}
          classKeys={classKeys}
          monthKeys={monthKeys}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </>
  );
}
 
