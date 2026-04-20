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
  let q = supabase.from('schedule_entries').select('*').order('date');
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
  if (entries.length === 0) return NextResponse.json({ error: 'entries が空です' }, { status: 400 });

  /* Phase 47 (④): PDF 再インポート時の「マージ追記」を防ぐためのレンジ上書きモード。
     replaceRange={from,to} が指定されたら、そのレンジ内の planned エントリを先に削除してから upsert。
     - 出欠記録済み (attendance_status != 'planned') の行は履歴保護のため削除しない
     - tenant_id は requireRole から取得する値を使い、リクエスト側からの上書きを許さない */
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

  if (replaceRange?.from && replaceRange?.to) {
    /* レンジ上書き: planned のみ削除（出欠記録済みは残す）。
       関連 transport_assignments は schedule_entry_id の FK ON DELETE CASCADE を前提とする。 */
    const { error: delErr } = await supabase
      .from('schedule_entries')
      .delete()
      .eq('tenant_id', gate.staff.tenant_id)
      .gte('date', replaceRange.from)
      .lte('date', replaceRange.to)
      .or('attendance_status.is.null,attendance_status.eq.planned');
    if (delErr) return NextResponse.json({ error: `レンジ削除失敗: ${delErr.message}` }, { status: 500 });
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
