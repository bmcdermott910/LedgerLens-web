import { fmt } from '@/lib/finance';

// The six largest budget variances for one entity, rendered as bullets beneath its
// Actual vs. Budget table on the Board Presentation tab.
//
// Renders nothing when no drivers are passed, which is what keeps this off every other tab --
// only the Board page computes and supplies them.
export default function KeyDrivers({ drivers }) {
  if (!drivers || drivers.length === 0) return null;

  return (
    <div className="key-drivers">
      <h3>Key Drivers</h3>
      <ul>
        {drivers.map((d) => (
          <li key={d.account}>
            <span className="kd-account">{d.account}:</span> Actual {fmt(d.actual)} vs. Budget{' '}
            {fmt(d.budget)} —{' '}
            <span className={d.isFav ? 'fav' : 'unfav'}>
              {fmt(d.variance)} {d.isFav ? 'favorable' : 'unfavorable'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
