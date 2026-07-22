import Link from 'next/link';
import { PERIODS } from '@/lib/finance';

export default function PeriodTabs({ current, basePath }) {
  return (
    <div className="period-tabs">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`${basePath}?period=${p.key}`}
          className={p.key === current ? 'active' : ''}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
