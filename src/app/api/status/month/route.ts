import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/status/month?month=YYYY-MM
 *
 * 指定月の 利用予定 / シフト表 / 送迎表 / 休み希望 の完成状態を返す。
 * - empty: データ無し
 * - incomplete: データあり、ただし未割当/未確定/未提出あり
 * - complete: すべて揃っている
 *
 * サイドバーのインジケータとダッシュボード/ヘッダーのバッジで共通利用する軽量エンドポイント。
 */

type Status = 'empty' | 'incomplete' | 'complete';

function monthBounds(ym: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, '0')}`,
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const month = request.nextUrl.searchParams.get('month');
  const bounds = month ? monthBounds(month) : null;
  if (!bounds) {
    return NextResponse.json({ error: '?month=YYYY-MM が必要です' }, { status: 400 });
  }

  const supabase = await createClient();

  /* schedule_entries の id を取得（送迎 JOIN 用） */
  const { data: entries, error: eErr } = await supabase
    .from('schedule_entries')
    .select('id, date')
    .gte('date', bounds.from)
    .lte('date', bounds.to);
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const entryIds = (entries ?? []).map((e) => e.id);

  /* transport_assignments 取得（schedule_entries id で絞り込み） */
  let transport: Status = 'empty';
  if (entryIds.length > 0) {
    const { data: tRows, error: tErr } = await supabase
      .from('transport_assignments')
      .select('is_confirmed, is_unassigned')
      .in('schedule_entry_id', entryIds);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    const list = tRows ?? [];
    if (list.length === 0) {
      transport = 'empty';
    } else {
      const allConfirmed = list.every((r) => r.is_confirmed === true);
      const anyUnassigned = list.some((r) => r.is_unassigned === true);
      transport = allConfirmed && !anyUnassigned ? 'complete' : 'incomplete';
    }
  }

  /* shift_assignments 取得 */
  const { data: sRows, error: sErr } = await supabase
    .from('shift_assignments')
    .select('is_confirmed')
    .gte('date', bounds.from)
    .lte('date', bounds.to);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  const sList = sRows ?? [];
  let shift: Status = 'empty';
  if (sList.length > 0) {
    shift = sList.every((r) => r.is_confirmed === true) ? 'complete' : 'incomplete';
  }

  /* 利用予定: 月内に schedule_entries が 1 件でもあれば complete 扱い（「入力済み」の意味） */
  const schedule: Status = entryIds.length > 0 ? 'complete' : 'empty';

  /* 休み希望: active staff 数 vs 当月に shift_requests を出した staff 数 */
  let requestStatus: Status = 'empty';
  const { data: activeStaff, error: stErr } = await supabase
    .from('staff')
    .select('id')
    .eq('is_active', true);
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  const totalStaff = (activeStaff ?? []).length;
  if (totalStaff > 0) {
    const { data: reqRows, error: rErr } = await supabase
      .from('shift_requests')
      .select('staff_id')
      .eq('month', month);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    const submittedSet = new Set((reqRows ?? []).map((r) => r.staff_id));
    requestStatus = submittedSet.size >= totalStaff ? 'complete' : 'incomplete';
  }

  return NextResponse.json({ month, transport, shift, schedule, request: requestStatus });
}
