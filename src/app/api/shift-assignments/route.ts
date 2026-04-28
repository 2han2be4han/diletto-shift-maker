import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/shift-assignments?from=YYYY-MM-DD&to=YYYY-MM-DD
 * POST /api/shift-assignments
 *   既定: upsert（bulk、onConflict: tenant_id,staff_id,date,segment_order）
 *   mode='replaceForDay': (staff_id, date) の全セグメントを置換。
 *     segment_order はサーバ側で 0..N に再採番する（クライアント計算ロジックの分散を排除）。
 *     ゴミセグメント (off + normal の同居など) も自動クリーンアップされる。
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');

  const supabase = await createClient();

  /* Phase 60: select('*') 廃止。dto=transport 時は軽量化。
     Phase 61-fix: dto=transport でも segment_order / note / is_confirmed を必ず含める。
     送迎表の「シフト追加」で nextSegmentOrder を正しく算出するために必要。
     （bdbecda で segment_order 欠落 → 2 回目以降の追加が既存セグメントを上書きする退行が発生していた） */
  const dto = request.nextUrl.searchParams.get('dto');
  const cols = dto === 'transport'
    ? 'id, staff_id, date, start_time, end_time, assignment_type, segment_order, note, is_confirmed'
    : 'id, tenant_id, staff_id, date, start_time, end_time, assignment_type, is_confirmed, created_at, segment_order, note';

  let q = supabase.from('shift_assignments').select(cols).order('date');
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const supabase = await createClient();

  /* Phase 65: replaceForDay モード。
     (staff_id, date) の既存全セグメントを削除して、受信した segments を
     segment_order = 0..N で再採番して INSERT する。
     これにより segment_order の計算ロジックがサーバ側に一元化され、
     ゴミセグメント (off + normal 同居) も自動クリーンアップされる。 */
  if (body?.mode === 'replaceForDay') {
    const staff_id = String(body.staff_id ?? '');
    const date = String(body.date ?? '');
    const segmentsIn: Array<Record<string, unknown>> = Array.isArray(body.segments) ? body.segments : [];
    const isConfirmed = Boolean(body.is_confirmed ?? false);

    if (!staff_id || !date) {
      return NextResponse.json({ error: 'staff_id と date は必須です' }, { status: 400 });
    }

    /* (1) 既存全セグメントを削除 (tenant 一致で絞ることで他テナントは触らない) */
    const { error: delErr } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('tenant_id', gate.staff.tenant_id)
      .eq('staff_id', staff_id)
      .eq('date', date);
    if (delErr) {
      return NextResponse.json({ error: `削除失敗: ${delErr.message}` }, { status: 500 });
    }

    /* segments が空 = その日を完全に空にする (例: 削除専用) */
    if (segmentsIn.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    /* (2) segment_order を 0..N で再採番して INSERT */
    const rows = segmentsIn.map((s, idx) => ({
      tenant_id: gate.staff.tenant_id,
      staff_id,
      date,
      segment_order: idx,
      start_time: (s.start_time as string) ?? null,
      end_time: (s.end_time as string) ?? null,
      assignment_type: (s.assignment_type as string) ?? 'normal',
      is_confirmed: isConfirmed,
      note:
        typeof s.note === 'string' && s.note.trim()
          ? String(s.note).trim().slice(0, 40)
          : null,
    }));

    const { data, error: insErr } = await supabase
      .from('shift_assignments')
      .insert(rows)
      .select();
    if (insErr) {
      return NextResponse.json({ error: `登録失敗: ${insErr.message}` }, { status: 500 });
    }
    return NextResponse.json({ assignments: data });
  }

  /* 既定モード: bulk upsert (後方互換) */
  const assignments: Array<Record<string, unknown>> = Array.isArray(body?.assignments) ? body.assignments : [];
  if (assignments.length === 0) {
    return NextResponse.json({ error: 'assignments が空です' }, { status: 400 });
  }

  const rows = assignments.map((a) => ({
    tenant_id: gate.staff.tenant_id,
    staff_id: String(a.staff_id ?? ''),
    date: String(a.date ?? ''),
    start_time: (a.start_time as string) ?? null,
    end_time: (a.end_time as string) ?? null,
    assignment_type: (a.assignment_type as string) ?? 'off',
    is_confirmed: Boolean(a.is_confirmed ?? false),
    /* Phase 50: 分割シフト対応。未指定なら 0（従来挙動）。 */
    segment_order: Number.isFinite(a.segment_order as number) ? Number(a.segment_order) : 0,
    /* Phase 60: セル自由入力メモ。null で明示的に上書き可能にする。 */
    note:
      typeof a.note === 'string' && a.note.trim()
        ? String(a.note).trim().slice(0, 40)
        : null,
  }));

  const { data, error } = await supabase
    .from('shift_assignments')
    .upsert(rows, { onConflict: 'tenant_id,staff_id,date,segment_order' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data });
}
