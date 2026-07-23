import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile } from '@/lib/queries';
import SignOutButton from '@/components/SignOutButton';
import TabNav from '@/components/TabNav';

// Without this, Next.js can cache the profile lookup below (admin/viewer role) the first time
// this layout renders and keep serving that stale cached result on later visits, even after the
// role changes in the database and the browser is hard-refreshed. force-dynamic makes sure this
// always re-checks the database on every request.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(supabase, user.id);

  return (
    <div>
      <header>
        <div>
          <h1>LedgerLens — Board &amp; Budget Dashboard</h1>
          <div className="sub">Wendal Inc. group</div>
        </div>
        <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>
            {profile?.email} <span style={{ opacity: 0.7 }}>({profile?.role || 'viewer'})</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      <TabNav />
      <main>{children}</main>
    </div>
  );
}
