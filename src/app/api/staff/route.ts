import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/staff     - 同テナントの職員一覧
 * POST /api/staff    - 新規職員作成（招待は /api/staff/invite 推奨）
 *
 * 個別操作（PATCH / DELETE）は /api/staff/[id]
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  /* Phase 25: ?include_retired=1 で退職者も含む一覧を返す。デフォルトは在職のみ。 */
  const includeRetired = request.nextUrl.searchParams.get('include_retired') === '1';

  const supabase = await createClient();
  /* Phase 24: display_order NULLS LAST → name で安定ソート */
  let q = supabase
    .from('staff')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (!includeRetired) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: '氏名は必須です' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('staff')
    .insert({
      tenant_id: gate.staff.tenant_id,
      name: body.name,
      email: body.email ?? null,
      role: body.role ?? 'admin',
      employment_type: body.employment_type ?? 'part_time',
      default_start_time: body.default_start_time ?? null,
      default_end_time: body.default_end_time ?? null,
      transport_areas: body.transport_areas ?? [],
      /* Phase 27-D: 未指定時は transport_areas にフォールバック（互換維持） */
      pickup_transport_areas: body.pickup_transport_areas ?? body.transport_areas ?? [],
      dropoff_transport_areas: body.dropoff_transport_areas ?? body.transport_areas ?? [],
      qualifications: body.qualifications ?? [],
      is_qualified: body.is_qualified ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}
