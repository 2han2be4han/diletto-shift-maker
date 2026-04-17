import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * 児童の送迎パターン管理（editor以上）
 * GET  /api/children/[id]/patterns - その児童のパターン一覧
 * POST /api/children/[id]/patterns - 新規追加
 * PUT  /api/children/[id]/patterns - 全置換（UIで一括保存する用）
 */

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
      dropoff_location: body.dropoff_location ?? null,
      dropoff_time: body.dropoff_time ?? null,
      area_label: body.area_label ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pattern: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const patterns: Array<Record<string, unknown>> = body?.patterns ?? [];

  const supabase = await createClient();
  /* 既存削除 → 新規挿入（シンプル戦略） */
  await supabase.from('child_transport_patterns').delete().eq('child_id', id);

  if (patterns.length === 0) {
    return NextResponse.json({ patterns: [] });
  }

  const rows = patterns.map((p) => ({
    tenant_id: gate.staff.tenant_id,
    child_id: id,
    pattern_name: String(p.pattern_name ?? ''),
    pickup_location: (p.pickup_location as string) ?? null,
    pickup_time: (p.pickup_time as string) ?? null,
    dropoff_location: (p.dropoff_location as string) ?? null,
    dropoff_time: (p.dropoff_time as string) ?? null,
    area_label: (p.area_label as string) ?? null,
  }));

  const { data, error } = await supabase
    .from('child_transport_patterns')
    .insert(rows)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ patterns: data });
}
