import { NextRequest, NextResponse } from 'next/server';
import { generateTransportAssignments } from '@/lib/logic/generateTransport';
import type { StaffRow, ShiftAssignmentRow, ScheduleEntryRow, ChildTransportPatternRow } from '@/types';

/**
 * POST /api/transport/generate
 * 送迎担当仮割り当て生成API
 *
 * TODO: Supabase連携後にDBから直接データ取得に切り替え
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, date, scheduleEntries, patterns, staff, shiftAssignments } = body as {
      tenantId: string;
      date: string;
      scheduleEntries: ScheduleEntryRow[];
      patterns: ChildTransportPatternRow[];
      staff: StaffRow[];
      shiftAssignments: ShiftAssignmentRow[];
    };

    if (!tenantId || !date) {
      return NextResponse.json({ error: 'tenantId, date は必須です' }, { status: 400 });
    }

    const result = generateTransportAssignments({
      tenantId,
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
