import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { CHILD_LOCATION_IMAGES_BUCKET } from '@/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });

  const allowed = ['label', 'address', 'map_url', 'notes', 'image_storage_path'] as const;
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_dropoff_locations')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const supabase = await createClient();

  /* 画像がある場合は Storage からも削除 */
  const { data: loc } = await supabase
    .from('child_dropoff_locations')
    .select('image_storage_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('child_dropoff_locations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (loc?.image_storage_path) {
    await supabase.storage.from(CHILD_LOCATION_IMAGES_BUCKET).remove([loc.image_storage_path]);
  }
  return NextResponse.json({ ok: true });
}
