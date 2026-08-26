'use client';

import { useState } from 'react';
import { BUDGET_YEARS, MONTH_SHORT, fmt } from '@/lib/finance';
import DriverInput from './DriverInput';
import BudgetVendorDrilldown from './BudgetVendorDrilldown';

// Detailed monthly P&L for the budget years: every account of the Forecast tab, twelve monthly
// columns per year, each year closing with its own total. Twenty-seven columns is wider than the
// page, so the whole table scrolls sideways inside its card and the account column is pinned so
// you never lose your place while scrolling.
//
// Year totals on "2026 annualised" accounts are clickable: they open the 2026 vendor detail
// behind the line, annualised and adjusted the same way the budget figure was built.
export default function BudgetTable({ rows, classKey, classKeys, pctByKey, canEdit }) {
  const [drill, setDrill] = useState(null);
  let lastSection = null;

  return (
    <div className="table-scroll">
      <table className="budget-table">
        <thead>
          <tr>
            <th className="sticky-col" rowSpan={2}>Account</th>
            <th className="method-col" rowSpan={2}>Budget Method</th>
            {BUDGET_YEARS.map((y) => (
              <th key={`pct-${y}`} className="pct-col" rowSpan={2}>{y} adj %</th>
            ))}
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
            const hasVendors = r.method === 'annualized_2026';
            return (
              <>
                {showHeader && (
                  <tr className="section-hdr" key={`hdr-${r.section}-${i}`}>
                    <td className="sticky-col" colSpan={30}>{r.section || ''}</td>
                  </tr>
                )}
                <tr key={r.account} className={r.subtotal ? 'total-row' : ''}>
                  <td className="sticky-col" style={r.subtotal ? undefined : { paddingLeft: 18 }}>
                    {r.account}
                  </td>
                  <td className="method-col small-muted">{r.methodLabel}</td>
                  {BUDGET_YEARS.map((y) => (
                    <td key={`${r.account}-pct-${y}`} className="pct-col">
                      {hasVendors && classKey ? (
                        <DriverInput
                          payload={{ kind: 'pct', classKey, account: r.account, year: y }}
                          value={((pctByKey[`${r.account}|${y}`] || 0) * 100).toFixed(1)}
                          display={`${((pctByKey[`${r.account}|${y}`] || 0) * 100).toFixed(1)}%`}
                          canEdit={canEdit}
                          width={58}
                          suffix="%"
                        />
                      ) : ''}
                    </td>
                  ))}
                  {BUDGET_YEARS.map((y) => [
                    ...r.years[y].map((v, m) => <td key={`${r.account}-${y}-${m}`}>{fmt(v)}</td>),
                    <td
                      key={`${r.account}-${y}-total`}
                      className={hasVendors ? 'year-total clickable-cell' : 'year-total'}
                      title={hasVendors ? 'Click to see the 2026 vendor detail behind this line' : undefined}
                      onClick={hasVendors
                        ? () => setDrill({ account: r.account, year: y, expected: r.totals[y] })
                        : undefined}
                    >
                      {fmt(r.totals[y])}
                    </td>,
                  ])}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>

      {drill && (
        <BudgetVendorDrilldown
          account={drill.account}
          year={drill.year}
          expected={drill.expected}
          classKeys={classKeys}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
