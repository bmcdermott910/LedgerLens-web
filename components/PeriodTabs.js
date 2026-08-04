import Link from 'next/link';
import { PERIODS } from '@/lib/finance';

// labelOverrides lets a page swap the text of individual period buttons without changing the
// shared PERIODS list -- used by the entity tabs to show "+ Forecast" on the period that also
// renders the forecast table. Board Summary passes nothing and gets the default labels.
export default function PeriodTabs({ current, basePath, labelOverrides = {} }) {
  return (
    <div className="period-tabs">
      {PERIODS.map((p) => (
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
