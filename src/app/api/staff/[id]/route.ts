import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * PATCH  /api/staff/[id]  - 職員情報更新（admin のみ）
 *                          body.is_active=false で退職扱い（ソフト削除）
 *                          body.is_active=true  で退職復帰
 * DELETE /api/staff/[id]  - Phase 25: 物理削除は廃止。is_active=false に置換。
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
    'transport_areas', 'pickup_transport_areas', 'dropoff_transport_areas',
    'qualifications', 'is_qualified',
    'is_active',
    'display_name',
  ] as const;
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];

  /* Phase 28 F案: display_name は長さ制限なし。空・非文字列は null に正規化 */
  if ('display_name' in payload) {
    const v = payload.display_name;
    if (typeof v === 'string') {
      const t = v.trim();
      payload.display_name = t || null;
    } else {
      payload.display_name = null;
    }
  }

  /* is_active 切替時に retired_at を自動設定/解除 */
  if ('is_active' in payload) {
    payload.retired_at = payload.is_active === false ? new Date().toISOString() : null;
  }

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

  /* Phase 25: 物理削除廃止。is_active=false + retired_at 設定で退職扱いに。
     auth.users は残すことで、再雇用時の手動リンク運用が可能。 */
  const { error } = await supabase
    .from('staff')
    .update({ is_active: false, retired_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, soft_deleted: true });
}
