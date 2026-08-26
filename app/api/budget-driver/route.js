import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Budget drivers are SHARED -- one plan of record everyone sees, unlike the forecast what-ifs
// which are private per person. Writes are therefore limited to admins. The database enforces
// that too (the "admin write" RLS policy calls is_admin()); this check is here so a non-admin
// gets a clear 403 instead of a silent no-op.
const KINDS = {
  pct: { table: 'budget_pct', conflict: 'class_key,account,year' },
  aum: { table: 'budget_aum', conflict: 'year,month_num' },
  setting: { table: 'budget_settings', conflict: 'key,year' },
};

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad('Not signed in', 401);

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return bad('Only an admin can change the budget drivers', 403);

  let body;
  try { body = await request.json(); } catch { return bad('Invalid JSON'); }
  const { kind } = body || {};
  const spec = KINDS[kind];
  if (!spec) return bad('Unknown driver kind');

  const num = Number(body.value);
  if (!Number.isFinite(num)) return bad('Value must be a number');

  let row;
  if (kind === 'pct') {
    if (!body.classKey || !body.account || !body.year) return bad('Missing classKey, account or year');
    // A percentage, entered as a percent and stored as a fraction. Bounded so a stray keystroke
    // cannot multiply the budget by a thousand.
    if (num < -100 || num > 1000) return bad('Percentage must be between -100 and 1000');
    row = { class_key: body.classKey, account: body.account, year: Number(body.year), pct: num / 100 };
  } else if (kind === 'aum') {
    if (!body.year || !body.monthNum) return bad('Missing year or monthNum');
    if (num < 0) return bad('AUM cannot be negative');
    row = { year: Number(body.year), month_num: Number(body.monthNum), aum: num };
  } else {
    if (!body.key || !body.year) return bad('Missing key or year');
    if (num < -100 || num > 100) return bad('Percentage must be between -100 and 100');
    row = { key: body.key, year: Number(body.year), value: num / 100 };
  }

  const { error } = await supabase.from(spec.table).upsert(row, { onConflict: spec.conflict });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
