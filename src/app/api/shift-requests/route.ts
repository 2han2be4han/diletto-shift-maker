import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET /api/shift-requests?month=YYYY-MM - 指定月の全員分の休み希望
 * POST /api/shift-requests               - 自分 or 他人（editor以上）の休み希望 upsert
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const month = request.nextUrl.searchParams.get('month');

  const supabase = await createClient();
  let q = supabase.from('shift_requests').select('*').order('submitted_at', { ascending: false });
  if (month) q = q.eq('month', month);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body?.month || !body?.request_type || !Array.isArray(body?.dates)) {
    return NextResponse.json(
      { error: 'month, request_type, dates は必須です' },
      { status: 400 }
    );
  }

  /* viewer は自分の分のみ。editor/admin は任意の staff_id を指定可 */
  const staff_id =
    body.staff_id && gate.staff.role !== 'viewer'
      ? body.staff_id
      : gate.staff.id;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shift_requests')
    .upsert(
      {
        tenant_id: gate.staff.tenant_id,
        staff_id,
        month: body.month,
        request_type: body.request_type,
        dates: body.dates,
        notes: body.notes ?? null,
      },
      { onConflict: 'tenant_id,staff_id,month,request_type' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}
