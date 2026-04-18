import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import type { AreaLabel } from '@/types';

/** Phase 28: 児童専用エリア sanitize。POST と同仕様。 */
function sanitizeAreaLabels(input: unknown): AreaLabel[] {
  if (!Array.isArray(input)) return [];
  const out: AreaLabel[] = [];
  for (const v of input) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const emoji = typeof r.emoji === 'string' ? r.emoji.trim() : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!emoji && !name) continue;
    const item: AreaLabel = { emoji, name };
    if (typeof r.time === 'string' && r.time.trim()) item.time = r.time.trim();
    if (typeof r.address === 'string' && r.address.trim()) item.address = r.address.trim();
    out.push(item);
  }
  return out;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });

  const allowed = ['name', 'grade_type', 'is_active', 'parent_contact', 'home_address', 'pickup_area_labels', 'dropoff_area_labels'] as const;
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];
  /* Phase 28 A案: 児童専用エリアは sanitize してから保存 */
  if ('custom_pickup_areas' in body) payload.custom_pickup_areas = sanitizeAreaLabels(body.custom_pickup_areas);
  if ('custom_dropoff_areas' in body) payload.custom_dropoff_areas = sanitizeAreaLabels(body.custom_dropoff_areas);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('children')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ child: data });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from('children').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
