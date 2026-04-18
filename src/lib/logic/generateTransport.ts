import type {
  StaffRow,
  ShiftAssignmentRow,
  ScheduleEntryRow,
  ChildTransportPatternRow,
  TransportAssignmentRow,
  ChildRow,
  AreaLabel,
} from '@/types';
import {
  TRANSPORT_GROUP_TIME_WINDOW_MINUTES,
  DEFAULT_TRANSPORT_MIN_END_TIME,
  AUTO_ASSIGN_STAFF_COUNT,
  DEFAULT_PICKUP_COOLDOWN_MINUTES,
} from '@/types';
import { resolveEntryTransportSpec } from '@/lib/logic/resolveTransportSpec';

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
  /** Phase 28: マーク解決に使う児童情報。未指定なら pattern_id / 時刻 fallback のみ。 */
  children?: ChildRow[];
  /** Phase 28: テナント pickup_areas。マーク → time/address 解決に使用。 */
  pickupAreas?: AreaLabel[];
  /** Phase 28: テナント dropoff_areas。マーク → time/address 解決に使用。 */
  dropoffAreas?: AreaLabel[];
  /** Phase 28: 迎え連続担当禁止時間（分）。ある職員が pickup 担当後、この分数内は同職員を候補から除外。
      未指定はデフォルト 45 分。送り側には適用しない。 */
  pickupCooldownMinutes?: number;
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
  const children = input.children ?? [];
  const pickupAreas = input.pickupAreas ?? [];
  const dropoffAreas = input.dropoffAreas ?? [];
  const pickupCooldownMin = input.pickupCooldownMinutes ?? DEFAULT_PICKUP_COOLDOWN_MINUTES;
  const childById = new Map(children.map((c) => [c.id, c]));
  /* Phase 28: 児童ごとのパターン事前グルーピング（resolveEntryTransportSpec に渡す） */
  const patternsByChild = new Map<string, ChildTransportPatternRow[]>();
  for (const p of patterns) {
    const list = patternsByChild.get(p.child_id) ?? [];
    list.push(p);
    patternsByChild.set(p.child_id, list);
  }

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
  /* Phase 28: 職員ごとに「最後に迎を担当した pickup_time（分）」を記録し、
     クールダウン内の再アサインを防ぐ。送り側には適用しない。 */
  const lastPickupMinByStaff = new Map<string, number>();

  /* パターンをマップ化 */
  const patternMap = new Map<string, ChildTransportPatternRow>();
  patterns.forEach((p) => patternMap.set(p.id, p));

  const assignments: Omit<TransportAssignmentRow, 'id' | 'created_at'>[] = [];
  let unassignedCount = 0;

  /* Phase 28: 迎のクールダウンを時系列順に正しく評価するため、pickup_time 昇順で処理。
     送りは処理順に依存しないが、同一配列で扱ってまとめて assignments を push する。 */
  const dateEntries = scheduleEntries
    .filter((e) => e.date === date)
    .slice()
    .sort((a, b) => {
      const ap = normalizeTimeMinutes(a.pickup_time) ?? Number.MAX_SAFE_INTEGER;
      const bp = normalizeTimeMinutes(b.pickup_time) ?? Number.MAX_SAFE_INTEGER;
      return ap - bp;
    });

  /* 各利用予定に対して担当を割り当て */
  for (const entry of dateEntries) {
    /* Phase 28: 統一解決ヘルパーでエリア・時刻を決定。
       pattern_id → mark → 時刻fallback → entry 直入力、の順で解決される */
    const spec = resolveEntryTransportSpec(entry, {
      child: childById.get(entry.child_id),
      childPatterns: patternsByChild.get(entry.child_id) ?? [],
      patternById: patternMap,
      pickupAreas,
      dropoffAreas,
    });
    const pickupAreaLabel = spec.pickup.areaLabel;
    const dropoffAreaLabel = spec.dropoff.areaLabel;
    const pickupTime = spec.pickup.time;
    const dropoffTime = spec.dropoff.time;

    /* Phase 26: 保護者送迎（method='self'）は担当不要 */
    const pickupNeedsStaff = entry.pickup_method !== 'self';
    const dropoffNeedsStaff = entry.dropoff_method !== 'self';

    /* Phase 28: エリアが pattern でも mark でも解決できない児童は自動割当しない。
       unassigned のまま残して、送迎表で手動割当させる（ユーザー運用）。 */
    const pickupResolvable = pickupNeedsStaff && !!pickupAreaLabel;
    const dropoffResolvable = dropoffNeedsStaff && !!dropoffAreaLabel;

    /* 迎え担当を選定（保護者送迎なら空 / エリア未解決なら空） */
    const pickupStaff = pickupResolvable
      ? selectStaff({
          workingStaff,
          shiftAssignments,
          date,
          time: pickupTime,
          areaLabel: pickupAreaLabel,
          direction: 'pickup',
          staffAssignCount,
          /* Phase 28: 自動割当は 1 名固定。2 名目は手動で追加する運用に統一。 */
          maxStaff: AUTO_ASSIGN_STAFF_COUNT,
          /* Phase 28: 迎のクールダウン適用 */
          cooldownContext: {
            lastPickupMinByStaff,
            cooldownMinutes: pickupCooldownMin,
          },
        })
      : [];

    /* 送り担当を選定（保護者送迎なら空 / エリア未解決なら空） */
    const dropoffStaff = dropoffResolvable
      ? selectStaff({
          workingStaff,
          shiftAssignments,
          date,
          time: dropoffTime,
          areaLabel: dropoffAreaLabel,
          direction: 'dropoff',
          staffAssignCount,
          maxStaff: AUTO_ASSIGN_STAFF_COUNT,
          /* 送りにはクールダウンを適用しない */
        })
      : [];

    /* Phase 28: 迎を割り当てた職員について pickup_time を記録（次のクールダウン判定用） */
    const pickupMin = normalizeTimeMinutes(pickupTime);
    if (pickupMin !== null) {
      for (const s of pickupStaff) {
        const prev = lastPickupMinByStaff.get(s.id);
        if (prev === undefined || pickupMin > prev) {
          lastPickupMinByStaff.set(s.id, pickupMin);
        }
      }
    }

    /* is_unassigned: 必要な側が空のときだけ true。
       pickupResolvable=false でも pickupNeedsStaff=true なら unassigned 扱い。 */
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
  cooldownContext,
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
  /** Phase 28: 迎のみ渡す。直近 pickup_time（分）を職員ごとに記録し、cooldown 内を候補から除外 */
  cooldownContext?: {
    lastPickupMinByStaff: Map<string, number>;
    cooldownMinutes: number;
  };
}): StaffRow[] {
  if (!time) return [];
  const timeMin = normalizeTimeMinutes(time);

  let candidates = workingStaff.filter((s) => {
    const shift = shiftAssignments.find(
      (sa) => sa.staff_id === s.id && sa.date === date
    );
    if (!shift || !shift.start_time || !shift.end_time) return false;

    /* ② 送迎時間が勤務時間内か */
    if (!isTimeInRange(time, shift.start_time, shift.end_time)) return false;

    /* ③ エリア一致（エリア指定がある場合）。
       Phase 27-D: 迎=pickup_transport_areas, 送=dropoff_transport_areas を参照。
       両カラムが空（migration 0026 未適用 or 未設定）の場合は旧 transport_areas にフォールバック。
       Phase 27 fix: 空エリア = 「対応不可（候補から除外）」として扱う。
       未対応エリアに職員を送り込まない運用ルールをロジックで担保する。 */
    if (areaLabel) {
      const directionAreas =
        direction === 'pickup' ? s.pickup_transport_areas : s.dropoff_transport_areas;
      const effective =
        (directionAreas && directionAreas.length > 0) ? directionAreas : s.transport_areas;
      if (!effective.includes(areaLabel)) return false;
    }

    /* Phase 28: 迎のクールダウンチェック。直近 pickup_time + cooldown 以降でなければ候補外。 */
    if (cooldownContext && timeMin !== null) {
      const last = cooldownContext.lastPickupMinByStaff.get(s.id);
      if (last !== undefined && timeMin - last < cooldownContext.cooldownMinutes) {
        return false;
      }
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

/** "HH:MM" or "HH:MM:SS" → 分数。null 可 */
function normalizeTimeMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
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
