'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import Header from '@/components/layout/Header';
import TransportDayView from '@/components/transport/TransportDayView';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type {
  StaffRow,
  ChildRow,
  ScheduleEntryRow,
  ShiftAssignmentRow,
  TransportAssignmentRow,
  AreaLabel,
  TenantSettings,
  TransportColumnKey,
} from '@/types';
import { DEFAULT_TRANSPORT_MIN_END_TIME, DEFAULT_PICKUP_COOLDOWN_MINUTES, DEFAULT_TRANSPORT_COLUMN_ORDER } from '@/types';
import { resolveEntryTransportSpec } from '@/lib/logic/resolveTransportSpec';

/**
 * 送迎表ページ（Supabase 接続）
 * - 月選択 + 日別タブ
 * - 既存の transport_assignments を取得
 * - 「割り当て生成」で /api/transport/generate を呼び、結果を DB に upsert
 */

/** Phase 25: URL ?month=YYYY-MM。デフォルトは来月 */
function defaultNextMonthStr(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

type UiTransportEntry = {
  scheduleEntryId: string;
  childId: string;
  childName: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  pickupAreaLabel: string | null;
  dropoffAreaLabel: string | null;
  pickupStaffIds: string[];
  dropoffStaffIds: string[];
  isUnassigned: boolean;
  isConfirmed: boolean;
  /** Phase 26: schedule_entries.pickup_method / dropoff_method ('self'=保護者送迎) */
  pickupMethod: 'pickup' | 'self';
  dropoffMethod: 'dropoff' | 'self';
};

/** Phase 26: ローカル編集用 pending state の単位 */
type PendingAssignment = {
  pickupStaffIds: string[];
  dropoffStaffIds: string[];
};

export default function TransportPage() {
  const searchParams = useSearchParams();
  const urlMonth = searchParams.get('month');
  const { year, month } = useMemo(() => {
    const source = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : defaultNextMonthStr();
    const [y, m] = source.split('-').map(Number);
    return { year: y, month: m };
  }, [urlMonth]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntryRow[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignmentRow[]>([]);
  const [transportAssignments, setTransportAssignments] = useState<TransportAssignmentRow[]>([]);
  /* エリア設定を取得し、パターンの pickup_location/dropoff_location が未入力のときに住所をフォールバック */
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);
  /* Phase 26: 送迎担当の最低退勤時間（HH:MM）。テナント設定 or デフォルト */
  const [transportMinEndTime, setTransportMinEndTime] = useState<string>(DEFAULT_TRANSPORT_MIN_END_TIME);
  /* Phase 28: 迎のクールダウン（分）。テナント設定 or デフォルト 45 分 */
  const [pickupCooldownMinutes, setPickupCooldownMinutes] = useState<number>(DEFAULT_PICKUP_COOLDOWN_MINUTES);
  /* Phase 28: 送迎表の列順。テナント設定 or デフォルト（児童名は固定先頭なので含めない） */
  const [columnOrder, setColumnOrder] = useState<TransportColumnKey[]>(DEFAULT_TRANSPORT_COLUMN_ORDER);
  /* Phase 28: 並び替え保存後に他の設定を巻き戻さないよう、最後に取得した settings 全体を保持 */
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);
  /* Phase 28: 自分のロール（viewer は列並び替え不可） */
  const [myRole, setMyRole] = useState<'admin' | 'editor' | 'viewer' | null>(null);

  /* Phase 26: 日ごとの編集を一時保存する pending state（scheduleEntryId → { pickup, dropoff }） */
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingAssignment>>(new Map());
  const [saving, setSaving] = useState(false);

  /* 再生成のローディング状態。連打防止・進捗可視化に使用。 */
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{ current: number; total: number } | null>(null);
  /* 完了/エラー通知のトースト。4 秒で自動非表示。 */
  const [toast, setToast] = useState<{ kind: 'success' | 'warning' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));

  /* Phase 28: 当月の全日を対象にする（土日も含む。放デイは土曜利用があるため）。
     ※変数名は workDays のまま残置（他で使われているため）。 */
  const workDays = useMemo(() => {
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      days.push(format(dateObj, 'yyyy-MM-dd'));
    }
    return days;
  }, [year, month, daysInMonth]);

  const [selectedDate, setSelectedDate] = useState<string>(workDays[0] ?? '');

  useEffect(() => {
    if (!selectedDate && workDays[0]) setSelectedDate(workDays[0]);
  }, [workDays, selectedDate]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const [sRes, cRes, eRes, aRes, tRes, tenantRes] = await Promise.all([
        fetch('/api/staff'),
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${from}&to=${to}`),
        fetch(`/api/shift-assignments?from=${from}&to=${to}`),
        fetch(`/api/transport-assignments?from=${from}&to=${to}`),
        fetch('/api/tenant'),
      ]);
      const sJson = sRes.ok ? await sRes.json() : { staff: [] };
      const cJson = cRes.ok ? await cRes.json() : { children: [] };
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const aJson = aRes.ok ? await aRes.json() : { assignments: [] };
      const tJson = tRes.ok ? await tRes.json() : { assignments: [] };
      const tenantJson = tenantRes.ok ? await tenantRes.json() : { tenant: null };

      setStaff(sJson.staff ?? []);
      setChildren(cJson.children ?? []);
      /* Phase 38: 欠席児童 (attendance_status='absent') は送迎表から完全除外。
         /output/daily と挙動を揃え、出席連動で送迎担当割当の対象外とする。 */
      setScheduleEntries(
        ((eJson.entries ?? []) as ScheduleEntryRow[]).filter(
          (e) => e.attendance_status !== 'absent',
        ),
      );
      setShiftAssignments(aJson.assignments ?? []);
      setTransportAssignments(tJson.assignments ?? []);
      const settings: TenantSettings = tenantJson.tenant?.settings ?? {};
      setPickupAreas(settings.pickup_areas ?? settings.transport_areas ?? []);
      setDropoffAreas(settings.dropoff_areas ?? []);
      setTransportMinEndTime(settings.transport_min_end_time ?? DEFAULT_TRANSPORT_MIN_END_TIME);
      setPickupCooldownMinutes(settings.transport_pickup_cooldown_minutes ?? DEFAULT_PICKUP_COOLDOWN_MINUTES);
      setColumnOrder(settings.transport_column_order ?? DEFAULT_TRANSPORT_COLUMN_ORDER);
      setTenantSettings(settings);
      /* 再取得時は pending は破棄（保存直後のクリーンアップも兼ねる） */
      setPendingChanges(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [year, month, daysInMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* Phase 28: ロール取得（列並び替えの権限判定） */
  useEffect(() => {
    void fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMyRole(d.staff?.role ?? null))
      .catch(() => {});
  }, []);

  /* Phase 26: ブラウザ離脱時（タブ閉じ・リロード）に未保存警告 */
  useEffect(() => {
    if (pendingChanges.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingChanges]);

  const childNameMap = useMemo(
    () => new Map(children.map((c) => [c.id, c.name])),
    [children]
  );
  /* Phase 28: 送り先住所の home_address フォールバックは resolveEntryTransportSpec 内で吸収済み */

  /* UI 用エントリ構築: selectedDate の schedule_entries を列挙し、transport_assignments と結合 */
  const currentDayEntries: UiTransportEntry[] = useMemo(() => {
    const scheduleIds = scheduleEntries.filter((e) => e.date === selectedDate).map((e) => e.id);
    const entryById = new Map(scheduleEntries.map((e) => [e.id, e]));
    const assignByEntry = new Map(transportAssignments.map((t) => [t.schedule_entry_id, t]));
    const childById = new Map(children.map((c) => [c.id, c]));
    /* 児童管理の並び順（children.display_order）を正として各 entry に採番 */
    const childOrderById = new Map(children.map((c, idx) => [c.id, idx]));
    const rows = scheduleIds.map((sid) => {
      const e = entryById.get(sid)!;
      const t = assignByEntry.get(sid);
      /* マーク × テナント/児童専用エリアで areaLabel / time / location を解決 */
      const spec = resolveEntryTransportSpec(e, {
        child: childById.get(e.child_id),
        pickupAreas,
        dropoffAreas,
      });

      /* Phase 26: pending の編集を表示に反映（未保存分を先に見せる） */
      const pending = pendingChanges.get(sid);
      const pickupStaffIds = pending?.pickupStaffIds ?? t?.pickup_staff_ids ?? [];
      const dropoffStaffIds = pending?.dropoffStaffIds ?? t?.dropoff_staff_ids ?? [];

      /* Phase 26: 保護者送迎（method=self）は未割当扱いしない */
      const pickupNeedsStaff = e.pickup_method !== 'self';
      const dropoffNeedsStaff = e.dropoff_method !== 'self';
      const pickupEmpty = pickupNeedsStaff && pickupStaffIds.length === 0;
      const dropoffEmpty = dropoffNeedsStaff && dropoffStaffIds.length === 0;
      const isUnassigned = pickupEmpty || dropoffEmpty;

      return {
        scheduleEntryId: sid,
        childId: e.child_id,
        childName: childNameMap.get(e.child_id) ?? '(不明)',
        pickupTime: spec.pickup.time ?? e.pickup_time,
        dropoffTime: spec.dropoff.time ?? e.dropoff_time,
        pickupLocation: spec.pickup.location,
        dropoffLocation: spec.dropoff.location,
        pickupAreaLabel: spec.pickup.areaLabel,
        dropoffAreaLabel: spec.dropoff.areaLabel,
        pickupStaffIds,
        dropoffStaffIds,
        isUnassigned,
        isConfirmed: t?.is_confirmed ?? false,
        pickupMethod: e.pickup_method,
        dropoffMethod: e.dropoff_method,
      };
    });
    /* Phase 28: 児童管理の並び順（children.display_order）を最優先。
       同一児童に複数 entry がある稀なケースは pickup_time → dropoff_time で安定ソート。
       これで /schedule と /transport の児童順が完全に一致する。 */
    rows.sort((a, b) => {
      const oa = childOrderById.get(entryById.get(a.scheduleEntryId)!.child_id) ?? Number.MAX_SAFE_INTEGER;
      const ob = childOrderById.get(entryById.get(b.scheduleEntryId)!.child_id) ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      const pa = a.pickupTime ?? '99:99';
      const pb = b.pickupTime ?? '99:99';
      if (pa !== pb) return pa < pb ? -1 : 1;
      const da = a.dropoffTime ?? '99:99';
      const db = b.dropoffTime ?? '99:99';
      if (da !== db) return da < db ? -1 : 1;
      return a.childName.localeCompare(b.childName, 'ja');
    });
    return rows;
  }, [selectedDate, scheduleEntries, transportAssignments, childNameMap, children, pickupAreas, dropoffAreas, pendingChanges]);

  /**
   * Phase 28 修正: 未割当は「現在の状態」から都度計算する。
   * 旧実装は transport_assignments.is_unassigned（保存時フラグ）に依存しており、
   * (a) pending 未保存の担当変更が反映されない
   * (b) pickup_method='self' / dropoff_method='self' が後から変更された児童で
   *     古いフラグが残り赤表示が続く
   * (c) 対応する schedule_entry が削除された孤児 assignment を誤カウント
   * という 3 つのバグを抱えていたため、エントリ × pending × method で再計算する。
   */
  const unassignedByDate = useMemo(() => {
    const map = new Map<string, number>();
    const assignMap = new Map(transportAssignments.map((t) => [t.schedule_entry_id, t]));
    for (const e of scheduleEntries) {
      const assign = assignMap.get(e.id);
      if (!assign) continue; /* まだ生成されていない日は未割当カウントに含めない */
      const pending = pendingChanges.get(e.id);
      const pickupIds = pending?.pickupStaffIds ?? assign.pickup_staff_ids ?? [];
      const dropoffIds = pending?.dropoffStaffIds ?? assign.dropoff_staff_ids ?? [];
      const pickupNeedsStaff = e.pickup_method !== 'self';
      const dropoffNeedsStaff = e.dropoff_method !== 'self';
      const isUnassigned =
        (pickupNeedsStaff && pickupIds.length === 0) ||
        (dropoffNeedsStaff && dropoffIds.length === 0);
      if (isUnassigned) map.set(e.date, (map.get(e.date) ?? 0) + 1);
    }
    return map;
  }, [scheduleEntries, transportAssignments, pendingChanges]);

  const unassignedTotal = useMemo(() => {
    let total = 0;
    for (const v of unassignedByDate.values()) total += v;
    return total;
  }, [unassignedByDate]);

  const confirmed = currentDayEntries.length > 0 && currentDayEntries.every((e) => e.isConfirmed);
  const generated = transportAssignments.length > 0;

  /**
   * Phase 26.1 / 27: 職員ごとに「この日担当しているエリア絵文字」を集計。
   * 迎/送で **別々** に持つ（同じ職員でも迎担当と送担当で違うエリアを持つため）。
   *
   * Phase 38 (②): 30 分超で別便扱い。同じ職員が同じエリアの 2 便を担当する場合、
   *   時刻差 < 30 分なら 1 マーク（同便）、≧ 30 分なら 2 マーク（別便）にする。
   *   旧仕様（単純 dedup）だと 17:00 と 18:30 の便が両方 🏠 でも 1 つに見えてしまった。
   */
  const staffAreaMarksForDay = useMemo(() => {
    const pickupResult = new Map<string, string[]>();
    const dropoffResult = new Map<string, string[]>();
    const dayEntries = scheduleEntries.filter((e) => e.date === selectedDate);
    const childById = new Map(children.map((c) => [c.id, c]));
    const TRIP_GAP_MIN = 30;

    const toMin = (t: string | null): number | null => {
      if (!t) return null;
      const m = /^(\d{1,2}):(\d{2})/.exec(t);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };

    /* 一旦 (staffId → [{time, mark}]) を作る */
    const pickupRaw = new Map<string, Array<{ time: number; mark: string }>>();
    const dropoffRaw = new Map<string, Array<{ time: number; mark: string }>>();
    const pushRaw = (
      target: Map<string, Array<{ time: number; mark: string }>>,
      staffId: string,
      mark: string | null,
      time: number | null,
    ) => {
      if (!staffId || !mark || time === null) return;
      const arr = target.get(staffId) ?? [];
      arr.push({ time, mark });
      target.set(staffId, arr);
    };

    for (const entry of dayEntries) {
      const spec = resolveEntryTransportSpec(entry, {
        child: childById.get(entry.child_id),
        pickupAreas,
        dropoffAreas,
      });
      const pickupEmoji = spec.pickup.areaLabel ? spec.pickup.areaLabel.trim().split(' ')[0] : null;
      const dropoffEmoji = spec.dropoff.areaLabel ? spec.dropoff.areaLabel.trim().split(' ')[0] : null;
      const pickupMin = toMin(entry.pickup_time);
      const dropoffMin = toMin(entry.dropoff_time);

      const pending = pendingChanges.get(entry.id);
      const existing = transportAssignments.find((t) => t.schedule_entry_id === entry.id);
      const pickupIds = pending?.pickupStaffIds ?? existing?.pickup_staff_ids ?? [];
      const dropoffIds = pending?.dropoffStaffIds ?? existing?.dropoff_staff_ids ?? [];

      /* Phase 27 fix: 保護者送迎（method='self'）は担当不要 */
      if (entry.pickup_method !== 'self') {
        pickupIds.forEach((sid) => pushRaw(pickupRaw, sid, pickupEmoji, pickupMin));
      }
      if (entry.dropoff_method !== 'self') {
        dropoffIds.forEach((sid) => pushRaw(dropoffRaw, sid, dropoffEmoji, dropoffMin));
      }
    }

    /* (time, mark) を時刻順にソートし、同マーク連続で時刻差 < 30 分は 1 便にまとめる */
    const compress = (
      raw: Map<string, Array<{ time: number; mark: string }>>,
      out: Map<string, string[]>,
    ) => {
      for (const [staffId, items] of raw.entries()) {
        items.sort((a, b) => a.time - b.time);
        const acc: string[] = [];
        const lastTimeByMark = new Map<string, number>();
        for (const it of items) {
          const lt = lastTimeByMark.get(it.mark);
          if (lt === undefined || it.time - lt >= TRIP_GAP_MIN) {
            acc.push(it.mark);
          }
          lastTimeByMark.set(it.mark, it.time);
        }
        out.set(staffId, acc);
      }
    };
    compress(pickupRaw, pickupResult);
    compress(dropoffRaw, dropoffResult);

    return { pickup: pickupResult, dropoff: dropoffResult };
  }, [scheduleEntries, selectedDate, children, pickupAreas, dropoffAreas, pendingChanges, transportAssignments]);

  /* Phase 26 / 27: 当日出勤職員を迎/送両方の areaMarks 付きで UI へ渡す */
  const availableStaffForDay = useMemo(() => {
    return staff.map((s) => {
      const shift = shiftAssignments.find(
        (sa) =>
          sa.staff_id === s.id &&
          sa.date === selectedDate &&
          sa.assignment_type === 'normal'
      );
      return {
        id: s.id,
        name: s.name,
        /* Phase 28 F案: 送迎 select の短縮表示に使う */
        display_name: s.display_name ?? null,
        endTime: shift?.end_time ?? null,
        pickupAreaMarks: staffAreaMarksForDay.pickup.get(s.id) ?? [],
        dropoffAreaMarks: staffAreaMarksForDay.dropoff.get(s.id) ?? [],
      };
    });
  }, [staff, shiftAssignments, selectedDate, staffAreaMarksForDay]);

  const handleGenerate = async () => {
    if (isGenerating) return; /* 連打ガード */
    setIsGenerating(true);

    /* 実際に処理する日のみをカウント対象にして progress 分母を合わせる */
    const targetDates = workDays.filter((date) =>
      scheduleEntries.some((e) => e.date === date)
    );
    setGenerateProgress({ current: 0, total: targetDates.length });

    try {
      let totalAssigned = 0;
      let totalUnassigned = 0;
      const errors: string[] = [];

      /* 各日付ごとに /api/transport/generate → 結果を /api/transport-assignments に upsert */
      for (let i = 0; i < targetDates.length; i++) {
        const date = targetDates[i];
        setGenerateProgress({ current: i + 1, total: targetDates.length });
        const entriesForDate = scheduleEntries.filter((e) => e.date === date);

        const genRes = await fetch('/api/transport/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            scheduleEntries: entriesForDate,
            staff,
            shiftAssignments: shiftAssignments.filter((a) => a.date === date),
            minEndTime: transportMinEndTime,
            /* マーク解決に必要な児童・テナントエリア */
            children,
            pickupAreas,
            dropoffAreas,
            /* 迎のクールダウン（分） */
            pickupCooldownMinutes,
          }),
        });
        if (!genRes.ok) {
          errors.push(`${date}: 生成 API エラー`);
          continue;
        }
        const { assignments, unassignedCount } = await genRes.json();
        if (!Array.isArray(assignments) || assignments.length === 0) {
          errors.push(`${date}: 生成結果が空`);
          continue;
        }

        const upsertRes = await fetch('/api/transport-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignments: assignments.map((a: TransportAssignmentRow) => ({
              schedule_entry_id: a.schedule_entry_id,
              pickup_staff_ids: a.pickup_staff_ids,
              dropoff_staff_ids: a.dropoff_staff_ids,
              is_unassigned: a.is_unassigned,
              is_confirmed: false,
            })),
          }),
        });
        if (!upsertRes.ok) {
          const j = await upsertRes.json().catch(() => ({}));
          errors.push(`${date}: DB 保存失敗 ${j.error ?? ''}`);
          continue;
        }
        totalAssigned += assignments.length;
        totalUnassigned += unassignedCount ?? 0;
      }
      await fetchAll();

      /* 結果通知: alert の代わりに控えめなトーストを使う（21st.dev 風） */
      if (errors.length > 0) {
        setToast({
          kind: 'warning',
          message:
            `再生成完了（一部エラー）: 対象 ${totalAssigned} 件 / 未割当 ${totalUnassigned} 件` +
            ` / エラー ${errors.length} 件`,
        });
      } else {
        setToast({
          kind: 'success',
          message:
            `再生成完了: ${totalAssigned} 件の担当を再割り当てしました` +
            (totalUnassigned > 0 ? ` (未割当 ${totalUnassigned} 件)` : ''),
        });
      }
    } catch (e) {
      setToast({
        kind: 'error',
        message: e instanceof Error ? e.message : '生成失敗',
      });
    } finally {
      setIsGenerating(false);
      setGenerateProgress(null);
    }
  };

  /**
   * Phase 26: セル編集は pending state のみ更新（DB 反映は「この日の送迎を保存」ボタンで一括）
   */
  const handleStaffChange = (
    scheduleEntryId: string,
    field: 'pickup' | 'dropoff',
    staffIds: string[]
  ) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const current = next.get(scheduleEntryId);
      const existing = transportAssignments.find((t) => t.schedule_entry_id === scheduleEntryId);
      const base: PendingAssignment = current ?? {
        pickupStaffIds: existing?.pickup_staff_ids ?? [],
        dropoffStaffIds: existing?.dropoff_staff_ids ?? [],
      };
      next.set(scheduleEntryId, {
        pickupStaffIds: field === 'pickup' ? staffIds : base.pickupStaffIds,
        dropoffStaffIds: field === 'dropoff' ? staffIds : base.dropoffStaffIds,
      });
      return next;
    });
  };

  /**
   * Phase 26: 当日の pending 分を一括保存
   * - selectedDate に属する pending のみ対象
   * - 各 entry の method=self を考慮して is_unassigned を再計算
   */
  const handleSaveDay = async () => {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    try {
      const dayEntryIds = new Set(
        scheduleEntries.filter((e) => e.date === selectedDate).map((e) => e.id)
      );
      const entryById = new Map(scheduleEntries.map((e) => [e.id, e]));
      const payload: {
        schedule_entry_id: string;
        pickup_staff_ids: string[];
        dropoff_staff_ids: string[];
        is_unassigned: boolean;
        is_confirmed: boolean;
      }[] = [];

      for (const [sid, change] of pendingChanges.entries()) {
        if (!dayEntryIds.has(sid)) continue;
        const entry = entryById.get(sid);
        const existing = transportAssignments.find((t) => t.schedule_entry_id === sid);
        const pickupNeedsStaff = entry?.pickup_method !== 'self';
        const dropoffNeedsStaff = entry?.dropoff_method !== 'self';
        const pickupEmpty = pickupNeedsStaff && change.pickupStaffIds.length === 0;
        const dropoffEmpty = dropoffNeedsStaff && change.dropoffStaffIds.length === 0;
        payload.push({
          schedule_entry_id: sid,
          pickup_staff_ids: change.pickupStaffIds,
          dropoff_staff_ids: change.dropoffStaffIds,
          is_unassigned: pickupEmpty || dropoffEmpty,
          is_confirmed: existing?.is_confirmed ?? false,
        });
      }

      if (payload.length === 0) {
        setSaving(false);
        return;
      }

      const res = await fetch('/api/transport-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失敗');
      /* 保存成功したらこの日分の pending を消す（他日の pending は保持） */
      setPendingChanges((prev) => {
        const next = new Map(prev);
        for (const sid of dayEntryIds) next.delete(sid);
        return next;
      });
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失敗');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Phase 28: 列並び替えをテナント設定に永続化。PATCH /api/tenant に他の既存設定も含めて送信。
   * editor / admin のみ許可（viewer は UI 側で draggable=false）。失敗時は state を元に戻す。
   */
  const handleColumnReorder = async (next: TransportColumnKey[]) => {
    if (myRole !== 'admin' && myRole !== 'editor') return;
    const prev = columnOrder;
    setColumnOrder(next); /* 楽観更新 */
    try {
      /* 専用エンドポイント: editor も許可、他の settings を壊さず transport_column_order のみ更新 */
      const res = await fetch('/api/tenant/transport-column-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '列順の保存に失敗しました');
      /* ローカルの tenantSettings キャッシュも追随 */
      setTenantSettings((s) => ({ ...(s ?? {}), transport_column_order: next }));
    } catch (e) {
      alert(e instanceof Error ? e.message : '列順の保存に失敗');
      setColumnOrder(prev);
    }
  };

  /** 当日の pending 件数（ボタン表示・ガード判定用） */
  const pendingCountForDay = useMemo(() => {
    const ids = new Set(scheduleEntries.filter((e) => e.date === selectedDate).map((e) => e.id));
    let c = 0;
    for (const sid of pendingChanges.keys()) if (ids.has(sid)) c++;
    return c;
  }, [pendingChanges, scheduleEntries, selectedDate]);

  /**
   * 送迎表から直接「この児童の専用エリア」を登録する。
   * - children.custom_pickup_areas / custom_dropoff_areas に id 付きで追加（Phase 30）
   * - pickup_area_labels / dropoff_area_labels にも id を選択状態で追加（自動的にマーク解決が効く）
   * - admin / editor のみ実行可能
   */
  const handleAddCustomArea = async (
    childId: string,
    direction: 'pickup' | 'dropoff',
    area: { emoji: string; name: string; time: string; address: string },
  ) => {
    if (myRole !== 'admin' && myRole !== 'editor') {
      throw new Error('この操作には編集権限が必要です');
    }
    const child = children.find((c) => c.id === childId);
    if (!child) throw new Error('児童が見つかりません');

    const customKey = direction === 'pickup' ? 'custom_pickup_areas' : 'custom_dropoff_areas';
    const labelKey = direction === 'pickup' ? 'pickup_area_labels' : 'dropoff_area_labels';
    const newId = crypto.randomUUID();

    const nextCustom = [
      ...(child[customKey] ?? []),
      {
        id: newId,
        emoji: area.emoji,
        name: area.name,
        ...(area.time ? { time: area.time } : {}),
        ...(area.address ? { address: area.address } : {}),
      },
    ];
    const currentLabels = child[labelKey] ?? [];
    const nextLabels = [...currentLabels, newId];

    const res = await fetch(`/api/children/${childId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [customKey]: nextCustom, [labelKey]: nextLabels }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? '登録に失敗しました');
    }
    await fetchAll();
  };

  /** 日付切替時のガード */
  const handleSelectDate = (date: string) => {
    if (pendingCountForDay > 0) {
      const ok = confirm(`この日に未保存の変更が ${pendingCountForDay} 件あります。破棄して切り替えますか？`);
      if (!ok) return;
      setPendingChanges((prev) => {
        const next = new Map(prev);
        const ids = new Set(scheduleEntries.filter((e) => e.date === selectedDate).map((e) => e.id));
        for (const sid of ids) next.delete(sid);
        return next;
      });
    }
    setSelectedDate(date);
  };

  const handleConfirm = async () => {
    if (!confirm(`${year}年${month}月の送迎表を確定しますか？`)) return;
    await fetch('/api/transport-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments: transportAssignments.map((t) => ({
          schedule_entry_id: t.schedule_entry_id,
          pickup_staff_ids: t.pickup_staff_ids,
          dropoff_staff_ids: t.dropoff_staff_ids,
          is_unassigned: t.is_unassigned,
          is_confirmed: true,
        })),
      }),
    });
    await fetchAll();
  };

  return (
    <>
      {/* 21st.dev 風トーストのスライドイン用アニメーション。
          トーストと共にだけ必要。他ページの影響を避けるため inline style タグで同梱。 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes transport-toast-in {
              from { opacity: 0; transform: translate(-50%, -8px); }
              to   { opacity: 1; transform: translate(-50%, 0); }
            }
            @keyframes transport-spin {
              to { transform: rotate(360deg); }
            }
          `,
        }}
      />

      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

      <Header title="送迎表" showMonthSelector />

      <div className="px-2 py-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {/* Phase 38: 「年月日(曜日)」ラベル + クリックで OS 標準のカレンダーを開いて日付遷移 */}
            <DateHeaderPicker
              year={year}
              month={month}
              selectedDate={selectedDate}
              workDays={workDays}
              onChange={setSelectedDate}
            />
            {confirmed && <Badge variant="success">確定済み</Badge>}
            {generated && !confirmed && <Badge variant="warning">未確定</Badge>}
            {generated && unassignedTotal > 0 && (
              <Badge variant="error">未割当 {unassignedTotal}件</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {generated && !confirmed && (
              <Button variant="primary" onClick={handleConfirm} disabled={unassignedTotal > 0}>
                {unassignedTotal > 0 ? '未割当あり（確定不可）' : '送迎表確定'}
              </Button>
            )}
            <Button
              variant={generated ? 'secondary' : 'app-card-cta'}
              onClick={handleGenerate}
              disabled={
                isGenerating ||
                confirmed ||
                scheduleEntries.length === 0 ||
                staff.length === 0
              }
            >
              {isGenerating ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  <span>
                    生成中
                    {generateProgress && generateProgress.total > 0
                      ? ` (${generateProgress.current}/${generateProgress.total})`
                      : '…'}
                  </span>
                </span>
              ) : generated ? (
                '再生成'
              ) : (
                '割り当て生成'
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
        ) : (
          <>
            {/* Phase 39: 日付タブ列は撤去（横長で煩雑）。日付遷移はヘッダーの DateHeaderPicker（📅）に集約 */}

            {!generated && scheduleEntries.length > 0 && (
              <div
                className="mb-4 px-4 py-3 rounded"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--rule)',
                  color: 'var(--ink-3)',
                  fontSize: '0.85rem',
                }}
              >
                送迎担当が未生成です。上部「割り当て生成」で自動割り当て、または下のドロップダウンで手動割当できます。
              </div>
            )}

            <TransportDayView
              children={currentDayEntries.map((e) => ({
                id: e.scheduleEntryId,
                scheduleEntryId: e.scheduleEntryId,
                childId: e.childId,
                name: e.childName,
                pickupTime: e.pickupTime,
                dropoffTime: e.dropoffTime,
                pickupLocation: e.pickupLocation,
                dropoffLocation: e.dropoffLocation,
                pickupAreaLabel: e.pickupAreaLabel,
                dropoffAreaLabel: e.dropoffAreaLabel,
                pickupStaffIds: e.pickupStaffIds,
                dropoffStaffIds: e.dropoffStaffIds,
                isUnassigned: e.isUnassigned,
                pickupMethod: e.pickupMethod,
                dropoffMethod: e.dropoffMethod,
              }))}
              availableStaff={availableStaffForDay}
              transportMinEndTime={transportMinEndTime}
              onStaffChange={handleStaffChange}
              disabled={confirmed}
              /* Phase 28: 列の並び順（テナント設定） + 並び替え保存コールバック */
              columnOrder={columnOrder}
              onColumnReorder={
                myRole === 'admin' || myRole === 'editor' ? handleColumnReorder : undefined
              }
              /* Phase 29+: 送迎表からその場で児童専用エリアを登録（admin/editor のみ） */
              onAddCustomArea={
                myRole === 'admin' || myRole === 'editor' ? handleAddCustomArea : undefined
              }
            />

            {/* Phase 26: 日ごとの保存ボタン */}
            <div className="flex items-center justify-end gap-3 mt-4">
              {pendingCountForDay > 0 && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  未保存 {pendingCountForDay} 件
                </span>
              )}
              <Button
                variant="primary"
                onClick={handleSaveDay}
                disabled={saving || pendingCountForDay === 0 || confirmed}
              >
                {saving
                  ? '保存中...'
                  : pendingCountForDay > 0
                  ? `この日の送迎を保存（${pendingCountForDay}件）`
                  : 'この日の送迎を保存'}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** 再生成ボタン内の小スピナー（currentColor 追従で button バリアントを問わず馴染む） */
function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'transport-spin 0.7s linear infinite' }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 21st.dev 風の完了/エラー通知トースト。画面上部中央に 4 秒だけ表示。 */
function ToastBanner({
  toast,
  onClose,
}: {
  toast: { kind: 'success' | 'warning' | 'error'; message: string };
  onClose: () => void;
}) {
  const accent =
    toast.kind === 'success'
      ? { border: 'rgba(42,122,82,0.28)', icon: '✓', iconColor: 'rgb(28,90,60)' }
      : toast.kind === 'warning'
        ? { border: 'rgba(200,140,30,0.32)', icon: '⚠', iconColor: 'rgb(160,110,20)' }
        : { border: 'rgba(200,50,50,0.32)', icon: '✕', iconColor: 'rgb(170,40,40)' };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[100] flex items-start gap-3"
      style={{
        top: '18px',
        left: '50%',
        maxWidth: 'min(520px, calc(100vw - 24px))',
        padding: '12px 16px',
        background: '#fff',
        border: `1px solid ${accent.border}`,
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
        animation: 'transport-toast-in 200ms ease-out',
        fontSize: '0.875rem',
        lineHeight: 1.5,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: accent.iconColor,
          fontSize: '1rem',
          fontWeight: 700,
          lineHeight: 1.25,
          marginTop: '1px',
        }}
      >
        {accent.icon}
      </span>
      <span style={{ color: 'var(--ink)', fontWeight: 500, flex: 1 }}>{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="通知を閉じる"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          fontSize: '0.9rem',
          lineHeight: 1,
          padding: '2px 4px',
          marginLeft: '4px',
        }}
      >
        ×
      </button>
    </div>
  );
}


/* Phase 38: 「年月日(曜日)」表示 + クリックでネイティブカレンダーを開く日付ピッカー。
   ヘッダーの長い日付タブ列が伸びても、ここから直接日付ジャンプ可能。 */
function DateHeaderPicker({
  year,
  month,
  selectedDate,
  workDays,
  onChange,
}: {
  year: number;
  month: number;
  selectedDate: string;
  workDays: string[];
  onChange: (d: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];

  let label = `${year}年${month}月`;
  if (selectedDate) {
    const dt = new Date(selectedDate);
    if (!isNaN(dt.getTime())) {
      label = `${year}年${month}月${dt.getDate()}日（${DOW[dt.getDay()]}）`;
    }
  }

  const minDate = workDays[0] ?? `${year}-${String(month).padStart(2, '0')}-01`;
  const maxDate = workDays[workDays.length - 1] ?? minDate;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => {
          const el = inputRef.current;
          if (!el) return;
          if (typeof el.showPicker === 'function') el.showPicker();
          else el.click();
        }}
        className="text-lg font-bold inline-flex items-center gap-2 cursor-pointer transition-all"
        style={{
          color: 'var(--ink)',
          background: 'var(--white)',
          border: '1.5px solid var(--accent)',
          borderRadius: '8px',
          padding: '6px 14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent-pale)';
          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.10)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--white)';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        }}
        title="日付を選択して遷移"
        aria-label={`${label} の日付を変更`}
      >
        <span>{label}</span>
        <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>📅</span>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={selectedDate}
        min={minDate}
        max={maxDate}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange(v);
        }}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

