import { BUCKET_ROWS, fmt } from '@/lib/finance';
import Var from './Var';

export default function BucketCard({ title, buckets }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr><th>Line</th><th>Actual</th><th>Budget</th><th>Fav/(Unfav)</th></tr>
        </thead>
        <tbody>
          {BUCKET_ROWS.map((r) => {
            const b = buckets[r.key];
            return (
              <tr key={r.key} className={r.bold ? 'total-row' : ''} style={r.rule ? { borderTop: '2px solid #16375e' } : undefined}>
                <td style={r.indent ? { paddingLeft: 22, color: '#556' } : undefined}>{r.label}</td>
                <td>{fmt(b.actual)}</td>
                <td>{fmt(b.budget)}</td>
                <td><Var actual={b.actual} budget={b.budget} flip={r.flip} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
