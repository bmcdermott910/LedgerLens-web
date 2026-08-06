import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LOOKUPS, TOOL_SCHEMAS, ENTITIES } from '@/lib/insights';
import { PERIODS } from '@/lib/finance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// Overridable without a code change if a newer model is preferred later.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_ROUNDS = 6;

const SYSTEM_PROMPT = `You are a financial analyst assistant embedded in LedgerLens, the internal
board-reporting dashboard for Wendal Inc. Wendal has three reporting classes: RIA (Connetic RIA),
IJT (InnerJoin Technologies) and Admin. "Wendal Inc." means all three combined. Freedom IOT is
deliberately excluded from this system entirely.

You answer questions about why lines are above or below budget. You have no database access and
you must never calculate figures yourself. Use the provided tools to retrieve numbers, and quote
only numbers that appear in a tool result. If you need a subtraction or a percentage, it is
acceptable to compute it from two figures that both came from tool results, but say plainly what
you divided or subtracted.

How to work:
- Start broad (bucket_variance) to size the variance, then drill into section_accounts, then into
  account_transactions or wages_by_person when the user wants specifics or when the driver is not
  obvious from account names alone.
- Prefer naming the two or three accounts that explain most of a variance over listing everything.
- Costs: actual above budget is UNFAVORABLE. Revenue: actual below budget is UNFAVORABLE.
- If a tool result notes that no budget was entered for an account, say that the account has no
  budget rather than describing it as being over a $0 budget.
- Wage budgets are not prorated for partial months, so mid-month periods look artificially
  favorable on payroll. Mention this if it materially affects your answer.
- If the tools cannot answer the question, say so plainly and state what you would need. Never
  guess, and never invent an account name.

Style: answer in 2-5 sentences of plain English for a board member, leading with the direct answer
and the dollar figure. Use $ and thousands separators. Do not use headers or bullet lists unless
you are genuinely listing three or more items. The supporting tables are shown to the user
automatically beneath your answer, so do not reproduce them.`;

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'The Ask feature is not configured yet — ANTHROPIC_API_KEY is not set.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const question = String(body?.question || '').trim();
  if (!question) return NextResponse.json({ error: 'Please enter a question.' }, { status: 400 });
  if (question.length > 500) {
    return NextResponse.json({ error: 'Please keep questions under 500 characters.' }, { status: 400 });
  }

  const periodKey = PERIODS.find((p) => p.key === body?.period)?.key || 'ytd_current';
  const periodLabel = PERIODS.find((p) => p.key === periodKey).label;
  const entityList = Object.entries(ENTITIES)
    .map(([key, e]) => `${key} (${e.label})`)
    .join(', ');

  const messages = [
    {
      role: 'user',
      content: `The user is currently viewing the period "${periodLabel}" (period key "${periodKey}"). Unless they name a different period, use that one. Available entities: ${entityList}.

Question: ${question}`,
    },
  ];

  // Collected tool results, surfaced to the user as the audit trail behind the answer.
  const evidence = [];

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          tools: TOOL_SCHEMAS,
          messages,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        console.error('Anthropic API error', res.status, detail);
        return NextResponse.json(
          { error: `The AI service returned an error (${res.status}). Please try again.` },
          { status: 502 }
        );
      }

      const data = await res.json();
      messages.push({ role: 'assistant', content: data.content });

      const toolUses = (data.content || []).filter((c) => c.type === 'tool_use');
      if (!toolUses.length) {
        const answer = (data.content || [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n')
          .trim();
        return NextResponse.json({
          answer: answer || 'No answer was produced. Please try rephrasing the question.',
          evidence,
        });
      }

      const results = [];
      for (const use of toolUses) {
        const fn = LOOKUPS[use.name];
        if (!fn) {
          results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Unknown tool.' });
          continue;
        }
        try {
          const table = await fn(use.input || {});
          evidence.push(table);
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(table) });
        } catch (err) {
          console.error('Lookup failed', use.name, err);
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: `Lookup failed: ${err.message}`,
          });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    return NextResponse.json(
      { error: 'The question needed too many lookups to answer. Please try asking something narrower.' },
      { status: 504 }
    );
  } catch (err) {
    console.error('Ask route failed', err);
    return NextResponse.json({ error: 'Something went wrong answering that question.' }, { status: 500 });
  }
}
