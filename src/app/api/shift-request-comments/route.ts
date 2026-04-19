import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 36: 休み希望の自由入力コメント（日付ごと、他選択肢と排他）
 *
 * GET  /api/shift-request-comments?month=YYYY-MM
 *   指定月の全コメント rows（同テナント全員分）。シフト表の赤マーク判定にも使用。
 *
 * POST /api/shift-request-comments
 *   { staff_id?, month, date, comment_text }
 *   - viewer は staff_id 省略 or 自分のみ。
 *   - admin/editor は他人分も可。
 *   - comment_text 空文字を送ると delete（コメント解除）。
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const month = request.nextUrl.searchParams.get('month');
  const supabase = await createClient();
  let q = supabase
    .from('shift_request_comments')
    .select('*')
    .order('date', { ascending: true });
  if (month) q = q.eq('month', month);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body?.month || !body?.date) {
    return NextResponse.json({ error: 'month と date は必須です' }, { status: 400 });
  }

  const staff_id =
    body.staff_id && gate.staff.role !== 'viewer' ? body.staff_id : gate.staff.id;
  const text = typeof body.comment_text === 'string' ? body.comment_text.trim() : '';

  const supabase = await createClient();

  if (text === '') {
    /* 空文字 = コメント解除 */
    const { error } = await supabase
      .from('shift_request_comments')
      .delete()
      .eq('tenant_id', gate.staff.tenant_id)
      .eq('staff_id', staff_id)
      .eq('date', body.date);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { data, error } = await supabase
    .from('shift_request_comments')
    .upsert(
      {
        tenant_id: gate.staff.tenant_id,
        staff_id,
        month: body.month,
        date: body.date,
        comment_text: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,staff_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}
