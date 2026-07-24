'use client';
 
import { useEffect, useState } from 'react';
import { fmt } from '@/lib/finance';
 
// Modal shown when someone clicks an account row in GlTable. Fetches the raw transaction
// detail behind that account for the currently-selected classes/months and lists it out,
// with a total at the bottom so it's easy to eyeball against the number they clicked.
export default function TransactionDrilldown({ account, classKeys, monthKeys, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
 
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
 
    const params = new URLSearchParams({
      classes: classKeys.join(','),
      months: monthKeys.join(','),
      account,
    });
 
    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setRows(data.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
 
    return () => {
      cancelled = true;
    };
  }, [account, classKeys, monthKeys]);
 
  const total = rows ? rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) : null;
 
  return (
    <div className="drilldown-overlay" onClick={onClose}>
      <div className="drilldown-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drilldown-header">
          <h3>{account}</h3>
          <button className="drilldown-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
 
        {error && <p className="drilldown-error">Couldn&apos;t load transactions: {error}</p>}
 
        {!rows && !error && <p className="small-muted">Loading transactions…</p>}
 
        {rows && rows.length === 0 && (
          <p className="small-muted">
            No transaction detail found for this account in the selected period yet.
          </p>
        )}
 
        {rows && rows.length > 0 && (
          <>
            <table className="drilldown-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Num</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Class</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{r.txn_date}</td>
                    <td style={{ textAlign: 'left' }}>{r.txn_type || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{r.txn_num || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{r.txn_name || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{r.description || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{r.class_key}</td>
                    <td>{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={6} style={{ textAlign: 'left' }}>
                    Total ({rows.length} transaction{rows.length === 1 ? '' : 's'})
                  </td>
                  <td>{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
 
