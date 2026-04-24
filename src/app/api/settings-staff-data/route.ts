import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 61-6: 職員管理画面用の batch API
 *
 * 従来 /api/staff + /api/tenant の 2 fetch だったものを 1 回にまとめる。
 *
 * GET /api/settings-staff-data?include_retired=1
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const includeRetired = request.nextUrl.searchParams.get('include_retired') === '1';

  const supabase = await createClient();

  const staffQuery = supabase
    .from('staff')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (!includeRetired) staffQuery.eq('is_active', true);

  const [staffRes, tenantRes] = await Promise.all([
    staffQuery,
    supabase
      .from('tenants')
      .select('id, name, status, settings, created_at')
      .eq('id', gate.staff.tenant_id)
      .maybeSingle(),
  ]);

  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 });
  if (tenantRes.error) return NextResponse.json({ error: tenantRes.error.message }, { status: 500 });

  return NextResponse.json({
    staff: staffRes.data ?? [],
    tenant: tenantRes.data ?? null,
  });
}
