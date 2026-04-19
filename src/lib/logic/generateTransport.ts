import type {
  StaffRow,
  ShiftAssignmentRow,
  ScheduleEntryRow,
  TransportAssignmentRow,
  ChildRow,
  AreaLabel,
} from '@/types';
import {
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
 * 4. 同一エリア・同一方向で、前便との間隔が 30 分未満の場合はグルーピング
 *    → 同グループ内の児童は同じ職員が担当（同便＝同一トリップ扱い）
 *    → 30 分以上空いたら別便扱いで新規に職員を選定
 * 5. 1日の送迎回数（トリップ単位）が均等になるよう分散
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
  staff: StaffRow[];
  shiftAssignments: ShiftAssignmentRow[];
  /** Phase 26: この時刻以降に退勤する職員のみ候補。"HH:MM"。省略時 "16:31" */
  minEndTime?: string;
  /** マーク解決に使う児童情報 */
  children?: ChildRow[];
  /** テナント pickup_areas。マーク → time/address 解決に使用。 */
  pickupAreas?: AreaLabel[];
  /** テナント dropoff_areas。マーク → time/address 解決に使用。 */
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
  const { tenantId, date, scheduleEntries, staff, shiftAssignments } = input;
  /* Phase 47 (②): minEndTime によるグローバルな退勤時刻フィルタは廃止。
     旧仕様だと「16:30 までしか勤務しない職員」がお迎え便にも出てこないバグがあった。
     代わりに送り便側だけで「退勤時刻 > 便発時刻」（厳密）を後段で判定する。
     props は API 互換のため残置。 */
  void input.minEndTime;
  void DEFAULT_TRANSPORT_MIN_END_TIME;
  const children = input.children ?? [];
  const pickupAreas = input.pickupAreas ?? [];
  const dropoffAreas = input.dropoffAreas ?? [];
  const pickupCooldownMin = input.pickupCooldownMinutes ?? DEFAULT_PICKUP_COOLDOWN_MINUTES;
  const childById = new Map(children.map((c) => [c.id, c]));

  /* ① 出勤している職員のみ抽出（end_time が記録されている職員）。
     退勤時刻ガードは送り便のみ selectStaff 内で適用する。 */
  const workingStaff = staff.filter((s) => {
    const shift = shiftAssignments.find(
      (sa) => sa.staff_id === s.id && sa.date === date && sa.assignment_type === 'normal'
    );
    return !!(shift && shift.end_time);
  });

  /* 職員ごとの送迎担当回数（均等分散用、トリップ単位）。
     同一グループ(同エリア・同時間帯)の児童は同じ職員が担当するため、
     グループ新規作成時のみカウントを増やし、再利用時は増やさない。 */
  const staffAssignCount = new Map<string, number>();
  workingStaff.forEach((s) => staffAssignCount.set(s.id, 0));
  /* Phase 28: 職員ごとに「最後に迎を担当した pickup_time（分）」を記録し、
     クールダウン内の再アサインを防ぐ。送り側には適用しない。 */
  const lastPickupMinByStaff = new Map<string, number>();

  /* グルーピング記録: 同一 (direction, areaId) で、グループ内の既存便との時刻差が
     SEPARATE_TRIP_GAP_MINUTES 未満なら「同便」として職員を再利用する。
     30 分以上空いた場合は「別便」として新規にグループ（新規職員選定）を作る。
     運用イメージ: 同一スタッフが「行って帰ってまた行く」のを別便としてカウントするため、
     前便の時刻から 30 分以上経過していれば別トリップとして扱う。
     CLAUDE.md §8 ルール #4 の実装。 */
  const SEPARATE_TRIP_GAP_MINUTES = 30;
  type GroupRecord = {
    direction: 'pickup' | 'dropoff';
    areaId: string;
    /** グループ内で最も新しい時刻（分）。次エントリとの差が <30 分なら同便。 */
    latestTimeMin: number;
    staff: StaffRow[];
  };
  const groupAssignments: GroupRecord[] = [];
  /** 既存グループの中で (direction, areaId) が一致し、時刻差が <30 分のものを返す。
      該当が複数ある場合は最も時刻が近い（最後に更新された）グループを返す。 */
  function findMatchingGroup(
    direction: 'pickup' | 'dropoff',
    areaId: string | null,
    timeMin: number | null
  ): GroupRecord | null {
    if (!areaId || timeMin === null) return null;
    let best: GroupRecord | null = null;
    let bestDiff = SEPARATE_TRIP_GAP_MINUTES;
    for (const g of groupAssignments) {
      if (g.direction !== direction || g.areaId !== areaId) continue;
      const diff = Math.abs(g.latestTimeMin - timeMin);
      if (diff < bestDiff) {
        best = g;
        bestDiff = diff;
      }
    }
    return best;
  }

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
    /* マーク × テナント/児童専用エリアで areaLabel / time を解決 */
    const spec = resolveEntryTransportSpec(entry, {
      child: childById.get(entry.child_id),
      pickupAreas,
      dropoffAreas,
    });
    const pickupAreaId = spec.pickup.areaId;
    const dropoffAreaId = spec.dropoff.areaId;
    const pickupTime = spec.pickup.time;
    const dropoffTime = spec.dropoff.time;

    /* Phase 26: 保護者送迎（method='self'）は担当不要 */
    const pickupNeedsStaff = entry.pickup_method !== 'self';
    const dropoffNeedsStaff = entry.dropoff_method !== 'self';

    /* エリアがマークで解決できない児童は自動割当しない。
       unassigned のまま残して、送迎表で手動割当させる（ユーザー運用）。 */
    const pickupResolvable = pickupNeedsStaff && !!pickupAreaId;
    const dropoffResolvable = dropoffNeedsStaff && !!dropoffAreaId;

    /* 迎え担当を選定（保護者送迎なら空 / エリア未解決なら空）。
       ルール #4: 同エリア・前便との間隔<30分なら同便扱いで職員を再利用。 */
    const pickupTimeMin = normalizeTimeMinutes(pickupTime);
    let pickupStaff: StaffRow[] = [];
    if (pickupResolvable) {
      const matched = findMatchingGroup('pickup', pickupAreaId, pickupTimeMin);
      if (matched) {
        pickupStaff = matched.staff;
        /* グループの最新時刻を更新（次エントリとの間隔判定用） */
        if (pickupTimeMin !== null && pickupTimeMin > matched.latestTimeMin) {
          matched.latestTimeMin = pickupTimeMin;
        }
      } else {
        pickupStaff = selectStaff({
          workingStaff,
          shiftAssignments,
          date,
          time: pickupTime,
          areaId: pickupAreaId,
          direction: 'pickup',
          staffAssignCount,
          /* Phase 28: 自動割当は 1 名固定。2 名目は手動で追加する運用に統一。 */
          maxStaff: AUTO_ASSIGN_STAFF_COUNT,
          /* Phase 28: 迎のクールダウン適用 */
          cooldownContext: {
            lastPickupMinByStaff,
            cooldownMinutes: pickupCooldownMin,
          },
        });
        if (pickupStaff.length > 0 && pickupAreaId && pickupTimeMin !== null) {
          groupAssignments.push({
            direction: 'pickup',
            areaId: pickupAreaId,
            latestTimeMin: pickupTimeMin,
            staff: pickupStaff,
          });
        }
      }
    }

    /* 送り担当を選定（保護者送迎なら空 / エリア未解決なら空）。
       ルール #4: 同エリア・前便との間隔<30分なら同便扱いで職員を再利用。 */
    const dropoffTimeMin = normalizeTimeMinutes(dropoffTime);
    let dropoffStaff: StaffRow[] = [];
    if (dropoffResolvable) {
      const matched = findMatchingGroup('dropoff', dropoffAreaId, dropoffTimeMin);
      if (matched) {
        dropoffStaff = matched.staff;
        if (dropoffTimeMin !== null && dropoffTimeMin > matched.latestTimeMin) {
          matched.latestTimeMin = dropoffTimeMin;
        }
      } else {
        dropoffStaff = selectStaff({
          workingStaff,
          shiftAssignments,
          date,
          time: dropoffTime,
          areaId: dropoffAreaId,
          direction: 'dropoff',
          staffAssignCount,
          maxStaff: AUTO_ASSIGN_STAFF_COUNT,
          /* 送りにはクールダウンを適用しない */
        });
        if (dropoffStaff.length > 0 && dropoffAreaId && dropoffTimeMin !== null) {
          groupAssignments.push({
            direction: 'dropoff',
            areaId: dropoffAreaId,
            latestTimeMin: dropoffTimeMin,
            staff: dropoffStaff,
          });
        }
      }
    }

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
      /* Phase 45: 自動生成は常に lock=false で出力（既存ロックは handleGenerate 側でスキップ済） */
      is_locked: false,
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
  areaId,
  direction,
  staffAssignCount,
  maxStaff,
  cooldownContext,
}: {
  workingStaff: StaffRow[];
  shiftAssignments: ShiftAssignmentRow[];
  date: string;
  time: string | null;
  /** Phase 30: AreaLabel.id（職員 transport_areas との比較キー） */
  areaId: string | null;
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

  const candidates = workingStaff.filter((s) => {
    const shift = shiftAssignments.find(
      (sa) => sa.staff_id === s.id && sa.date === date
    );
    if (!shift || !shift.start_time || !shift.end_time) return false;

    /* ② 送迎時間が勤務時間内か */
    if (!isTimeInRange(time, shift.start_time, shift.end_time)) return false;

    /* Phase 47 (②): 送り便は退勤時刻ジャストの職員を除外（厳密 end_time > dropoff_time）。
       16:30 発の送り便に 16:30 退勤の職員を当てると、退勤後に時間外運転を強いることになる。
       事業所が「+1 分」設定をしなくても、ロジック側で自動的に弾く。
       お迎え便にはこのガードを掛けない（早朝出勤のお迎え担当は退勤時刻と無関係）。 */
    if (direction === 'dropoff' && timeMin !== null) {
      const endMin = normalizeTimeMinutes(shift.end_time);
      if (endMin === null || endMin <= timeMin) return false;
    }

    /* ③ エリア一致（エリア指定がある場合）。
       Phase 27-D: 迎=pickup_transport_areas, 送=dropoff_transport_areas を参照。
       両カラムが空（migration 0026 未適用 or 未設定）の場合は旧 transport_areas にフォールバック。
       Phase 27 fix: 空エリア = 「対応不可（候補から除外）」として扱う。
       Phase 30: 比較キーは AreaLabel.id（テナント設定上の uuid）。 */
    if (areaId) {
      const directionAreas =
        direction === 'pickup' ? s.pickup_transport_areas : s.dropoff_transport_areas;
      const effective =
        (directionAreas && directionAreas.length > 0) ? directionAreas : s.transport_areas;
      if (!effective.includes(areaId)) return false;
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
