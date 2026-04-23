import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 60: 同テナント全児童の child_area_eligible_staff を一括取得。
 * 送迎表画面で対応外職員の警告表示に使う。
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();

  /* Phase 60: select('*') 廃止。dto=transport 時は軽量化 */
  const dto = request.nextUrl.searchParams.get('dto');
  const cols = dto === 'transport'
    ? 'staff_id, area_id, direction'
    : 'id, tenant_id, child_id, area_id, staff_id, direction, created_at';

  const { data, error } = await supabase
    .from('child_area_eligible_staff')
    .select(cols);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
