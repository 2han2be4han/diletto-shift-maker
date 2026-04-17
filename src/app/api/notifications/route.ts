import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * GET  /api/notifications           - 自分宛の通知一覧（最新50件）
 * POST /api/notifications/mark-read - 全既読 or 特定ID既読
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const unreadOnly = request.nextUrl.searchParams.get('unread') === '1';

  const supabase = await createClient();
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('recipient_staff_id', gate.staff.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (unreadOnly) q = q.eq('is_read', false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

  const supabase = await createClient();
  let q = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_staff_id', gate.staff.id);
  if (ids && ids.length > 0) q = q.in('id', ids);

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
