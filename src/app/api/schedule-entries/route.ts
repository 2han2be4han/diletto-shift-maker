import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/schedule-entries?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   同テナントの利用予定（日付レンジ）
 * POST /api/schedule-entries  - upsert（bulk可）
 * DELETE /api/schedule-entries?id=...
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const fromStr = request.nextUrl.searchParams.get('from');
  const toStr = request.nextUrl.searchParams.get('to');

  /* Phase 60: 閲覧者・編集者の参照制限（過去2日前〜7日後） */
  const { capRange } = await import('@/lib/date/dateLimit');
  const { from, to } = capRange(fromStr, toStr, gate.staff.role);

  const supabase = await createClient();

  /* Phase 60: select('*') 廃止。dto=transport 時は軽量化 */
  const dto = request.nextUrl.searchParams.get('dto');
  const cols = dto === 'transport'
    ? 'id, child_id, date, pickup_time, dropoff_time, pickup_method, dropoff_method, attendance_status'
    : 'id, tenant_id, child_id, date, pickup_time, dropoff_time, pickup_method, dropoff_method, pickup_mark, dropoff_mark, is_confirmed, attendance_status, attendance_updated_at, attendance_updated_by, created_at';

  let q = supabase.from('schedule_entries').select(cols).order('date');
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const entries: Array<Record<string, unknown>> = Array.isArray(body?.entries) ? body.entries : [];

  /* Phase 61-2: 差分モード。mode:'diff' のときは entries（最終状態）と
     removes（削除対象 entry_id 一覧）を受け取り、確定済み送迎が紐づく行は保護する。
     従来の replaceRange は後方互換のため残す。 */
  const mode = body?.mode === 'diff' ? 'diff' : 'replace';
  const removes: string[] = Array.isArray(body?.removes)
    ? (body.removes as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  if (entries.length === 0 && removes.length === 0) {
    return NextResponse.json({ error: 'entries または removes が必要です' }, { status: 400 });
  }

  /* Phase 47 (④): replaceRange モード用。*/
  const replaceRange =
    body?.replaceRange && typeof body.replaceRange === 'object'
      ? {
          from: typeof body.replaceRange.from === 'string' ? body.replaceRange.from : null,
          to: typeof body.replaceRange.to === 'string' ? body.replaceRange.to : null,
        }
      : null;

  const rows = entries.map((e) => ({
    tenant_id: gate.staff.tenant_id,
    child_id: String(e.child_id ?? ''),
    date: String(e.date ?? ''),
    pickup_time: (e.pickup_time as string) ?? null,
    dropoff_time: (e.dropoff_time as string) ?? null,
    pickup_method: e.pickup_method === 'self' ? 'self' : 'pickup',
    dropoff_method: e.dropoff_method === 'self' ? 'self' : 'dropoff',
    /* Phase 28: マーク（emoji+name 形式。テナント pickup_areas / dropoff_areas の選択肢） */
    pickup_mark: typeof e.pickup_mark === 'string' ? e.pickup_mark : null,
    dropoff_mark: typeof e.dropoff_mark === 'string' ? e.dropoff_mark : null,
    is_confirmed: Boolean(e.is_confirmed ?? false),
  }));

  const supabase = await createClient();

  if (mode === 'diff') {
    /* Phase 61-2: 差分モード。
       - removes: 指定された entry_id のみ削除。ただし
         (a) 出欠記録済み (attendance_status != 'planned') は保護
         (b) 確定済み送迎 (transport_assignments.is_confirmed=true) が紐づくものも保護
       - entries（adds/updates）: upsert（onConflict: tenant_id,child_id,date）
       - 同 entry に確定済み送迎が紐づく場合、upsert により schedule_entry 自体は
         内容更新されるが id は保持され、FK cascade は発動しない。 */
    const skippedIds: string[] = [];

    if (removes.length > 0) {
      /* 確定済み送迎が紐づく entry_id を先に列挙 */
      const { data: protectedRows, error: protErr } = await supabase
        .from('transport_assignments')
        .select('schedule_entry_id')
        .in('schedule_entry_id', removes)
        .eq('is_confirmed', true);
      if (protErr) return NextResponse.json({ error: `保護判定失敗: ${protErr.message}` }, { status: 500 });
      const protectedSet = new Set((protectedRows ?? []).map((r) => r.schedule_entry_id as string));

      /* 出欠記録済みも保護 */
      const { data: attendedRows, error: attErr } = await supabase
        .from('schedule_entries')
        .select('id')
        .in('id', removes)
        .eq('tenant_id', gate.staff.tenant_id)
        .not('attendance_status', 'is', null)
        .neq('attendance_status', 'planned');
      if (attErr) return NextResponse.json({ error: `出欠判定失敗: ${attErr.message}` }, { status: 500 });
      for (const r of attendedRows ?? []) protectedSet.add(r.id as string);

      const deletable = removes.filter((id) => !protectedSet.has(id));
      skippedIds.push(...removes.filter((id) => protectedSet.has(id)));

      if (deletable.length > 0) {
        const { error: delErr } = await supabase
          .from('schedule_entries')
          .delete()
          .in('id', deletable)
          .eq('tenant_id', gate.staff.tenant_id);
        if (delErr) return NextResponse.json({ error: `差分削除失敗: ${delErr.message}` }, { status: 500 });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ entries: [], skippedIds });
    }

    const { data, error } = await supabase
      .from('schedule_entries')
      .upsert(rows, { onConflict: 'tenant_id,child_id,date' })
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data, skippedIds });
  }

  /* 従来の replace モード */
  if (entries.length === 0) {
    return NextResponse.json({ error: 'entries が空です' }, { status: 400 });
  }

  if (replaceRange?.from && replaceRange?.to) {
    /* Phase 61-2: replaceRange でも確定済み送迎を保護。
       - 出欠記録済み (attendance_status != 'planned') は保護
       - 確定済み送迎が紐づく entry も保護
       - 残りの planned entry のみ削除 */
    const { data: rangeEntries, error: rErr } = await supabase
      .from('schedule_entries')
      .select('id')
      .eq('tenant_id', gate.staff.tenant_id)
      .gte('date', replaceRange.from)
      .lte('date', replaceRange.to)
      .or('attendance_status.is.null,attendance_status.eq.planned');
    if (rErr) return NextResponse.json({ error: `レンジ走査失敗: ${rErr.message}` }, { status: 500 });

    const rangeIds = (rangeEntries ?? []).map((r) => r.id as string);
    if (rangeIds.length > 0) {
      const { data: protectedRows, error: protErr } = await supabase
        .from('transport_assignments')
        .select('schedule_entry_id')
        .in('schedule_entry_id', rangeIds)
        .eq('is_confirmed', true);
      if (protErr) return NextResponse.json({ error: `保護判定失敗: ${protErr.message}` }, { status: 500 });
      const protectedSet = new Set((protectedRows ?? []).map((r) => r.schedule_entry_id as string));
      const deletable = rangeIds.filter((id) => !protectedSet.has(id));
      if (deletable.length > 0) {
        const { error: delErr } = await supabase
          .from('schedule_entries')
          .delete()
          .in('id', deletable)
          .eq('tenant_id', gate.staff.tenant_id);
        if (delErr) return NextResponse.json({ error: `レンジ削除失敗: ${delErr.message}` }, { status: 500 });
      }
    }
  }

  const { data, error } = await supabase
    .from('schedule_entries')
    .upsert(rows, { onConflict: 'tenant_id,child_id,date' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from('schedule_entries').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
