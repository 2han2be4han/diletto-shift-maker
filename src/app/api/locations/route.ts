import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * 児童の送り場所
 * GET  /api/locations           - 全一覧
 * POST /api/locations           - 作成（editor以上）
 */

export async function GET() {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_dropoff_locations')
    .select('*, children(name, grade_type)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body?.child_id || !body?.label) {
    return NextResponse.json({ error: 'child_id と label は必須です' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_dropoff_locations')
    .insert({
      tenant_id: gate.staff.tenant_id,
      child_id: body.child_id,
      label: body.label,
      address: body.address ?? null,
      map_url: body.map_url ?? null,
      notes: body.notes ?? null,
      image_storage_path: body.image_storage_path ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data });
}
