import { BUCKET_ROWS, fmt } from '@/lib/finance';

// One entity's income statement across the five-year columns. Same line order and same
// arithmetic as the Board Summary bucket table -- only the columns differ (years instead of
// actual/budget/variance), so the two tabs are read the same way.
//
// `columns` is [{ key, label, sublabel, buckets }]. A column whose buckets are null renders
// em dashes: that year has not been supplied yet, which is different from a year of zeros.
export default function FiveYearTable({ title, columns }) {
  return (
    <div className="card">
      <h2>{title}</h2>
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
          {BUCKET_ROWS.map((r) => (
            <tr
              key={r.key}
              className={r.bold ? 'total-row' : ''}
              style={r.rule ? { borderTop: '2px solid #16375e' } : undefined}
            >
              <td style={r.indent ? { paddingLeft: 22, color: '#556' } : undefined}>{r.label}</td>
              {columns.map((c) => (
                <td key={c.key}>{c.buckets ? fmt(c.buckets[r.key]) : '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
