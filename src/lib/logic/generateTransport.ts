import type {
  StaffRow,
  ShiftAssignmentRow,
  ScheduleEntryRow,
  ChildTransportPatternRow,
  TransportAssignmentRow,
} from '@/types';
import { MAX_STAFF_PER_TRANSPORT, TRANSPORT_GROUP_TIME_WINDOW_MINUTES, DEFAULT_TRANSPORT_MIN_END_TIME } from '@/types';

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
  /** Phase 26: この時刻以降に退勤する職員のみ候補。"HH:MM"。省略時 "16:31" */
  minEndTime?: string;
};

type GenerateTransportResult = {
  assignments: Omit<TransportAssignmentRow, 'id' | 'created_at'>[];
  unassignedCount: number;
};

export function generateTransportAssignments(
  input: GenerateTransportInput
): GenerateTransportResult {
  const { tenantId, date, scheduleEntries, patterns, staff, shiftAssignments } = input;
  const minEndTime = input.minEndTime ?? DEFAULT_TRANSPORT_MIN_END_TIME;

  /* ① 出勤している職員のみ抽出（Phase 26: さらに退勤時刻 >= minEndTime で絞る） */
  const workingStaff = staff.filter((s) => {
    const shift = shiftAssignments.find(
      (sa) => sa.staff_id === s.id && sa.date === date && sa.assignment_type === 'normal'
    );
    if (!shift || !shift.end_time) return false;
    /* 退勤時刻が 16:31 以降でなければ送迎候補から外す */
    return compareTime(shift.end_time, minEndTime) >= 0;
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
    /* Phase 27: 迎は pickup_area_label、送は dropoff_area_label を優先し、
       両者とも無い旧データは legacy area_label にフォールバック。
       これにより職員の pickup_transport_areas / dropoff_transport_areas とのマッチが
       実際の方向のエリアで行われる。 */
    const pickupAreaLabel = pattern?.pickup_area_label ?? pattern?.area_label ?? null;
    const dropoffAreaLabel = pattern?.dropoff_area_label ?? pattern?.area_label ?? null;
    const pickupTime = entry.pickup_time;
    const dropoffTime = entry.dropoff_time;

    /* Phase 26: 保護者送迎（method='self'）は担当不要。割り当てをスキップし、
       is_unassigned=false で空配列を記録する（UI でエラー扱いしない） */
    const pickupNeedsStaff = entry.pickup_method !== 'self';
    const dropoffNeedsStaff = entry.dropoff_method !== 'self';

    /* 迎え担当を選定（保護者送迎なら空） */
    const pickupStaff = pickupNeedsStaff
      ? selectStaff({
          workingStaff,
          shiftAssignments,
          date,
          time: pickupTime,
          areaLabel: pickupAreaLabel,
          direction: 'pickup',
          staffAssignCount,
          maxStaff: MAX_STAFF_PER_TRANSPORT,
        })
      : [];

    /* 送り担当を選定（保護者送迎なら空） */
    const dropoffStaff = dropoffNeedsStaff
      ? selectStaff({
          workingStaff,
          shiftAssignments,
          date,
          time: dropoffTime,
          areaLabel: dropoffAreaLabel,
          direction: 'dropoff',
          staffAssignCount,
          maxStaff: MAX_STAFF_PER_TRANSPORT,
        })
      : [];

    /* is_unassigned: 必要な側が空のときだけ true */
    const pickupEmpty = pickupNeedsStaff && pickupStaff.length === 0;
    const dropoffEmpty = dropoffNeedsStaff && dropoffStaff.length === 0;
    const isUnassigned = pickupEmpty || dropoffEmpty;
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
  direction,
  staffAssignCount,
  maxStaff,
}: {
  workingStaff: StaffRow[];
  shiftAssignments: ShiftAssignmentRow[];
  date: string;
  time: string | null;
  areaLabel: string | null;
  /** Phase 27-D: 迎=pickup, 送=dropoff。エリアフィルタに使う職員側カラムを切替 */
  direction: 'pickup' | 'dropoff';
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

    /* ③ エリア一致（エリア指定がある場合）。
       Phase 27-D: 迎=pickup_transport_areas, 送=dropoff_transport_areas を参照。
       両カラムが空（migration 0026 未適用 or 未設定）の場合は旧 transport_areas にフォールバック。 */
    if (areaLabel) {
      const directionAreas =
        direction === 'pickup' ? s.pickup_transport_areas : s.dropoff_transport_areas;
      const effective =
        (directionAreas && directionAreas.length > 0) ? directionAreas : s.transport_areas;
      if (effective.length > 0 && !effective.includes(areaLabel)) return false;
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

/* Phase 26: "HH:MM" または "HH:MM:SS" 形式の時刻を比較（a - b の符号） */
function compareTime(a: string, b: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return toMin(a) - toMin(b);
}
