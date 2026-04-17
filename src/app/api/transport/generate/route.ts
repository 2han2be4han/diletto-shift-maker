import { NextRequest, NextResponse } from 'next/server';
import { generateTransportAssignments } from '@/lib/logic/generateTransport';
import { requireRole } from '@/lib/auth/requireRole';
import type { StaffRow, ShiftAssignmentRow, ScheduleEntryRow, ChildTransportPatternRow } from '@/types';

/**
 * POST /api/transport/generate
 * 送迎担当仮割り当て生成 API
 *
 * クライアント側で必要データを渡す方式。
 * 認証済み editor 以上のみ実行可能。tenant_id はセッションから自動取得。
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const { date, scheduleEntries, patterns, staff, shiftAssignments } = body as {
      date: string;
      scheduleEntries: ScheduleEntryRow[];
      patterns: ChildTransportPatternRow[];
      staff: StaffRow[];
      shiftAssignments: ShiftAssignmentRow[];
    };

    if (!date) {
      return NextResponse.json({ error: 'date は必須です' }, { status: 400 });
    }

    const result = generateTransportAssignments({
      tenantId: gate.staff.tenant_id,
      date,
      scheduleEntries: scheduleEntries || [],
      patterns: patterns || [],
      staff: staff || [],
      shiftAssignments: shiftAssignments || [],
    });

    return NextResponse.json({
      assignments: result.assignments,
      unassignedCount: result.unassignedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送迎割り当て生成中にエラーが発生しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
