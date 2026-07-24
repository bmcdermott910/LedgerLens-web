
import { NextResponse } from 'next/server';
import { fetchTransactions } from '@/lib/queries';
 
// GET /api/transactions?classes=Admin,RIA&months=January,February&account=Operating%20Wages
// Returns the raw transaction rows behind a single GL account for the drill-down modal.
// Auth/authorization is enforced the same way as every other data fetch in this app --
// createClient() (used inside fetchTransactions) reads the session cookie and Supabase's
// row-level security policies apply, so this route can't be used to see data the signed-in
// user isn't already allowed to see via the dashboard pages.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const classesParam = searchParams.get('classes');
  const monthsParam = searchParams.get('months');
  const account = searchParams.get('account');
 
  if (!classesParam || !monthsParam || !account) {
    return NextResponse.json(
      { error: 'classes, months, and account are all required query params' },
      { status: 400 }
    );
  }
 
  const classKeys = classesParam.split(',').filter(Boolean);
  const monthKeys = monthsParam.split(',').filter(Boolean);
 
  try {
    const rows = await fetchTransactions(classKeys, monthKeys, account);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error('fetchTransactions error:', err.message);
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
  }
}
 
