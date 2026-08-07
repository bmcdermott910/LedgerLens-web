import { createClient } from './supabase/server';

// Supabase calls occasionally fail transiently -- most commonly a 401 when a server component
// fires while the auth cookies are still rotating, right after a magic-link sign-in. Those
// resolve on their own within a few hundred milliseconds, but an unhandled throw here takes the
// whole page down with a Next.js crash screen. Retry briefly before giving up.
async function withRetry(label, run, { attempts = 3 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            return await run();
          } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                  // 150ms, then 300ms -- long enough for a cookie rotation to settle, short
                  // enough that a genuinely broken query still fails fast.
                  await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
            }
          }
    }
    console.error(`[queries] ${label} failed after ${attempts} attempts:`, lastError?.message || lastError);
    throw lastError;
}

// Fetches the raw GL line items (leaf + subtotal rows) for a set of classes/months.
// Paginates past Supabase's default 1000-row cap since a full YTD x multi-class query
// can exceed that.
export async function fetchGlRows(classKeys, monthKeys) {
    return withRetry('fetchGlRows', async () => {
          const supabase = createClient();
          const pageSize = 1000;
          let from = 0;
          let all = [];
          while (true) {
            const { data, error } = await supabase
                  .from('gl_line_items')
                  .select('class_key, month_key, account, section, is_subtotal, is_wage, actual, budget')
                  .in('class_key', classKeys)
                  .in('month_key', monthKeys)
                  .range(from, from + pageSize - 1);
            if (error) throw error;
            all = all.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          return all;
    });
}

// Fetches the underlying transaction-level detail for a single GL account across a set of
// classes/months -- powers the drill-down modal when someone clicks a number in GlTable.
// Same pagination approach as fetchGlRows, since a full-year x multi-class account can exceed
// Supabase's 1000-row default cap.
export async function fetchTransactions(classKeys, monthKeys, account) {
    return withRetry('fetchTransactions', async () => {
          const supabase = createClient();
          const pageSize = 1000;
          let from = 0;
          let all = [];
          while (true) {
            const { data, error } = await supabase
                  .from('transactions')
                  .select('class_key, month_key, txn_date, txn_type, txn_num, txn_name, description, amount')
                  .in('class_key', classKeys)
                  .in('month_key', monthKeys)
                  .eq('account', account)
                  .order('txn_date', { ascending: true })
                  .range(from, from + pageSize - 1);
            if (error) throw error;
            all = all.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          return all;
    });
}

// Fetches per-person actual wages for a set of classes/months, summed across whichever
// months are in the selected period (e.g. all 7 months for YTD, just one for MTD).
//
// Returns [] rather than throwing when the read is refused: wages_monthly is gated by the
// `wage viewers read` RLS policy, so a viewer without can_view_wages legitimately sees nothing
// here. That is a restricted view, not a failure, and it must not break the rest of the page.
export async function fetchWagesByPerson(classKeys, monthKeys) {
    return withRetry('fetchWagesByPerson', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('wages_monthly')
            .select('class_key, month_key, first_name, last_name, amount')
            .in('class_key', classKeys)
            .in('month_key', monthKeys);
          if (error) throw error;
          return data;
    }).catch(() => []);
}

// Fetches the employee budget roster (annual salary + class allocation weights) needed to
// compute each person's budgeted wage for a given class/period.
export async function fetchEmployeeBudgets() {
    return withRetry('fetchEmployeeBudgets', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('employee_budget')
            .select('first_name, last_name, salary_2026, weight_admin, weight_ijt, weight_ria');
          if (error) throw error;
          return data;
    });
}

// Fetches the baseline forecast (already computed per the "How to Forecast" rules --
// avg3/zero/wage_base/pct_of) for a set of classes. One row per class/account, with a flat
// monthly rate applied across all forecast months, a full-year forecast total, and the
// annual budget to compare against.
export async function fetchForecastRows(classKeys) {
    return withRetry('fetchForecastRows', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('forecast_rows')
            .select('class_key, account, section, is_subtotal, is_wage, monthly_forecast, forecast_total, annual_budget')
            .in('class_key', classKeys);
          if (error) throw error;
          return data;
    });
}

// Fetches the forecast rules (account -> rule_type + base_account) that determine how each
// account's baseline forecast was derived -- needed to cascade a what-if override through any
// account whose forecast is a percentage of another account (e.g. payroll taxes as % of wages).
export async function fetchForecastRules() {
    return withRetry('fetchForecastRules', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('forecast_rules')
            .select('account, rule_type, base_account');
          if (error) throw error;
          return data;
    });
}

// Fetches this user's saved what-if overrides for a given entity tab.
export async function fetchForecastOverrides(supabase, userId, tabKey) {
    return withRetry('fetchForecastOverrides', async () => {
          const { data, error } = await supabase
            .from('forecast_overrides')
            .select('account, monthly_amount')
            .eq('user_id', userId)
            .eq('tab_key', tabKey);
          if (error) throw error;
          return data;
    }).catch(() => []);
}

export async function fetchProfile(supabase, userId) {
    const { data, error } = await supabase.from('profiles').select('email, role').eq('id', userId).single();
    if (error) {
          // surface this in Vercel's logs instead of silently defaulting the UI to "viewer"
      console.error('fetchProfile error:', error.message);
          return null;
    }
    return data;
}

// Fetches the monthly cash / runway metrics that back the Board Summary charts. These come from
// the finance team's CHARTS workbook rather than the GL, so they live in their own small table
// and are loaded a month at a time. Ordered oldest-first so charts can plot straight through.
export async function fetchCashMetrics() {
    return withRetry('fetchCashMetrics', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('cash_metrics')
            .select('month_end, month_label, total_cash, doomsday_years')
            .order('month_end', { ascending: true });
          if (error) throw error;
          return data;
    }).catch(() => []);
}

// The calendar metadata that drives every period label and the trend/forecast ranges.
// Adding a row here (via the monthly import) is what rolls the whole dashboard forward.
//
// This one stays fatal on failure: every period, label and tab is derived from it, so an empty
// months list would render a convincingly wrong dashboard rather than an obviously broken one.
export async function fetchMonths() {
    return withRetry('fetchMonths', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('months')
            .select('key, sort_order, year, period_end, is_complete')
            .order('sort_order', { ascending: true });
          if (error) throw error;
          return data;
    });
}

// Describes what the precomputed forecast_rows baseline was actually generated from, so the app
// uses the right month count and can tell the user when the forecast has gone stale.
//
// Degrades to null rather than throwing -- buildPeriodModel() already handles a missing meta by
// deriving the forecast month count from the complete-month count. Losing the "forecast is
// stale" banner is a far better outcome than losing the entire dashboard.
export async function fetchForecastMeta() {
    return withRetry('fetchForecastMeta', async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('forecast_meta')
            .select('base_through_month, base_through_year, forecast_month_count')
            .eq('id', 1)
            .maybeSingle();
          if (error) throw error;
          return data;
    }).catch(() => null);
}
