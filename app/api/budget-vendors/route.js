import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchMonths, fetchTransactions } from '@/lib/queries';
import { deriveVendor } from '@/lib/vendors';

// GET /api/budget-vendors?classes=RIA,IJT&account=Software&year=2027
//
// The vendor detail behind a budgeted year total. Accounts budgeted as "2026 annualised" are
// built from 2026 actuals through the last CLOSED month, scaled up to twelve months and then
// moved by that account's adjustment percentage -- so the same arithmetic is applied here, vendor
// by vendor. What comes back therefore adds up to the number that was clicked, which is the whole
// point: it answers "what is actually in this line" rather than showing an unrelated 2026 figure.
//
// Authorization needs no special handling: createClient() carries the signed-in session and the
// row-level security policies on transactions and budget_pct apply exactly as they do elsewhere.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const classesParam = searchParams.get('classes');
  const account = searchParams.get('account');
  const year = Number(searchParams.get('year'));

  if (!classesParam || !account || !year) {
    return NextResponse.json(
      { error: 'classes, account and year are all required query params' },
      { status: 400 }
    );
  }
  const classKeys = classesParam.split(',').filter(Boolean);

  try {
    const supabase = createClient();
    const [monthRows, pctRes] = await Promise.all([
      fetchMonths(),
      supabase.from('budget_pct').select('class_key, account, year, pct').eq('account', account),
    ]);
    if (pctRes.error) throw pctRes.error;

    // Same base as the budget engine: 2026 actuals through the last closed month. A partial
    // month is excluded so the run rate is not dragged down by half a month of invoices.
    const closed = monthRows.filter((m) => m.is_complete && m.year === 2026);
    if (!closed.length) {
      return NextResponse.json({ rows: [], closedMonths: 0, factorNote: 'No closed 2026 months' });
    }
    const annualise = 12 / closed.length;

    const pctFor = {};
    pctRes.data.forEach((p) => { pctFor[`${p.class_key}|${p.year}`] = Number(p.pct) || 0; });
    // 2027 lifts the annualised 2026 base; 2028 compounds on 2027 -- the engine's rule, repeated.
    const pctFactor = (classKey) => {
      const f27 = 1 + (pctFor[`${classKey}|2027`] || 0);
      return year === 2027 ? f27 : f27 * (1 + (pctFor[`${classKey}|2028`] || 0));
    };

    const txns = await fetchTransactions(classKeys, closed.map((m) => m.key), account);

    // Grouped by vendor. A vendor billing more than one business unit is scaled per class first,
    // because the adjustment percentage is set per class, and only then added together.
    // Two thirds of transactions carry no vendor name at all -- card and ACH feeds put the
    // merchant in the description instead. deriveVendor() recovers what it safely can and
    // returns null for the rest, which keeps sharing one honest "No vendor" bucket.
    const byVendor = new Map();
    txns.forEach((t) => {
      const named = (t.txn_name || '').trim();
      const derived = named ? null : deriveVendor(null, t.description);
      const vendor = named || derived || 'No vendor';
      const raw = Number(t.amount) || 0;
      const entry = byVendor.get(vendor)
        || { vendor, actual2026: 0, budgeted: 0, count: 0, derived: false, unnamed: false };
      entry.actual2026 += raw;
      entry.budgeted += raw * annualise * pctFactor(t.class_key);
      entry.count += 1;
      if (derived) entry.derived = true;
      if (!named && !derived) entry.unnamed = true;
      byVendor.set(vendor, entry);
    });

    const rows = [...byVendor.values()]
      .map((r) => ({
        ...r,
        actual2026: Math.round(r.actual2026 * 100) / 100,
        budgeted: Math.round(r.budgeted * 100) / 100,
      }))
      // "No vendor" is a residual, not a vendor, so it sits at the bottom whatever its size.
      .sort((a, b) => (a.unnamed - b.unnamed) || (Math.abs(b.budgeted) - Math.abs(a.budgeted)));

    const pcts = classKeys.map((c) => `${c} ${((pctFactor(c) - 1) * 100).toFixed(1)}%`).join(', ');
    return NextResponse.json({
      rows,
      closedMonths: closed.length,
      throughMonth: closed[closed.length - 1].key,
      annualise,
      pcts,
    });
  } catch (err) {
    console.error('budget-vendors error:', err.message);
    return NextResponse.json({ error: 'Failed to load vendor detail' }, { status: 500 });
  }
}
