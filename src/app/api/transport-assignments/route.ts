import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/transport-assignments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   schedule_entries JOIN して日付でフィルタ
 * POST /api/transport-assignments
 *   upsert（bulk）
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');

  const supabase = await createClient();
  /* schedule_entries と JOIN して date を取得 */
  let q = supabase
    .from('transport_assignments')
    .select('*, schedule_entries!inner(date, child_id, pickup_time, dropoff_time)');
  if (from) q = q.gte('schedule_entries.date', from);
  if (to) q = q.lte('schedule_entries.date', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const assignments: Array<Record<string, unknown>> = Array.isArray(body?.assignments) ? body.assignments : [];
  if (assignments.length === 0) {
    return NextResponse.json({ error: 'assignments が空です' }, { status: 400 });
  }

  /* Phase 45 fix: uuid[] カラムに空文字が入ると Postgres が
     「invalid input syntax for type uuid: ""」で全件失敗する。
     StaffSelect で「（未選択）」を選ぶと '' が staff_ids に混じるので、サーバー側でフィルタする。 */
  const cleanUuidArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return input.filter((v): v is string => typeof v === 'string' && v.length > 0);
  };

  const rows = assignments.map((a) => ({
    tenant_id: gate.staff.tenant_id,
    schedule_entry_id: String(a.schedule_entry_id ?? ''),
    pickup_staff_ids: cleanUuidArray(a.pickup_staff_ids),
    dropoff_staff_ids: cleanUuidArray(a.dropoff_staff_ids),
    is_unassigned: Boolean(a.is_unassigned ?? false),
    is_confirmed: Boolean(a.is_confirmed ?? false),
    /* Phase 45: 手動編集ロック。「保存」呼び出しは true、再生成 (handleGenerate) は false で送る */
    is_locked: Boolean(a.is_locked ?? false),
  }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transport_assignments')
    .upsert(rows, { onConflict: 'tenant_id,schedule_entry_id' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data });
}
