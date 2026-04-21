import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuthenticated } from '@/lib/auth/requireRole';
import type { AttendanceStatus } from '@/types';

/**
 * PATCH /api/schedule-entries/:id/attendance
 *   body: { status: AttendanceStatus }
 *
 * Phase 25: 全ログイン済み職員（viewer 含む）が児童の出欠を更新可。
 * 内部で Postgres RPC update_schedule_entry_attendance を呼ぶことで、
 * tenant 一致チェック・履歴記録（attendance_audit_logs）を自動化。
 */
const VALID_STATUSES: AttendanceStatus[] = [
  'planned',
  'present',
  'absent',
  'late',
  'early_leave',
  'leave',
];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAuthenticated();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status as AttendanceStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: '不正な出欠ステータスです' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_schedule_entry_attendance', {
    p_entry_id: id,
    p_status: status,
  });

  if (error) {
    const msg = error.message ?? '出欠の更新に失敗しました';
    const code = error.code;
    const httpStatus =
      code === '42501' ? 401 : code === 'P0002' ? 404 : code === '22023' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: httpStatus });
  }

  return NextResponse.json({ entry: data });
}
