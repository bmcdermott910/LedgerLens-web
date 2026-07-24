import { createClient } from './supabase/server';

// Fetches the raw GL line items (leaf + subtotal rows) for a set of classes/months.
// Paginates past Supabase's default 1000-row cap since a full YTD x multi-class query
// can exceed that.
export async function fetchGlRows(classKeys, monthKeys) {
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
}

// Fetches the underlying transaction-level detail for a single GL account across a set of
// classes/months -- powers the drill-down modal when someone clicks a number in GlTable.
// Same pagination approach as fetchGlRows, since a full-year x multi-class account can exceed
// Supabase's 1000-row default cap.
export async function fetchTransactions(classKeys, monthKeys, account) {
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
