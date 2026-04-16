import type {
  StaffRow,
  ShiftAssignmentRow,
  ScheduleEntryRow,
  ChildTransportPatternRow,
  TransportAssignmentRow,
} from '@/types';
import { MAX_STAFF_PER_TRANSPORT, TRANSPORT_GROUP_TIME_WINDOW_MINUTES } from '@/types';

/**
 * 送迎担当仮割り当てロジック（ルールベース）
 *
 * 割り当て優先ルール（CLAUDE.md §8 準拠、この順番で評価）:
 * 1. その日に出勤している職員のみ候補
 * 2. 送迎時間が職員の勤務時間内に収まること
 * 3. 送迎エリアが職員の対応エリアと一致すること
 * 4. 同一エリア・同一時間帯（±30分以内）の児童はグルーピング
 * 5. 1日の送迎回数が均等になるよう分散
 *
 * 制約:
 * - 1回の送迎につき担当者は最大2名まで
 * - 条件を満たす職員が存在しない場合: is_unassigned: true
 * - 生成結果は is_confirmed: false（自動確定禁止）
 *
 * 関数シグネチャは変更禁止（CLAUDE.md §6）
 */

type GenerateTransportInput = {
  tenantId: string;
  date: string;
  scheduleEntries: ScheduleEntryRow[];
  patterns: ChildTransportPatternRow[];
  staff: StaffRow[];
  shiftAssignments: ShiftAssignmentRow[];
};

type GenerateTransportResult = {
  assignments: Omit<TransportAssignmentRow, 'id' | 'created_at'>[];
  unassignedCount: number;
};

export function generateTransportAssignments(
  input: GenerateTransportInput
): GenerateTransportResult {
  const { tenantId, date, scheduleEntries, patterns, staff, shiftAssignments } = input;

  /* ① 出勤している職員のみ抽出 */
  const workingStaff = staff.filter((s) => {
    const shift = shiftAssignments.find(
      (sa) => sa.staff_id === s.id && sa.date === date && sa.assignment_type === 'normal'
    );
    return !!shift;
  });

  /* 職員ごとの送迎担当回数（均等分散用） */
  const staffAssignCount = new Map<string, number>();
  workingStaff.forEach((s) => staffAssignCount.set(s.id, 0));

  /* パターンをマップ化 */
  const patternMap = new Map<string, ChildTransportPatternRow>();
  patterns.forEach((p) => patternMap.set(p.id, p));

  const assignments: Omit<TransportAssignmentRow, 'id' | 'created_at'>[] = [];
  let unassignedCount = 0;

  /* 各利用予定に対して担当を割り当て */
  for (const entry of scheduleEntries) {
    if (entry.date !== date) continue;

    const pattern = entry.pattern_id ? patternMap.get(entry.pattern_id) : null;
    const areaLabel = pattern?.area_label || null;
    const pickupTime = entry.pickup_time;
    const dropoffTime = entry.dropoff_time;

    /* 迎え担当を選定 */
    const pickupStaff = selectStaff({
      workingStaff,
      shiftAssignments,
      date,
      time: pickupTime,
      areaLabel,
      staffAssignCount,
      maxStaff: MAX_STAFF_PER_TRANSPORT,
    });

    /* 送り担当を選定 */
    const dropoffStaff = selectStaff({
      workingStaff,
      shiftAssignments,
      date,
      time: dropoffTime,
      areaLabel,
      staffAssignCount,
      maxStaff: MAX_STAFF_PER_TRANSPORT,
    });

    const isUnassigned = pickupStaff.length === 0 && dropoffStaff.length === 0;
    if (isUnassigned) unassignedCount++;

    assignments.push({
      tenant_id: tenantId,
      schedule_entry_id: entry.id,
      pickup_staff_ids: pickupStaff.map((s) => s.id),
      dropoff_staff_ids: dropoffStaff.map((s) => s.id),
      is_confirmed: false,
      is_unassigned: isUnassigned,
    });
  }

  return { assignments, unassignedCount };
}

/* 担当職員の選定 */
function selectStaff({
  workingStaff,
  shiftAssignments,
  date,
  time,
  areaLabel,
  staffAssignCount,
  maxStaff,
}: {
  workingStaff: StaffRow[];
  shiftAssignments: ShiftAssignmentRow[];
  date: string;
  time: string | null;
  areaLabel: string | null;
  staffAssignCount: Map<string, number>;
  maxStaff: number;
}): StaffRow[] {
  if (!time) return [];

  let candidates = workingStaff.filter((s) => {
    const shift = shiftAssignments.find(
      (sa) => sa.staff_id === s.id && sa.date === date
    );
    if (!shift || !shift.start_time || !shift.end_time) return false;

    /* ② 送迎時間が勤務時間内か */
    if (!isTimeInRange(time, shift.start_time, shift.end_time)) return false;

    /* ③ エリア一致（エリア指定がある場合） */
    if (areaLabel && s.transport_areas.length > 0) {
      if (!s.transport_areas.includes(areaLabel)) return false;
    }

    return true;
  });

  /* ⑤ 送迎回数が少ない順にソート */
  candidates.sort((a, b) => {
    const countA = staffAssignCount.get(a.id) || 0;
    const countB = staffAssignCount.get(b.id) || 0;
    return countA - countB;
  });

  /* 最大人数まで選択 */
  const selected = candidates.slice(0, maxStaff);

  /* カウントを更新 */
  selected.forEach((s) => {
    staffAssignCount.set(s.id, (staffAssignCount.get(s.id) || 0) + 1);
  });

  return selected;
}

/* 時間が範囲内かチェック（HH:MM形式） */
function isTimeInRange(time: string, start: string, end: string): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const t = toMinutes(time);
  return t >= toMinutes(start) && t <= toMinutes(end);
}
