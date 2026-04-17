'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, getDaysInMonth, getDay } from 'date-fns';
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
} from '@/types';
import { DEFAULT_TRANSPORT_MIN_END_TIME } from '@/types';

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

/**
 * Phase 27-A-2 (interim): schedule_entry.pattern_id が未セットでも、
 * 児童の送迎パターン群から最適な 1 件を推定する。
 *   1. entry.pattern_id が有効ならそれを使う
 *   2. 時刻が両方一致するパターン
 *   3. pickup_time のみ一致
 *   4. dropoff_time のみ一致
 *   5. 児童の最初のパターン
 */
function resolvePattern(
  entry: ScheduleEntryRow,
  patternsByChild: Map<string, ChildTransportPatternRow[]>,
  patternById: Map<string, ChildTransportPatternRow>,
): ChildTransportPatternRow | undefined {
  if (entry.pattern_id) {
    const p = patternById.get(entry.pattern_id);
    if (p) return p;
  }
  const list = patternsByChild.get(entry.child_id) ?? [];
  if (list.length === 0) return undefined;
  const pt = normTime(entry.pickup_time);
  const dt = normTime(entry.dropoff_time);
  const exact = list.find(
    (p) => normTime(p.pickup_time) === pt && normTime(p.dropoff_time) === dt,
  );
  if (exact) return exact;
  const byPickup = list.find((p) => pt && normTime(p.pickup_time) === pt);
  if (byPickup) return byPickup;
  const byDropoff = list.find((p) => dt && normTime(p.dropoff_time) === dt);
  if (byDropoff) return byDropoff;
  return list[0];
}

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

  /* Phase 26: 日ごとの編集を一時保存する pending state（scheduleEntryId → { pickup, dropoff }） */
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingAssignment>>(new Map());
  const [saving, setSaving] = useState(false);

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));

  const workDays = useMemo(() => {
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dow = getDay(dateObj);
      if (dow !== 0 && dow !== 6) {
        days.push(format(dateObj, 'yyyy-MM-dd'));
      }
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
      /* 再取得時は pending は破棄（保存直後のクリーンアップも兼ねる） */
      setPendingChanges(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [year, month, daysInMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
  /* 自宅住所の逆引きマップ（Phase 20: 送り住所のフォールバック） */
  const childHomeAddressMap = useMemo(
    () => new Map(children.map((c) => [c.id, c.home_address])),
    [children]
  );

  /* UI 用エントリ構築: selectedDate の schedule_entries を列挙し、transport_assignments と結合 */
  const currentDayEntries: UiTransportEntry[] = useMemo(() => {
    const scheduleIds = scheduleEntries.filter((e) => e.date === selectedDate).map((e) => e.id);
    const entryById = new Map(scheduleEntries.map((e) => [e.id, e]));
    const assignByEntry = new Map(transportAssignments.map((t) => [t.schedule_entry_id, t]));
    const patternById = new Map(patterns.map((p) => [p.id, p]));
    /* Phase 27-A-2 (interim): 児童ごとにパターンをグルーピングして pattern_id=null 時のフォールバック用に渡す */
    const patternsByChild = new Map<string, ChildTransportPatternRow[]>();
    for (const p of patterns) {
      const list = patternsByChild.get(p.child_id) ?? [];
      list.push(p);
      patternsByChild.set(p.child_id, list);
    }
    /* エリアラベル → 住所 の逆引きマップ（Phase 18: 個別住所未入力時のフォールバック用） */
    const areaAddressMap = new Map<string, string>();
    for (const a of pickupAreas) {
      if (a.address) areaAddressMap.set(`${a.emoji} ${a.name}`, a.address);
    }
    for (const a of dropoffAreas) {
      if (a.address) areaAddressMap.set(`${a.emoji} ${a.name}`, a.address);
    }
    const rows = scheduleIds.map((sid) => {
      const e = entryById.get(sid)!;
      const t = assignByEntry.get(sid);
      /* 場所メモ: pattern_id が未セットでも児童の patterns からフォールバック推定 */
      const pattern = resolvePattern(e, patternsByChild, patternById);
      const pickupAreaLabel = pattern?.pickup_area_label ?? pattern?.area_label ?? null;
      const dropoffAreaLabel = pattern?.dropoff_area_label ?? null;
      /* 住所フォールバック優先順位:
           1. pattern の個別住所
           2. エリア設定の住所
           3. 送り側は児童の自宅住所 (home_address)  ← Phase 20 */
      const pickupLocation =
        pattern?.pickup_location
        || (pickupAreaLabel ? areaAddressMap.get(pickupAreaLabel) ?? null : null)
        || null;
      const dropoffLocation =
        pattern?.dropoff_location
        || (dropoffAreaLabel ? areaAddressMap.get(dropoffAreaLabel) ?? null : null)
        || childHomeAddressMap.get(e.child_id)
        || null;

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
        childName: childNameMap.get(e.child_id) ?? '(不明)',
        pickupTime: e.pickup_time,
        dropoffTime: e.dropoff_time,
        pickupLocation,
        dropoffLocation,
        pickupAreaLabel,
        dropoffAreaLabel,
        pickupStaffIds,
        dropoffStaffIds,
        isUnassigned,
        isConfirmed: t?.is_confirmed ?? false,
        pickupMethod: e.pickup_method,
        dropoffMethod: e.dropoff_method,
      };
    });
    /* Phase 27-A-2: 自動割当の並びに合わせ、pickup_time → dropoff_time → 児童名 で昇順 */
    rows.sort((a, b) => {
      const pa = a.pickupTime ?? '99:99';
      const pb = b.pickupTime ?? '99:99';
      if (pa !== pb) return pa < pb ? -1 : 1;
      const da = a.dropoffTime ?? '99:99';
      const db = b.dropoffTime ?? '99:99';
      if (da !== db) return da < db ? -1 : 1;
      return a.childName.localeCompare(b.childName, 'ja');
    });
    return rows;
  }, [selectedDate, scheduleEntries, transportAssignments, childNameMap, childHomeAddressMap, patterns, pickupAreas, dropoffAreas, pendingChanges]);

  const unassignedTotal = useMemo(() => {
    return transportAssignments.filter((t) => t.is_unassigned).length;
  }, [transportAssignments]);

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
      const pattern = resolvePattern(entry, patternsByChild, patternById);
      const pickupArea = pattern?.pickup_area_label ?? pattern?.area_label ?? null;
      const dropoffArea = pattern?.dropoff_area_label ?? null;
      const pickupEmoji = pickupArea ? pickupArea.trim().split(' ')[0] : null;
      const dropoffEmoji = dropoffArea ? dropoffArea.trim().split(' ')[0] : null;

      const pending = pendingChanges.get(entry.id);
      const existing = transportAssignments.find((t) => t.schedule_entry_id === entry.id);
      const pickupIds = pending?.pickupStaffIds ?? existing?.pickup_staff_ids ?? [];
      const dropoffIds = pending?.dropoffStaffIds ?? existing?.dropoff_staff_ids ?? [];

      pickupIds.forEach((sid) => addMark(pickupResult, sid, pickupEmoji));
      dropoffIds.forEach((sid) => addMark(dropoffResult, sid, dropoffEmoji));
    }
    return { pickup: pickupResult, dropoff: dropoffResult };
  }, [scheduleEntries, selectedDate, patterns, pendingChanges, transportAssignments]);

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
      /* 各日付ごとに /api/transport/generate → 結果を /api/transport-assignments に upsert */
      for (const date of workDays) {
        const genRes = await fetch('/api/transport/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            scheduleEntries: scheduleEntries.filter((e) => e.date === date),
            patterns,
            staff,
            shiftAssignments: shiftAssignments.filter((a) => a.date === date),
            minEndTime: transportMinEndTime,
          }),
        });
        if (!genRes.ok) continue;
        const { assignments } = await genRes.json();
        if (!Array.isArray(assignments) || assignments.length === 0) continue;

        await fetch('/api/transport-assignments', {
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
      }
      await fetchAll();
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

      <div className="p-6 overflow-y-auto">
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
        ) : generated ? (
          <>
            <div className="flex gap-1 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'thin' }}>
              {workDays.map((date) => {
                const dayAssigns = transportAssignments.filter((t) => {
                  const entry = scheduleEntries.find((e) => e.id === t.schedule_entry_id);
                  return entry?.date === date;
                });
                const hasUnassigned = dayAssigns.some((t) => t.is_unassigned);
                const isSelected = date === selectedDate;
                return (
                  <button
                    key={date}
                    onClick={() => handleSelectDate(date)}
                    className="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-md transition-all shrink-0"
                    style={{
                      background: isSelected ? 'var(--accent)' : hasUnassigned ? 'var(--red-pale)' : 'var(--white)',
                      color: isSelected ? '#fff' : hasUnassigned ? 'var(--red)' : 'var(--ink-2)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : hasUnassigned ? 'rgba(155,51,51,0.2)' : 'var(--rule)'}`,
                    }}
                  >
                    {format(new Date(date), 'M/d（E）', { locale: ja })}
                    {dayAssigns.length > 0 && (
                      <span className="ml-1 opacity-70">{dayAssigns.length}名</span>
                    )}
                  </button>
                );
              })}
            </div>

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
              }))}
              availableStaff={availableStaffForDay}
              transportMinEndTime={transportMinEndTime}
              onStaffChange={handleStaffChange}
              onAddPattern={() => {
                alert('児童管理ページで送迎パターンを編集できます');
              }}
              disabled={confirmed}
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
        ) : (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <p className="text-base font-medium mb-2" style={{ color: 'var(--ink-2)' }}>送迎担当が未生成です</p>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
              確定済みシフトと利用予定を元に送迎担当を自動割り当てします
            </p>
            <Button
              variant="app-card-cta"
              onClick={handleGenerate}
              disabled={scheduleEntries.length === 0 || staff.length === 0}
            >
              割り当て生成
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
