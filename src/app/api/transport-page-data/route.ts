import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { capRange } from '@/lib/date/dateLimit';

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const fromStr = request.nextUrl.searchParams.get('from');
  const toStr = request.nextUrl.searchParams.get('to');
  const { from, to } = capRange(fromStr, toStr, gate.staff.role);

  const supabase = await createClient();

  const [staffRes, childrenRes, entriesRes, shiftsRes, transportsRes, tenantRes, eligibilityRes] = await Promise.all([
    supabase
      .from('staff')
      .select('id, name, display_name, is_driver, is_attendant, transport_areas, pickup_transport_areas, dropoff_transport_areas')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    supabase
      .from('children')
      .select('id, name, display_order, home_address, pickup_area_labels, dropoff_area_labels, custom_pickup_areas, custom_dropoff_areas')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    (async () => {
      let q = supabase
        .from('schedule_entries')
        .select('id, child_id, date, pickup_time, dropoff_time, pickup_method, dropoff_method, attendance_status')
        .order('date');
      if (from) q = q.gte('date', from);
      if (to) q = q.lte('date', to);
      return q;
    })(),
    (async () => {
      let q = supabase
        .from('shift_assignments')
        .select('id, staff_id, date, start_time, end_time, assignment_type')
        .order('date');
      if (from) q = q.gte('date', from);
      if (to) q = q.lte('date', to);
      return q;
    })(),
    (async () => {
      let q = supabase
        .from('transport_assignments')
        .select('id, schedule_entry_id, pickup_staff_ids, dropoff_staff_ids, is_unassigned, is_confirmed, is_locked, schedule_entries!inner(date)');
      if (from) q = q.gte('schedule_entries.date', from);
      if (to) q = q.lte('schedule_entries.date', to);
      return q;
    })(),
    supabase.from('tenants').select('settings').eq('id', gate.staff.tenant_id).single(),
    supabase.from('child_area_eligible_staff').select('staff_id, area_id, direction'),
  ]);

  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 });
  if (childrenRes.error) return NextResponse.json({ error: childrenRes.error.message }, { status: 500 });
  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  if (shiftsRes.error) return NextResponse.json({ error: shiftsRes.error.message }, { status: 500 });
  if (transportsRes.error) return NextResponse.json({ error: transportsRes.error.message }, { status: 500 });
  if (tenantRes.error && tenantRes.error.code !== 'PGRST116') return NextResponse.json({ error: tenantRes.error.message }, { status: 500 });
  if (eligibilityRes.error) return NextResponse.json({ error: eligibilityRes.error.message }, { status: 500 });

  return NextResponse.json({
    staff: staffRes.data ?? [],
    children: childrenRes.data ?? [],
    entries: entriesRes.data ?? [],
    shiftAssignments: shiftsRes.data ?? [],
    transportAssignments: transportsRes.data ?? [],
    tenant: { settings: tenantRes.data?.settings ?? {} },
    eligibilityItems: eligibilityRes.data ?? [],
  });
}
