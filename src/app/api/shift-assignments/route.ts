import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/shift-assignments?from=YYYY-MM-DD&to=YYYY-MM-DD
 * POST /api/shift-assignments  - upsert（bulk）
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');

  const supabase = await createClient();
  let q = supabase.from('shift_assignments').select('*').order('date');
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const assignments: Array<Record<string, unknown>> = Array.isArray(body?.assignments) ? body.assignments : [];
  if (assignments.length === 0) {
    return NextResponse.json({ error: 'assignments が空です' }, { status: 400 });
  }

  const rows = assignments.map((a) => ({
    tenant_id: gate.staff.tenant_id,
    staff_id: String(a.staff_id ?? ''),
    date: String(a.date ?? ''),
    start_time: (a.start_time as string) ?? null,
    end_time: (a.end_time as string) ?? null,
    assignment_type: (a.assignment_type as string) ?? 'off',
    is_confirmed: Boolean(a.is_confirmed ?? false),
  }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shift_assignments')
    .upsert(rows, { onConflict: 'tenant_id,staff_id,date' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data });
}
