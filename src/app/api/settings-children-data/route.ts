import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 61-6: 児童管理画面用の batch API
 *
 * 従来 /api/children + /api/tenant + /api/staff の 3 fetch だったものを 1 回にまとめる。
 *
 * GET /api/settings-children-data
 */
export async function GET() {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();

  const [childrenRes, tenantRes, staffRes] = await Promise.all([
    supabase
      .from('children')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('tenants')
      .select('id, name, status, settings, created_at')
      .eq('id', gate.staff.tenant_id)
      .maybeSingle(),
    supabase
      .from('staff')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
  ]);

  if (childrenRes.error) return NextResponse.json({ error: childrenRes.error.message }, { status: 500 });
  if (tenantRes.error) return NextResponse.json({ error: tenantRes.error.message }, { status: 500 });
  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 });

  return NextResponse.json({
    children: childrenRes.data ?? [],
    tenant: tenantRes.data ?? null,
    staff: staffRes.data ?? [],
  });
}
