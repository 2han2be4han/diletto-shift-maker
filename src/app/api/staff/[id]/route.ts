import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * PATCH /api/staff/[id]   - 職員情報更新（admin のみ）
 * DELETE /api/staff/[id]  - 職員削除（admin のみ）
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });

  /* 許可するカラムのみ */
  const allowed = [
    'name', 'email', 'role', 'employment_type',
    'default_start_time', 'default_end_time',
    'transport_areas', 'qualifications', 'is_qualified',
  ] as const;
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('staff')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const supabase = await createClient();

  /* staff 行と紐付く user_id を取得して Auth からも削除（admin のみ service_role 必要） */
  const { data: staff } = await supabase.from('staff').select('user_id').eq('id', id).maybeSingle();

  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (staff?.user_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(staff.user_id);
  }

  return NextResponse.json({ ok: true });
}
