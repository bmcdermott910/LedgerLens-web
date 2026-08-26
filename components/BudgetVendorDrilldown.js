'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/finance';

// Modal shown when someone clicks a year total on an account budgeted as "2026 annualised".
// Lists the 2026 vendors behind that account with what each one is carrying in the budget year:
// their 2026 spend through the last closed month, annualised to twelve months and moved by the
// adjustment percentage. The total at the bottom is the figure that was clicked.
export default function BudgetVendorDrilldown({ account, classKeys, year, expected, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const params = new URLSearchParams({
      classes: classKeys.join(','), account, year: String(year),
    });
    fetch(`/api/budget-vendors?${params.toString()}`)
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [account, classKeys, year]);

  const rows = data?.rows || [];
  const total = rows.reduce((s, r) => s + r.budgeted, 0);
  // Rounding each vendor separately will not always land exactly on the budgeted line, which is
  // rounded once a month. Say so when it happens rather than letting it read as an error.
  const drift = expected != null ? Math.round((total - expected) * 100) / 100 : 0;

  return (
    <div className="drilldown-overlay" onClick={onClose}>
      <div className="drilldown-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drilldown-header">
          <h3>{account} — {year} vendor detail</h3>
          <button className="drilldown-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <p className="drilldown-error">Couldn&apos;t load vendor detail: {error}</p>}
        {!data && !error && <p className="small-muted">Loading vendor detail…</p>}

        {data && (
          <p className="small-muted">
            2026 actuals through {data.throughMonth} ({data.closedMonths} month
            {data.closedMonths === 1 ? '' : 's'}) annualised × {data.annualise?.toFixed(2)}, then
            adjusted {data.pcts}. Most card and ACH lines carry no vendor name, so where the
            field is blank the vendor is read out of the description and marked as such; anything
            that cannot be named honestly is pooled into No vendor at the bottom.
          </p>
        )}

        {data && rows.length === 0 && (
          <p className="small-muted">
            No 2026 transaction detail sits behind this account, so there is nothing to annualise.
          </p>
        )}

        {rows.length > 0 && (
          <table className="drilldown-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Txns</th>
                <th>2026 to date</th>
                <th>{year} budgeted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vendor}>
                  <td style={{ textAlign: 'left' }}>
                    {r.vendor}
                    {r.derived && (
                      <span className="small-muted" title="Read out of the transaction description — the vendor field was blank"> ·  from description</span>
                    )}
                  </td>
                  <td>{r.count}</td>
                  <td>{fmt(r.actual2026)}</td>
                  <td>{fmt(r.budgeted)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td style={{ textAlign: 'left' }}>
                  Total ({rows.length} vendor{rows.length === 1 ? '' : 's'})
                </td>
                <td />
                <td>{fmt(rows.reduce((s, r) => s + r.actual2026, 0))}</td>
                <td>{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {rows.length > 0 && Math.abs(drift) >= 0.01 && (
          <p className="small-muted">
            {fmt(drift)} of rounding difference against the {fmt(expected)} on the budget line —
            each vendor is rounded here, the budget rounds once a month.
          </p>
        )}
      </div>
    </div>
  );
}
