import { NextRequest, NextResponse } from 'next/server';
import { generateShiftAssignments } from '@/lib/logic/generateShift';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { getDaysInMonth } from 'date-fns';

/**
 * POST /api/shift/generate
 * シフト半自動生成 API（サーバー側で全データを DB から取得して生成）
 *
 * body: { year, month }
 * response: { assignments[], warnings[] }
 *
 * ※ UI は現状クライアント側でロジック実行後 /api/shift-assignments に upsert。
 *   このルートは外部連携・バッチ用。
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const year = Number(body?.year);
    const month = Number(body?.month);
    if (!year || !month) {
      return NextResponse.json({ error: 'year, month は必須です' }, { status: 400 });
    }

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = getDaysInMonth(new Date(year, month - 1));
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const supabase = await createClient();
    const [sRes, rRes, eRes] = await Promise.all([
      supabase.from('staff').select('*'),
      supabase.from('shift_requests').select('*').eq('month', monthStr),
      supabase.from('schedule_entries').select('*').gte('date', from).lte('date', to),
    ]);

    const result = generateShiftAssignments({
      tenantId: gate.staff.tenant_id,
      year,
      month,
      staff: sRes.data ?? [],
      shiftRequests: rRes.data ?? [],
      scheduleEntries: eRes.data ?? [],
    });

    return NextResponse.json({
      assignments: result.assignments,
      warnings: result.warnings,
      summary: {
        totalDays: lastDay,
        totalAssignments: result.assignments.length,
        warningCount: result.warnings.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'シフト生成中にエラーが発生しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
