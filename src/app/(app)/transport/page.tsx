'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  ChildTransportPatternRow,
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

/** "HH:MM:SS" → "HH:MM" */
function normTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/* Phase 28: 旧 resolvePattern は resolveEntryTransportSpec に一本化済み（lib/logic/resolveTransportSpec.ts）。 */

type UiTransportEntry = {
  scheduleEntryId: string;
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
  /** Phase 27: pickup_time / dropoff_time の組合せが児童の登録パターンに存在するか */
  isPatternRegistered: boolean;
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
  const [patterns, setPatterns] = useState<ChildTransportPatternRow[]>([]);
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
      const cJson = cRes.ok ? await cRes.json() : { children: [], patterns: [] };
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const aJson = aRes.ok ? await aRes.json() : { assignments: [] };
      const tJson = tRes.ok ? await tRes.json() : { assignments: [] };
      const tenantJson = tenantRes.ok ? await tenantRes.json() : { tenant: null };

      setStaff(sJson.staff ?? []);
      setChildren(cJson.children ?? []);
      setPatterns(cJson.patterns ?? []);
      setScheduleEntries(eJson.entries ?? []);
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
    const patternById = new Map(patterns.map((p) => [p.id, p]));
    const childById = new Map(children.map((c) => [c.id, c]));
    /* Phase 28: 児童管理の並び順（children.display_order）を正として各 entry に採番。
       API 側で order 済みの children 配列の index をそのまま順位として使う。 */
    const childOrderById = new Map(children.map((c, idx) => [c.id, idx]));
    /* Phase 28: 児童ごとにパターンをグルーピング（resolveEntryTransportSpec に渡す） */
    const patternsByChild = new Map<string, ChildTransportPatternRow[]>();
    for (const p of patterns) {
      const list = patternsByChild.get(p.child_id) ?? [];
      list.push(p);
      patternsByChild.set(p.child_id, list);
    }
    const rows = scheduleIds.map((sid) => {
      const e = entryById.get(sid)!;
      const t = assignByEntry.get(sid);
      /* Phase 28: 統一解決ヘルパー。pattern_id → mark → 時刻fallback → entry 直入力 の順で
         エリア/時刻/住所を一括解決する。既存 entries（mark 未設定）でも児童マーク × 時刻で推論され、
         テナント pickup_areas/dropoff_areas から time/address を拾える。 */
      const spec = resolveEntryTransportSpec(e, {
        child: childById.get(e.child_id),
        childPatterns: patternsByChild.get(e.child_id) ?? [],
        patternById,
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

      /* Phase 27: pickup_time / dropoff_time の組合せが児童のパターンに登録済みか判定
         （イレギュラー児童用の pattern 登録誘導バナー出し分けに使う） */
      const childPatterns = patternsByChild.get(e.child_id) ?? [];
      const pt = normTime(e.pickup_time);
      const dt = normTime(e.dropoff_time);
      const isPatternRegistered = childPatterns.some(
        (p) => normTime(p.pickup_time) === pt && normTime(p.dropoff_time) === dt,
      );

      return {
        scheduleEntryId: sid,
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
        isPatternRegistered,
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
  }, [selectedDate, scheduleEntries, transportAssignments, childNameMap, children, patterns, pickupAreas, dropoffAreas, pendingChanges]);

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
   */
  const staffAreaMarksForDay = useMemo(() => {
    const pickupResult = new Map<string, string[]>();
    const dropoffResult = new Map<string, string[]>();
    const dayEntries = scheduleEntries.filter((e) => e.date === selectedDate);
    const patternById = new Map(patterns.map((p) => [p.id, p]));
    const childById = new Map(children.map((c) => [c.id, c]));
    const patternsByChild = new Map<string, ChildTransportPatternRow[]>();
    for (const p of patterns) {
      const list = patternsByChild.get(p.child_id) ?? [];
      list.push(p);
      patternsByChild.set(p.child_id, list);
    }

    const addMark = (target: Map<string, string[]>, staffId: string, mark: string | null) => {
      if (!staffId || !mark) return;
      const arr = target.get(staffId) ?? [];
      if (!arr.includes(mark)) arr.push(mark);
      target.set(staffId, arr);
    };

    for (const entry of dayEntries) {
      /* Phase 28: areaLabel 解決は統一ヘルパーで（mark → pattern → fallback の順） */
      const spec = resolveEntryTransportSpec(entry, {
        child: childById.get(entry.child_id),
        childPatterns: patternsByChild.get(entry.child_id) ?? [],
        patternById,
        pickupAreas,
        dropoffAreas,
      });
      const pickupEmoji = spec.pickup.areaLabel ? spec.pickup.areaLabel.trim().split(' ')[0] : null;
      const dropoffEmoji = spec.dropoff.areaLabel ? spec.dropoff.areaLabel.trim().split(' ')[0] : null;

      const pending = pendingChanges.get(entry.id);
      const existing = transportAssignments.find((t) => t.schedule_entry_id === entry.id);
      const pickupIds = pending?.pickupStaffIds ?? existing?.pickup_staff_ids ?? [];
      const dropoffIds = pending?.dropoffStaffIds ?? existing?.dropoff_staff_ids ?? [];

      /* Phase 27 fix: 保護者送迎（method='self'）は担当不要。stale な staff_ids が
         残っていても迎/送マークに反映しない（🧩 保護者の絵文字が他職員に付く問題対策） */
      if (entry.pickup_method !== 'self') {
        pickupIds.forEach((sid) => addMark(pickupResult, sid, pickupEmoji));
      }
      if (entry.dropoff_method !== 'self') {
        dropoffIds.forEach((sid) => addMark(dropoffResult, sid, dropoffEmoji));
      }
    }
    return { pickup: pickupResult, dropoff: dropoffResult };
  }, [scheduleEntries, selectedDate, patterns, children, pickupAreas, dropoffAreas, pendingChanges, transportAssignments]);

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
        endTime: shift?.end_time ?? null,
        pickupAreaMarks: staffAreaMarksForDay.pickup.get(s.id) ?? [],
        dropoffAreaMarks: staffAreaMarksForDay.dropoff.get(s.id) ?? [],
      };
    });
  }, [staff, shiftAssignments, selectedDate, staffAreaMarksForDay]);

  const handleGenerate = async () => {
    try {
      let totalAssigned = 0;
      let totalUnassigned = 0;
      const errors: string[] = [];

      /* 各日付ごとに /api/transport/generate → 結果を /api/transport-assignments に upsert */
      for (const date of workDays) {
        const entriesForDate = scheduleEntries.filter((e) => e.date === date);
        if (entriesForDate.length === 0) continue; /* 利用予定なしの日はスキップ */

        const genRes = await fetch('/api/transport/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            scheduleEntries: entriesForDate,
            patterns,
            staff,
            shiftAssignments: shiftAssignments.filter((a) => a.date === date),
            minEndTime: transportMinEndTime,
            /* Phase 28: マーク解決に必要な児童・テナントエリア */
            children,
            pickupAreas,
            dropoffAreas,
            /* Phase 28: 迎のクールダウン（分） */
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

      /* 結果通知（ユーザーが何が起きたか把握できるように） */
      if (errors.length > 0) {
        alert(
          `再生成完了 (一部エラー):\n` +
          `対象 ${totalAssigned} 件 / 未割当 ${totalUnassigned} 件\n` +
          `エラー:\n${errors.slice(0, 5).join('\n')}`
        );
      } else {
        alert(
          `再生成完了: ${totalAssigned} 件の担当を再割り当てしました` +
          (totalUnassigned > 0 ? `\n（条件を満たす職員がいない: ${totalUnassigned} 件）` : '')
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '生成失敗');
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
      <Header title="送迎表" showMonthSelector />

      <div className="px-2 py-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{year}年{month}月</h2>
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
              disabled={confirmed || scheduleEntries.length === 0 || staff.length === 0}
            >
              {generated ? '再生成' : '割り当て生成'}
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
            {/* Phase 28: 日付タブは当月の全営業日を常時表示。
                利用予定/割当の有無に関わらず全日切替可能にし、
                各タブに「利用N / 割当M / 未割当赤」をラベル表示 */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'thin' }}>
              {workDays.map((date) => {
                const dayEntries = scheduleEntries.filter((e) => e.date === date);
                const hasUnassigned = (unassignedByDate.get(date) ?? 0) > 0;
                const isEmpty = dayEntries.length === 0;
                const isSelected = date === selectedDate;
                return (
                  <button
                    key={date}
                    onClick={() => handleSelectDate(date)}
                    className="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-md transition-all shrink-0"
                    style={{
                      background: isSelected
                        ? 'var(--accent)'
                        : hasUnassigned
                        ? 'var(--red-pale)'
                        : isEmpty
                        ? 'var(--bg)'
                        : 'var(--white)',
                      color: isSelected
                        ? '#fff'
                        : hasUnassigned
                        ? 'var(--red)'
                        : isEmpty
                        ? 'var(--ink-3)'
                        : 'var(--ink-2)',
                      border: `1px solid ${
                        isSelected
                          ? 'var(--accent)'
                          : hasUnassigned
                          ? 'rgba(155,51,51,0.2)'
                          : 'var(--rule)'
                      }`,
                      opacity: isEmpty && !isSelected ? 0.7 : 1,
                    }}
                  >
                    {format(new Date(date), 'M/d（E）', { locale: ja })}
                    {dayEntries.length > 0 && (
                      <span className="ml-1 opacity-70">{dayEntries.length}名</span>
                    )}
                  </button>
                );
              })}
            </div>

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
                isPatternRegistered: e.isPatternRegistered,
              }))}
              availableStaff={availableStaffForDay}
              transportMinEndTime={transportMinEndTime}
              onStaffChange={handleStaffChange}
              onAddPattern={(childName) => {
                /* Phase 27: 児童管理ページへ遷移してそのままパターン登録できるようにする
                   （名前で child_id を逆引き、anchor #pattern-new で該当パネルへスクロール） */
                const target = children.find((c) => c.name === childName);
                if (target) {
                  window.location.href = `/settings/children?child=${target.id}#pattern-new`;
                } else {
                  window.location.href = '/settings/children';
                }
              }}
              disabled={confirmed}
              /* Phase 28: 列の並び順（テナント設定） + 並び替え保存コールバック */
              columnOrder={columnOrder}
              onColumnReorder={
                myRole === 'admin' || myRole === 'editor' ? handleColumnReorder : undefined
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
