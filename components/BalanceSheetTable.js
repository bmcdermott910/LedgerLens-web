'use client';

import { Fragment, useState } from 'react';
import { BS_ROWS, fmtK } from '@/lib/finance';

// The board presentation, one column per as-of date, oldest on the left. Clicking a line that
// has account detail expands the GL accounts behind it -- the same "show me what's in this
// number" behaviour as the drill-downs on the entity tabs, but inline rather than in a modal,
// because a balance sheet line is a handful of accounts rather than hundreds of transactions.
//
// `columns` is [{ key, label, sublabel }]; `values` and `detail` come from buildBalanceSheet().
export default function BalanceSheetTable({ columns, values, detail }) {
  const [open, setOpen] = useState({});
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div className="card">
      <h2>Wendal Inc. (RIA + IJT + Admin) — Balance Sheet</h2>
      <table>
        <thead>
          <tr>
            <th>Line</th>
            {columns.map((c) => (
              <th key={c.key}>
                {c.label}
                <div className="yr-sub">{c.sublabel}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BS_ROWS.map((r) => {
            if (r.header) {
              return (
                <tr key={r.key} className="bs-section">
                  <td colSpan={columns.length + 1}>{r.label}</td>
                </tr>
              );
            }
            const accounts = detail[r.key] || [];
            const expandable = accounts.length > 0;
            const isOpen = !!open[r.key];
            return (
              <Fragment key={r.key}>
                <tr
                  className={r.bold ? 'total-row' : ''}
                  style={r.rule ? { borderTop: '2px solid #16375e' } : undefined}
                >
                  <td style={r.indent ? { paddingLeft: 22 } : undefined}>
                    {expandable ? (
                      <button
                        type="button"
                        className="bs-expand"
                        onClick={() => toggle(r.key)}
                        aria-expanded={isOpen}
                      >
                        <span className="bs-caret">{isOpen ? '▾' : '▸'}</span>
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                  </td>
                  {columns.map((c) => (
                    <td key={c.key}>{fmtK(values[r.key]?.[c.key])}</td>
                  ))}
                </tr>
                {isOpen
                  && accounts.map((a) => (
                    <tr key={`${r.key}-${a.account}`} className="bs-detail">
                      <td style={{ paddingLeft: 44 }}>{a.account}</td>
                      {columns.map((c) => (
                        <td key={c.key}>{fmtK(a.amounts[c.key])}</td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="small-muted" style={{ marginTop: 10 }}>
        Figures are rounded to the nearest $1,000, each line from its own exact balance — so a
        subtotal can read $1,000 away from the lines above it, the same as the BOD workbook.
        Click any line with a caret to see the GL accounts behind it; accounts that are zero in
        every column shown are omitted.
      </p>
    </div>
  );
}
