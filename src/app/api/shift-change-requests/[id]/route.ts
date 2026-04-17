import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  requireAuthenticated,
  requireRole,
} from '@/lib/auth/requireRole';
import type {
  ShiftAssignmentType,
  ShiftChangeRequestPayload,
  ShiftChangeRequestRow,
  ShiftChangeRequestStatus,
} from '@/types';

/**
 * PATCH /api/shift-change-requests/:id
 *   body: { action: 'approve' | 'reject' | 'cancel', admin_note?: string }
 *
 * Phase 25:
 *   - approve / reject: admin ロールのみ。承認時に shift_assignments を更新。
 *     (Phase 25-C-7a: 出勤中制約を撤廃。将来のメール通知で isOnDutyAdmin を
 *      受信者フィルタとして再利用する予定)
 *   - cancel: 申請者本人が pending のまま取り下げる場合。
 */

function applyPayloadToShift(
  staffId: string,
  tenantId: string,
  targetDate: string,
  changeType: ShiftChangeRequestRow['change_type'],
  payload: ShiftChangeRequestPayload,
  existingId: string | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    tenant_id: tenantId,
    staff_id: staffId,
    date: targetDate,
  };
  if (existingId) base.id = existingId;

  if (changeType === 'time') {
    const timeP = payload as { start_time: string; end_time: string };
    base.start_time = timeP.start_time;
    base.end_time = timeP.end_time;
    base.assignment_type = 'normal' satisfies ShiftAssignmentType;
  } else {
    const typeP = payload as {
      assignment_type: ShiftAssignmentType;
      start_time?: string | null;
      end_time?: string | null;
    };
    base.assignment_type = typeP.assignment_type;
    if (typeP.start_time !== undefined) base.start_time = typeP.start_time;
    if (typeP.end_time !== undefined) base.end_time = typeP.end_time;
  }

  /* 承認後は確定扱い。既存の is_confirmed=true は上書き可（明示的承認操作のため） */
  base.is_confirmed = true;
  return base;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const action = body?.action as 'approve' | 'reject' | 'cancel' | undefined;
  if (!action || !['approve', 'reject', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'action が不正です' }, { status: 400 });
  }

  /* cancel は申請者本人（認証済）、approve/reject は admin ロール */
  const gate =
    action === 'cancel' ? await requireAuthenticated() : await requireRole('admin');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();

  const { data: reqRow, error: fetchErr } = await supabase
    .from('shift_change_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !reqRow) {
    return NextResponse.json(
      { error: '申請が見つかりません' },
      { status: 404 },
    );
  }

  const request_row = reqRow as ShiftChangeRequestRow;

  if (request_row.status !== 'pending') {
    return NextResponse.json(
      { error: 'この申請は既に処理済みです' },
      { status: 409 },
    );
  }

  /* cancel は申請者本人のみ */
  if (action === 'cancel' && request_row.staff_id !== gate.staff.id) {
    return NextResponse.json(
      { error: '自分の申請のみキャンセルできます' },
      { status: 403 },
    );
  }

  const newStatus: ShiftChangeRequestStatus =
    action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled';

  /* approve の場合: shift_assignments を更新（upsert） */
  if (action === 'approve') {
    const { data: existingShift } = await supabase
      .from('shift_assignments')
      .select('id')
      .eq('staff_id', request_row.staff_id)
      .eq('date', request_row.target_date)
      .limit(1);

    const shiftRow = applyPayloadToShift(
      request_row.staff_id,
      request_row.tenant_id,
      request_row.target_date,
      request_row.change_type,
      request_row.requested_payload,
      existingShift?.[0]?.id ?? null,
    );

    const { error: upsertErr } = await supabase
      .from('shift_assignments')
      .upsert(shiftRow);

    if (upsertErr) {
      return NextResponse.json(
        { error: `シフト更新に失敗: ${upsertErr.message}` },
        { status: 500 },
      );
    }
  }

  const updatePatch: Record<string, unknown> = {
    status: newStatus,
  };
  if (action !== 'cancel') {
    updatePatch.reviewed_by_staff_id = gate.staff.id;
    updatePatch.reviewed_by_name = gate.staff.name;
    updatePatch.reviewed_at = new Date().toISOString();
    updatePatch.admin_note = body?.admin_note ?? null;
  }

  const { data: updated, error: updErr } = await supabase
    .from('shift_change_requests')
    .update(updatePatch)
    .eq('id', id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ request: updated });
}
