import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 61-4: シフト表画面用の batch API
 *
 * 従来 staff / schedule-entries / shift-requests / shift-assignments / shift-request-comments の
 * 5 fetch + /api/me で計 6 往復だったものを 1 回にまとめる。
 *
 * GET /api/shift-page-data?month=YYYY-MM
 *   month は YYYY-MM 形式。from/to は month から算出する（月初〜月末）。
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const month = request.nextUrl.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month=YYYY-MM が必要です' }, { status: 400 });
  }
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  const supabase = await createClient();

  const [staffRes, entriesRes, requestsRes, assignmentsRes, commentsRes] = await Promise.all([
    supabase
      .from('staff')
      .select('id, tenant_id, auth_user_id, email, name, display_name, role, is_active, is_driver, is_attendant, employment_type, default_shift_type, weekly_default_offs, transport_areas, pickup_transport_areas, dropoff_transport_areas, qualifications, display_order, created_at')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    supabase
      .from('schedule_entries')
      .select('id, tenant_id, child_id, date, pickup_time, dropoff_time, pickup_method, dropoff_method, attendance_status, waitlist_order, created_at')
      .gte('date', from)
      .lte('date', to)
      .order('date'),
    supabase
      .from('shift_requests')
      .select('*')
      .eq('month', month)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('shift_assignments')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date'),
    supabase
      .from('shift_request_comments')
      .select('*')
      .eq('month', month)
      .order('date', { ascending: true }),
  ]);

  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 });
  if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 });
  if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
  if (commentsRes.error) return NextResponse.json({ error: commentsRes.error.message }, { status: 500 });

  return NextResponse.json({
    staff: staffRes.data ?? [],
    entries: entriesRes.data ?? [],
    requests: requestsRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    comments: commentsRes.data ?? [],
    me: { role: gate.staff.role, id: gate.staff.id, tenant_id: gate.staff.tenant_id },
  });
}
