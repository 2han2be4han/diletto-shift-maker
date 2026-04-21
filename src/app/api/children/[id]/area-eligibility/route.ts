import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 60: 児童専用エリア × 担当可能職員 の取得/更新
 *
 * GET  /api/children/:id/area-eligibility
 *   → { items: ChildAreaEligibleStaffRow[] }
 *
 * PUT  /api/children/:id/area-eligibility
 *   body: { items: { area_id, staff_id, direction }[] }
 *   → 与えられた items をこの児童の担当可能職員の「全量」として差し替える。
 *     DB にあって body に無いレコードは削除、body にあって DB に無いレコードは追加。
 *     全置換方式。UI 側の多数トグル編集を 1 回の PUT で同期するのが目的。
 */

type DesiredItem = { area_id: string; staff_id: string; direction: 'pickup' | 'dropoff' };

function sanitizeItems(input: unknown): DesiredItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: DesiredItem[] = [];
  for (const v of input) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const area_id = typeof r.area_id === 'string' ? r.area_id : '';
    const staff_id = typeof r.staff_id === 'string' ? r.staff_id : '';
    const direction = r.direction === 'pickup' || r.direction === 'dropoff' ? r.direction : '';
    if (!area_id || !staff_id || !direction) continue;
    const key = `${area_id}|${staff_id}|${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ area_id, staff_id, direction });
  }
  return out;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_area_eligible_staff')
    .select('*')
    .eq('child_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id: childId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });

  const desired = sanitizeItems(body.items);
  const tenantId = gate.staff.tenant_id;

  const supabase = await createClient();

  /* 現在値を取得。差分計算（全置換方式）。 */
  const { data: current, error: selErr } = await supabase
    .from('child_area_eligible_staff')
    .select('id, area_id, staff_id, direction')
    .eq('child_id', childId);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const currentSet = new Map<string, string>();
  for (const r of current ?? []) {
    currentSet.set(`${r.area_id}|${r.staff_id}|${r.direction}`, r.id as string);
  }
  const desiredSet = new Set(desired.map((d) => `${d.area_id}|${d.staff_id}|${d.direction}`));

  const toDelete: string[] = [];
  for (const [key, rowId] of currentSet) {
    if (!desiredSet.has(key)) toDelete.push(rowId);
  }
  const toInsert = desired.filter((d) => !currentSet.has(`${d.area_id}|${d.staff_id}|${d.direction}`));

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('child_area_eligible_staff')
      .delete()
      .in('id', toDelete);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((d) => ({
      tenant_id: tenantId,
      child_id: childId,
      area_id: d.area_id,
      staff_id: d.staff_id,
      direction: d.direction,
    }));
    const { error: insErr } = await supabase
      .from('child_area_eligible_staff')
      .insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added: toInsert.length, removed: toDelete.length });
}
