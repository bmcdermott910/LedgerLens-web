import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/forecast-override  { tabKey, account, monthlyAmount }
// Saves (upserts) a what-if override for the signed-in user on a specific entity tab/account.
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { tabKey, account, monthlyAmount } = await request.json();
  if (!tabKey || !account || monthlyAmount === undefined) {
    return NextResponse.json({ error: 'tabKey, account, and monthlyAmount are required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('forecast_overrides')
    .upsert(
      {
        user_id: user.id,
        tab_key: tabKey,
        account,
        mode: 'manual',
        monthly_amount: monthlyAmount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tab_key,account' }
    );
  if (error) {
    console.error('forecast-override upsert error:', error.message);
    return NextResponse.json({ error: 'Failed to save override' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/forecast-override  { tabKey, account }
// Resets a single account back to its calculated default by removing the saved override.
export async function DELETE(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { tabKey, account } = await request.json();
  if (!tabKey || !account) {
    return NextResponse.json({ error: 'tabKey and account are required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('forecast_overrides')
    .delete()
    .eq('user_id', user.id)
    .eq('tab_key', tabKey)
    .eq('account', account);
  if (error) {
    console.error('forecast-override delete error:', error.message);
    return NextResponse.json({ error: 'Failed to reset override' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
