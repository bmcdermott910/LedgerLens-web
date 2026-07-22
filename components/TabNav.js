'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from '@/lib/finance';

export default function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="tabs">
      {TABS.map((t) => {
        const href = t.key === '' ? '/dashboard' : `/dashboard/${t.key}`;
        const isActive = pathname === href;
        return (
          <Link key={t.key || 'board'} href={href} className={isActive ? 'active' : ''}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
