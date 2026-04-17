import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * 児童の送迎パターン管理（editor 以上）
 * GET  /api/children/[id]/patterns - その児童のパターン一覧
 * POST /api/children/[id]/patterns - 新規追加
 * PUT  /api/children/[id]/patterns - 全置換（UI で一括保存する用）
 */

type IncomingPattern = {
  pattern_name?: unknown;
  pickup_location?: unknown;
  pickup_time?: unknown;
  pickup_method?: unknown;
  dropoff_location?: unknown;
  dropoff_time?: unknown;
  dropoff_method?: unknown;
  area_label?: unknown;
};

function validatePatterns(raw: unknown): { ok: true; rows: IncomingPattern[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'patterns は配列である必要があります' };
  }
  for (const p of raw) {
    if (!p || typeof p !== 'object') {
      return { ok: false, error: 'patterns の各要素はオブジェクトである必要があります' };
    }
    if (typeof (p as IncomingPattern).pattern_name !== 'string') {
      return { ok: false, error: 'pattern_name は文字列で必須です' };
    }
  }
  return { ok: true, rows: raw as IncomingPattern[] };
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_transport_patterns')
    .select('*')
    .eq('child_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ patterns: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.pattern_name) {
    return NextResponse.json({ error: 'パターン名は必須です' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_transport_patterns')
    .insert({
      tenant_id: gate.staff.tenant_id,
      child_id: id,
      pattern_name: body.pattern_name,
      pickup_location: body.pickup_location ?? null,
      pickup_time: body.pickup_time ?? null,
      pickup_method: body.pickup_method ?? 'pickup',
      dropoff_location: body.dropoff_location ?? null,
      dropoff_time: body.dropoff_time ?? null,
      dropoff_method: body.dropoff_method ?? 'dropoff',
      area_label: body.area_label ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pattern: data });
}

/**
 * PUT: 送迎パターンを一括置換
 * 安全対策（Codex レビュー #2 P1）:
 *   1. body を先に検証（失敗なら既存データに触らず 400 を返す）
 *   2. insert が先、成功した場合のみ旧データを削除
 *   3. delete も失敗したら新旧の重複は残るが、データ損失は発生しない
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body || !('patterns' in body)) {
    return NextResponse.json({ error: 'patterns フィールドが必要です' }, { status: 400 });
  }

  const validated = validatePatterns(body.patterns);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const patterns = validated.rows;

  const supabase = await createClient();

  /* 空配列なら全削除だけ */
  if (patterns.length === 0) {
    const { error: delError } = await supabase
      .from('child_transport_patterns')
      .delete()
      .eq('child_id', id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    return NextResponse.json({ patterns: [] });
  }

  /* 既存行の ID を取得（後で削除対象にする） */
  const { data: existingRows, error: fetchError } = await supabase
    .from('child_transport_patterns')
    .select('id')
    .eq('child_id', id);
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  const existingIds = (existingRows ?? []).map((r) => r.id as string);

  /* 新データを insert（失敗しても既存データは保護される） */
  const rows = patterns.map((p) => ({
    tenant_id: gate.staff.tenant_id,
    child_id: id,
    pattern_name: String(p.pattern_name ?? ''),
    pickup_location: (p.pickup_location as string | null) ?? null,
    pickup_time: (p.pickup_time as string | null) ?? null,
    pickup_method: (p.pickup_method as string) ?? 'pickup',
    dropoff_location: (p.dropoff_location as string | null) ?? null,
    dropoff_time: (p.dropoff_time as string | null) ?? null,
    dropoff_method: (p.dropoff_method as string) ?? 'dropoff',
    area_label: (p.area_label as string | null) ?? null,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('child_transport_patterns')
    .insert(rows)
    .select();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: `新規パターンの登録に失敗しました: ${insertError?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }

  /* 挿入成功後に旧行を削除。失敗しても既に新行は入っているので、最悪重複が残るだけ */
  if (existingIds.length > 0) {
    await supabase
      .from('child_transport_patterns')
      .delete()
      .in('id', existingIds);
  }

  return NextResponse.json({ patterns: inserted });
}
