import { fmt } from '@/lib/finance';
import Var from './Var';

// Simple server-rendered table: person, actual, budget, variance. No drill-down needed here
// since wages_monthly is already at person-level detail (unlike GlTable's account rows, which
// roll up many transactions).
export default function WageTable({ people }) {
  if (!people.length) {
    return <p className="small-muted">No wage data for this period yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr><th>Person</th><th>Actual</th><th>Budget</th><th>Fav/(Unfav)</th></tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.name}>
            <td style={{ textAlign: 'left' }}>{p.name}</td>
            <td>{fmt(p.actual)}</td>
            <td>{fmt(p.budget)}</td>
            <td><Var actual={p.actual} budget={p.budget} flip={true} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
