import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 61-5: 利用予定画面用の batch API
 *
 * 従来 /api/children + /api/schedule-entries + /api/tenant の 3 fetch だったものを
 * 1 回の往復で取得する。追加で transport_assignments の確定ステータスも同梱し、
 * 差分インポート UI が「確定済み送迎が紐づく entry」を判別できるようにする。
 *
 * GET /api/schedule-page-data?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const fromStr = request.nextUrl.searchParams.get('from');
  const toStr = request.nextUrl.searchParams.get('to');
  const { capRange } = await import('@/lib/date/dateLimit');
  const { from, to } = capRange(fromStr, toStr, gate.staff.role);

  const supabase = await createClient();

  const [childrenRes, entriesRes, tenantRes] = await Promise.all([
    supabase
      .from('children')
      .select('id, tenant_id, name, grade_type, is_active, parent_contact, display_order, home_address, pickup_area_labels, dropoff_area_labels, custom_pickup_areas, custom_dropoff_areas, created_at')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    (async () => {
      let q = supabase
        .from('schedule_entries')
        .select('id, tenant_id, child_id, date, pickup_time, dropoff_time, pickup_method, dropoff_method, pickup_mark, dropoff_mark, is_confirmed, attendance_status, attendance_updated_at, attendance_updated_by, waitlist_order, created_at')
        .order('date');
      if (from) q = q.gte('date', from);
      if (to) q = q.lte('date', to);
      return q;
    })(),
    supabase
      .from('tenants')
      .select('id, name, status, settings, created_at')
      .eq('id', gate.staff.tenant_id)
      .maybeSingle(),
  ]);

  if (childrenRes.error) return NextResponse.json({ error: childrenRes.error.message }, { status: 500 });
  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  if (tenantRes.error) return NextResponse.json({ error: tenantRes.error.message }, { status: 500 });

  /* 確定済み送迎が紐づく schedule_entry_id を同梱する。
     差分インポート UI で「確定済み保護」バッジを付けるため。 */
  const entryIds = (entriesRes.data ?? []).map((e) => e.id as string);
  let confirmedTransportEntryIds: string[] = [];
  if (entryIds.length > 0) {
    const { data: ta, error: taErr } = await supabase
      .from('transport_assignments')
      .select('schedule_entry_id')
      .in('schedule_entry_id', entryIds)
      .eq('is_confirmed', true);
    if (taErr) return NextResponse.json({ error: taErr.message }, { status: 500 });
    confirmedTransportEntryIds = Array.from(
      new Set((ta ?? []).map((r) => r.schedule_entry_id as string))
    );
  }

  return NextResponse.json({
    children: childrenRes.data ?? [],
    entries: entriesRes.data ?? [],
    tenant: tenantRes.data ?? null,
    confirmedTransportEntryIds,
  });
}
