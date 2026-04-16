import { NextRequest, NextResponse } from 'next/server';
import { generateShiftAssignments } from '@/lib/logic/generateShift';
import type { StaffRow, ShiftRequestRow, ScheduleEntryRow } from '@/types';

/**
 * POST /api/shift/generate
 * シフト半自動生成API
 *
 * リクエスト: { tenantId, year, month, staff, shiftRequests, scheduleEntries }
 * レスポンス: { assignments[], warnings[] }
 *
 * TODO: Supabase連携後にDBから直接データ取得に切り替え
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      tenantId,
      year,
      month,
      staff,
      shiftRequests,
      scheduleEntries,
    } = body as {
      tenantId: string;
      year: number;
      month: number;
      staff: StaffRow[];
      shiftRequests: ShiftRequestRow[];
      scheduleEntries: ScheduleEntryRow[];
    };

    if (!tenantId || !year || !month) {
      return NextResponse.json(
        { error: 'tenantId, year, month は必須です' },
        { status: 400 }
      );
    }

    const result = generateShiftAssignments({
      tenantId,
      year,
      month,
      staff: staff || [],
      shiftRequests: shiftRequests || [],
      scheduleEntries: scheduleEntries || [],
    });

    return NextResponse.json({
      assignments: result.assignments,
      warnings: result.warnings,
      summary: {
        totalDays: new Date(year, month, 0).getDate(),
        totalAssignments: result.assignments.length,
        warningCount: result.warnings.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'シフト生成中にエラーが発生しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
