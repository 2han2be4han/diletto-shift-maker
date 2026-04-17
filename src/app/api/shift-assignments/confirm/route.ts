import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { getDaysInMonth } from 'date-fns';

/**
 * POST /api/shift-assignments/confirm
 *   body: { year, month, confirmed?: boolean }  // confirmed 省略時は true（従来挙動）
 *   指定月の shift_assignments の is_confirmed を切り替える。
 *   Phase 26: 確定済のシフトを編集可能に戻す「確定解除」用に confirmed:false を追加。
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const year = Number(body?.year);
  const month = Number(body?.month);
  const confirmed = typeof body?.confirmed === 'boolean' ? body.confirmed : true;
  if (!year || !month) {
    return NextResponse.json({ error: 'year, month は必須です' }, { status: 400 });
  }

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = getDaysInMonth(new Date(year, month - 1));
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from('shift_assignments')
    .update({ is_confirmed: confirmed })
    .gte('date', from)
    .lte('date', to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, confirmed });
}
