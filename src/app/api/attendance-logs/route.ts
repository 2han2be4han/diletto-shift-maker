import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuthenticated } from '@/lib/auth/requireRole';

/**
 * GET /api/attendance-logs?entry_id=...
 *   指定 schedule_entry の出欠変更履歴（新しい順）
 * GET /api/attendance-logs?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   期間指定（テナント横断の監査用）
 *
 * Phase 25: 履歴は全ロールで閲覧可（RLS で tenant_id 絞り込み）。
 */
export async function GET(request: NextRequest) {
  const gate = await requireAuthenticated();
  if (!gate.ok) return gate.response;

  const entryId = request.nextUrl.searchParams.get('entry_id');
  const fromStr = request.nextUrl.searchParams.get('from');
  const toStr = request.nextUrl.searchParams.get('to');

  /* Phase 60: 閲覧者・編集者の参照制限（過去2日前〜7日後） */
  const { capRange } = await import('@/lib/date/dateLimit');
  const { from, to } = capRange(fromStr, toStr, gate.staff.role);

  const supabase = await createClient();
  let q = supabase
    .from('attendance_audit_logs')
    .select('*')
    .order('changed_at', { ascending: false });

  if (entryId) q = q.eq('schedule_entry_id', entryId);
  if (from) q = q.gte('entry_date', from);
  if (to) q = q.lte('entry_date', to);

  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data });
}
