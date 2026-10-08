'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmt, fmtVar, isFlippedRow, visibleStatementRows } from '@/lib/finance';

// Each leaf row: click the monthly forecast to switch between the calculated default and a
// custom monthly dollar amount. Overrides save per-user, per-entity-tab and cascade through any
// account whose forecast is a % of this one (handled server-side before this component ever
// sees the data -- see buildForecastRows).
function ForecastCell({ row, tabKey, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(Math.round(row.monthlyForecast));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch('/api/forecast-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabKey, account: row.account, monthlyAmount: Number(value) }),
    });
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  async function resetToDefault() {
    setSaving(true);
    await fetch('/api/forecast-override', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabKey, account: row.account }),
    });
    setSaving(false);
    onSaved();
  }

  if (row.subtotal) return <td>{fmt(row.monthlyForecast)}</td>;

  if (editing) {
    return (
      <td>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ width: 90, fontSize: 12 }}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} style={{ marginLeft: 4, fontSize: 11 }}>
          Save
        </button>
      </td>
    );
  }

  return (
    <td>
      <span
        className={row.isOverridden ? 'forecast-overridden' : 'forecast-cell'}
        onClick={() => setEditing(true)}
        title={row.isOverridden ? 'Custom value -- click to change' : 'Default -- click to override'}
      >
        {fmt(row.monthlyForecast)}
      </span>
      {row.isOverridden && (
        <button onClick={resetToDefault} disabled={saving} className="forecast-reset" title="Reset to default">
          ×
        </button>
      )}
    </td>
  );
}

export default function ForecastTable({ rows, tabKey }) {
  const router = useRouter();
  let lastSection = null;
  // The forecast table prints every account it has a forecast for, including ones the GL table
  // drops for having no activity this period, so nothing is treated as empty here. The
  // single-line-total rule still applies.
  const visibleRows = visibleStatementRows(rows, () => false);

  return (
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Default Forecast Method</th>
          <th>Monthly Forecast</th>
          <th>2026 Forecast</th>
          <th>2026 Budget</th>
          <th>Fav/(Unfav)</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map((r, i) => {
          const showHeader = r.section !== lastSection && !r.subtotal;
          if (showHeader) lastSection = r.section;
          const flip = isFlippedRow(r);
          const varr = fmtVar(r.forecastTotal, r.annualBudget, flip);
          return (
            <>
              {showHeader && (
                <tr className="section-hdr" key={`hdr-${r.section}-${i}`}>
                  <td colSpan={6}>{r.section || ''}</td>
                </tr>
              )}
              <tr key={r.account} className={r.subtotal ? 'total-row' : ''}>
                <td style={{ paddingLeft: 18 * (r.depth ?? (r.subtotal ? 0 : 1)) }}>{r.account}</td>
                <td style={{ textAlign: 'left' }} className="small-muted">{r.method}</td>
                <ForecastCell row={r} tabKey={tabKey} onSaved={() => router.refresh()} />
                <td>{fmt(r.forecastTotal)}</td>
                <td>{fmt(r.annualBudget)}</td>
                <td><span className={varr.isFav ? 'fav' : 'unfav'}>{varr.text}</span></td>
              </tr>
            </>
          );
        })}
      </tbody>
    </table>
  );
}
