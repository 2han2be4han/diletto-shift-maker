import type {
  StaffRow,
  ShiftAssignmentRow,
  ShiftRequestRow,
  ScheduleEntryRow,
  ShiftAssignmentType,
} from '@/types';
import { DEFAULT_MIN_QUALIFIED_STAFF } from '@/types';

/**
 * シフト半自動生成ロジック（ルールベース）
 *
 * ルール（CLAUDE.md §8 準拠）:
 * 1. 職員の休み希望を反映（公休・有給を割り当て）
 * 2. 利用人数に応じた最低出勤人数を確保（ceil(利用人数/2)、最低3名）
 * 3. 有資格者が規定数以上出勤するよう確保
 * 4. 生成結果は is_confirmed: false で保存（自動確定禁止）
 *
 * 関数シグネチャは変更禁止（CLAUDE.md §6）
 */

type GenerateShiftInput = {
  tenantId: string;
  year: number;
  month: number;
  staff: StaffRow[];
  shiftRequests: ShiftRequestRow[];
  scheduleEntries: ScheduleEntryRow[];
  minQualifiedStaff?: number;
};

type GenerateShiftResult = {
  assignments: Omit<ShiftAssignmentRow, 'id' | 'created_at'>[];
  warnings: ShiftWarning[];
};

type ShiftWarning = {
  date: string;
  type: 'understaffed' | 'no_qualified' | 'overworked';
  message: string;
};

export function generateShiftAssignments(
  input: GenerateShiftInput
): GenerateShiftResult {
  const {
    tenantId,
    year,
    month,
    staff,
    shiftRequests,
    scheduleEntries,
    minQualifiedStaff = DEFAULT_MIN_QUALIFIED_STAFF,
  } = input;

  const assignments: Omit<ShiftAssignmentRow, 'id' | 'created_at'>[] = [];
  const warnings: ShiftWarning[] = [];

  /* 月の日数 */
  const daysInMonth = new Date(year, month, 0).getDate();

  /* 休み希望をマップ化: staffId → { dates[], type } */
  const requestMap = new Map<
    string,
    { publicHolidays: Set<string>; paidLeaves: Set<string>; availableDays: Set<string> }
  >();

  for (const req of shiftRequests) {
    if (!requestMap.has(req.staff_id)) {
      requestMap.set(req.staff_id, {
        publicHolidays: new Set(),
        paidLeaves: new Set(),
        availableDays: new Set(),
      });
    }
    const entry = requestMap.get(req.staff_id)!;
    for (const d of req.dates) {
      if (req.request_type === 'public_holiday') entry.publicHolidays.add(d);
      if (req.request_type === 'paid_leave') entry.paidLeaves.add(d);
      if (req.request_type === 'available_day') entry.availableDays.add(d);
    }
  }

  /* 日ごとの利用人数を集計 */
  const dailyChildCount = new Map<string, number>();
  for (const entry of scheduleEntries) {
    const count = dailyChildCount.get(entry.date) || 0;
    dailyChildCount.set(entry.date, count + 1);
  }

  /* 各日のシフトを生成 */
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(year, month - 1, d).getDay();

    /* 利用人数から最低出勤人数を算出 */
    const childCount = dailyChildCount.get(dateStr) || 0;
    const minStaff = Math.max(3, Math.ceil(childCount / 2));

    let assignedCount = 0;
    let qualifiedCount = 0;

    for (const s of staff) {
      const requests = requestMap.get(s.id);
      let assignmentType: ShiftAssignmentType = 'normal';

      /* 休み希望の反映 */
      if (requests?.publicHolidays.has(dateStr)) {
        assignmentType = 'public_holiday';
      } else if (requests?.paidLeaves.has(dateStr)) {
        assignmentType = 'paid_leave';
      } else if (dow === 0) {
        /* 日曜は全員休み（デフォルト） */
        assignmentType = 'off';
      } else if (s.employment_type === 'part_time' && !requests?.availableDays.has(dateStr)) {
        /* パートは出勤可能日のみ出勤（出勤可能日未指定なら休み） */
        if (requests && requests.availableDays.size > 0) {
          assignmentType = 'off';
        }
      }

      const isWorking = assignmentType === 'normal';

      if (isWorking) {
        assignedCount++;
        if (s.is_qualified) qualifiedCount++;
      }

      assignments.push({
        tenant_id: tenantId,
        staff_id: s.id,
        date: dateStr,
        start_time: isWorking ? (s.default_start_time || '09:00') : null,
        end_time: isWorking ? (s.default_end_time || '17:00') : null,
        assignment_type: assignmentType,
        is_confirmed: false,
      });
    }

    /* 警告チェック */
    if (childCount > 0 && assignedCount < minStaff) {
      warnings.push({
        date: dateStr,
        type: 'understaffed',
        message: `人員不足: 出勤${assignedCount}名 / 必要${minStaff}名（利用児童${childCount}名）`,
      });
    }

    if (childCount > 0 && qualifiedCount < minQualifiedStaff) {
      warnings.push({
        date: dateStr,
        type: 'no_qualified',
        message: `有資格者不足: ${qualifiedCount}名 / 必要${minQualifiedStaff}名`,
      });
    }
  }

  return { assignments, warnings };
}
