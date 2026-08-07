import Link from 'next/link';

// The period list is derived per request from the `months` table (see lib/periods.js) and passed
// in, rather than imported from a fixed constant -- that is what lets a new month roll the
// buttons forward on its own. labelOverrides swaps individual button texts without touching the
// shared list; the entity tabs use it to append "+ Forecast" to whichever period carries the
// forecast table. Board Summary passes nothing and gets the plain labels.
export default function PeriodTabs({ periods, current, basePath, labelOverrides = {} }) {
  return (
    <div className="period-tabs">
      {periods.map((p) => (
        <Link
          key={p.key}
          href={`${basePath}?period=${p.key}`}
          className={p.key === current ? 'active' : ''}
        >
          {labelOverrides[p.key] ?? p.label}
        </Link>
      ))}
    </div>
  );
}
