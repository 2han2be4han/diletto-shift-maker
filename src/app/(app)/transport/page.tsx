'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { format, getDaysInMonth } from 'date-fns';
import { useTransportDate } from '@/hooks/useTransportDate';
import { isDateOutOfRange } from '@/lib/date/dateLimit';
import DateStepper from '@/components/ui/DateStepper';
import type { DayState } from '@/components/ui/DatePopover';
import MonthStatusBadge from '@/components/ui/MonthStatusBadge';
import { buildPickerItems } from '@/components/transport/AddShiftStaffPicker';
import { ja } from 'date-fns/locale';
import Header from '@/components/layout/Header';
import TransportDayView from '@/components/transport/TransportDayView';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type {
  StaffRow,
  ChildRow,
  ScheduleEntryRow,
  ShiftAssignmentRow,
  TransportAssignmentRow,
  AreaLabel,
  TenantSettings,
  TransportColumnKey,
  ChildAreaEligibleStaffRow,
} from '@/types';
import { DEFAULT_TRANSPORT_MIN_END_TIME, DEFAULT_PICKUP_COOLDOWN_MINUTES, DEFAULT_TRANSPORT_COLUMN_ORDER } from '@/types';
import { resolveEntryTransportSpec } from '@/lib/logic/resolveTransportSpec';
import { useCurrentStaff } from '@/components/layout/AppShell';

/**
 * 送迎表ページ（Supabase 接続）
 * - 月選択 + 日別タブ
 * - 既存の transport_assignments を取得
 * - 「割り当て生成」で /api/transport/generate を呼び、結果を DB に upsert
 */

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
  pickupAreaId: string | null;
  dropoffAreaId: string | null;
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
  /* Phase 56: 日付状態は useTransportDate で URL 唯一の真実として扱う。
     selectedDate の useState/useEffect 同期は廃止（drift を構造的に不可能にする）。 */
  const { year, month, date: selectedDate, setDate: setSelectedDate } = useTransportDate();
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
  /* Phase 60: 児童専用エリアごとの担当可能職員（全テナント分）。対応外警告に使う */
  const [childAreaEligibleStaff, setChildAreaEligibleStaff] = useState<
    ChildAreaEligibleStaffRow[]
  >([]);
  /* Phase 26: 送迎担当の最低退勤時間（HH:MM）。テナント設定 or デフォルト */
  const [transportMinEndTime, setTransportMinEndTime] = useState<string>(DEFAULT_TRANSPORT_MIN_END_TIME);
  /* Phase 28: 迎のクールダウン（分）。テナント設定 or デフォルト 45 分 */
  const [pickupCooldownMinutes, setPickupCooldownMinutes] = useState<number>(DEFAULT_PICKUP_COOLDOWN_MINUTES);
  /* Phase 28: 送迎表の列順。テナント設定 or デフォルト（児童名は固定先頭なので含めない） */
  const [columnOrder, setColumnOrder] = useState<TransportColumnKey[]>(DEFAULT_TRANSPORT_COLUMN_ORDER);
  /* Phase 28: 並び替え保存後に他の設定を巻き戻さないよう、最後に取得した settings 全体を保持 */
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);
  /* Phase 28: 自分のロール（viewer は列並び替え不可）。
     Phase 61-7: /api/me の独自 fetch を撤廃し、SSR 済みの useCurrentStaff() を使う。
     これにより初期表示時にロール null でレンダされる一瞬のちらつきを解消。 */
  const { staff: currentStaff } = useCurrentStaff();
  const myRole: 'admin' | 'editor' | 'viewer' | null = currentStaff?.role ?? null;

  /* Phase 51: シフト追加モーダル。送迎表作成中に「この職員この日出勤できる」と気づいた時に
     シフト画面へ移動せずその場でシフトを追加する導線。
     分割シフト（Phase 50）対応: 既存セグメントがある職員には segment_order を自動採番。 */
  const [addShiftModal, setAddShiftModal] = useState<{
    /** Phase 59-fix: 2 ステップフロー。'pick'=職員選択、'time'=時間入力 */
    step: 'pick' | 'time';
    staffId: string;
    startTime: string;
    endTime: string;
    saving: boolean;
    errorMsg: string;
  } | null>(null);

  /* Phase 26: 日ごとの編集を一時保存する pending state（scheduleEntryId → { pickup, dropoff }） */
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingAssignment>>(new Map());
  const [saving, setSaving] = useState(false);

  /* Phase 47 (③): 未保存の編集内容を localStorage に永続化し、リロードしても復元できるようにする。
     キーは月単位（テナント切替時は他テナントの未保存値が混ざる懸念があるが、
     現状 1 ブラウザ = 1 テナント運用なのでキー設計はシンプルに保つ）。 */
  const pendingStorageKey = `shiftpuzzle:transport:pending:${year}-${String(month).padStart(2, '0')}`;
  /* マウント直後に localStorage から pending を復元（fetchAll のクリアより前に効くよう、初回のみ実行） */
  const restoredFromStorageRef = useRef(false);
  useEffect(() => {
    if (restoredFromStorageRef.current) return;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(pendingStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, PendingAssignment>;
        const restored = new Map<string, PendingAssignment>(Object.entries(parsed));
        if (restored.size > 0) setPendingChanges(restored);
      }
    } catch {
      /* 破損キャッシュは無視 */
    } finally {
      restoredFromStorageRef.current = true;
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pendingStorageKey]);
  /* pending が変わるたびに localStorage に書き戻す（空 Map のときはキー削除） */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!restoredFromStorageRef.current) return; /* 復元前の上書きを防ぐ */
    try {
      if (pendingChanges.size === 0) {
        window.localStorage.removeItem(pendingStorageKey);
      } else {
        const obj: Record<string, PendingAssignment> = {};
        for (const [k, v] of pendingChanges.entries()) obj[k] = v;
        window.localStorage.setItem(pendingStorageKey, JSON.stringify(obj));
      }
    } catch {
      /* quota 超過などは無視 */
    }
  }, [pendingChanges, pendingStorageKey]);

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
  /* Phase 57: カレンダーポップオーバー用。日付ごとの状態（編集中 / 🔒保存済 / ⚠未割当）を派生。
     scheduleEntries と transportAssignments を join して、entry.date キーに集約。
     さらに pendingChanges をオーバレイし、未保存編集がある日は editing=true とする
     （保存済マークを隠して「編集中」を優先表示。「編集 = 自動ロック解除」の UI 表現）。 */
  const dayStates = useMemo<Map<string, DayState>>(() => {
    const m = new Map<string, DayState>();
    const entryDateById = new Map<string, string>();
    for (const e of scheduleEntries) entryDateById.set(e.id, e.date);
    for (const t of transportAssignments) {
      const date = entryDateById.get(t.schedule_entry_id);
      if (!date) continue;
      const cur = m.get(date) ?? {};
      if (t.is_locked) cur.locked = true;
      if (t.is_unassigned) cur.unassigned = true;
      m.set(date, cur);
    }
    for (const entryId of pendingChanges.keys()) {
      const date = entryDateById.get(entryId);
      if (!date) continue;
      const cur = m.get(date) ?? {};
      cur.editing = true;
      m.set(date, cur);
    }
    return m;
  }, [scheduleEntries, transportAssignments, pendingChanges]);

  const workDays = useMemo(() => {
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      days.push(format(dateObj, 'yyyy-MM-dd'));
    }
    return days;
  }, [year, month, daysInMonth]);

  /* Phase 56: selectedDate は useTransportDate が URL から派生。
     ここに同期 useEffect は不要（drift 不可能な構造）。 */

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      let sJson, cJson, eJson, aJson, tJson, tenantJson, elJson;
      let isAggregatedSuccess = false;

      try {
        const aggRes = await fetch(`/api/transport-page-data?from=${from}&to=${to}`);
        if (aggRes.ok) {
          const json = await aggRes.json();
          sJson = { staff: json.staff ?? [] };
          cJson = { children: json.children ?? [] };
          eJson = { entries: json.entries ?? [] };
          aJson = { assignments: json.shiftAssignments ?? [] };
          tJson = { assignments: json.transportAssignments ?? [] };
          tenantJson = { tenant: json.tenant ?? null };
          elJson = { items: json.eligibilityItems ?? [] };
          isAggregatedSuccess = true;
        }
      } catch (e) {
        /* フォールバックへ移行 */
      }

      if (!isAggregatedSuccess) {
        const [sRes, cRes, eRes, aRes, tRes, tenantRes, elRes] = await Promise.all([
          fetch('/api/staff?dto=transport'),
          fetch('/api/children?dto=transport'),
          fetch(`/api/schedule-entries?from=${from}&to=${to}&dto=transport`),
          fetch(`/api/shift-assignments?from=${from}&to=${to}&dto=transport`),
          fetch(`/api/transport-assignments?from=${from}&to=${to}`),
          fetch('/api/tenant'),
          fetch('/api/child-area-eligibility?dto=transport'),
        ]);
        sJson = sRes.ok ? await sRes.json() : { staff: [] };
        cJson = cRes.ok ? await cRes.json() : { children: [] };
        eJson = eRes.ok ? await eRes.json() : { entries: [] };
        aJson = aRes.ok ? await aRes.json() : { assignments: [] };
        tJson = tRes.ok ? await tRes.json() : { assignments: [] };
        tenantJson = tenantRes.ok ? await tenantRes.json() : { tenant: null };
        elJson = elRes.ok ? await elRes.json() : { items: [] };
      }

      setChildAreaEligibleStaff(elJson.items ?? []);

      setStaff(sJson.staff ?? []);
      setChildren(cJson.children ?? []);
      /* 送迎表で出さないものを除外。
         - 欠席 (attendance_status='absent'): お金は発生するが送迎は不要
         - お休み (attendance_status='leave'): 送迎も不要
         - times 両方 null（旧データ互換のお休み扱い）
         どれも送迎担当を割り当てる必要がない entry なので /transport から弾く。 */
      setScheduleEntries(
        ((eJson.entries ?? []) as ScheduleEntryRow[]).filter((e) => {
          if (e.attendance_status === 'absent') return false;
          if (e.attendance_status === 'leave') return false;
          if (!e.pickup_time && !e.dropoff_time) return false;
          return true;
        }),
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
      /* Phase 47 (③): pending は fetchAll では消さない（localStorage からの復元値を保護）。
         クリアが必要なタイミング（保存後・生成後・確定後）は呼び出し側で setPendingChanges を明示する。 */
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [year, month, daysInMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* Phase 61-7: ロール取得は useCurrentStaff() (SSR 済み Context) に置換したため
     独自 fetch('/api/me') は撤廃。 */

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
        pickupAreaId: spec.pickup.areaId,
        dropoffAreaId: spec.dropoff.areaId,
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

    /* O(1) 参照用に Map を事前作成 */
    const assignByEntryId = new Map(transportAssignments.map((t) => [t.schedule_entry_id, t]));

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
      const existing = assignByEntryId.get(entry.id);
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

  /* Phase 26 / 27: 当日出勤職員を迎/送両方の areaMarks 付きで UI へ渡す
     Phase 50: 分割シフト対応。複数セグメントがある場合、endTime は最遅の end_time を採用
     （「退勤時刻」表示として自然な最終勤務終了を示す）。 */
  const availableStaffForDay = useMemo(() => {
    /* 職員ごとのシフトを事前に Map 化し O(1) で参照できるようにする */
    const shiftByStaffId = new Map<string, ShiftAssignmentRow[]>();
    for (const sa of shiftAssignments) {
      if (sa.date === selectedDate && sa.assignment_type === 'normal' && !!sa.end_time) {
        const arr = shiftByStaffId.get(sa.staff_id) ?? [];
        arr.push(sa);
        shiftByStaffId.set(sa.staff_id, arr);
      }
    }

    return staff.map((s) => {
      const daySegments = shiftByStaffId.get(s.id) ?? [];
      const latestEndTime =
        daySegments.length === 0
          ? null
          : daySegments.reduce<string | null>((acc, sa) => {
              if (!acc) return sa.end_time;
              return (sa.end_time as string) > acc ? (sa.end_time as string) : acc;
            }, null);
      /* Phase 60: 分割シフト対応で全セグメントを UI 側に渡す。
         便時刻が「いずれかのセグメントに収まる & 退勤まで 30 分以上余裕」を
         満たすかで候補判定する（TransportDayView）。 */
      const segments = daySegments
        .filter((sa) => sa.start_time && sa.end_time)
        .map((sa) => ({ startTime: sa.start_time as string, endTime: sa.end_time as string }));
      return {
        id: s.id,
        name: s.name,
        /* Phase 28 F案: 送迎 select の短縮表示に使う */
        display_name: s.display_name ?? null,
        endTime: latestEndTime,
        segments,
        pickupAreaMarks: staffAreaMarksForDay.pickup.get(s.id) ?? [],
        dropoffAreaMarks: staffAreaMarksForDay.dropoff.get(s.id) ?? [],
        /* Phase 59: 運転手/付き添いフラグを StaffSelect のスロット別フィルタに伝える */
        isDriver: s.is_driver,
        isAttendant: s.is_attendant,
        /* Phase 60: エリア対応可否。空なら旧 transport_areas にフォールバック（generateTransport と同条件）。 */
        pickupAreaIds:
          s.pickup_transport_areas && s.pickup_transport_areas.length > 0
            ? s.pickup_transport_areas
            : s.transport_areas,
        dropoffAreaIds:
          s.dropoff_transport_areas && s.dropoff_transport_areas.length > 0
            ? s.dropoff_transport_areas
            : s.transport_areas,
      };
    });
  }, [staff, shiftAssignments, selectedDate, staffAreaMarksForDay]);

  const handleGenerate = async () => {
    if (isGenerating) return; /* 連打ガード */
    setIsGenerating(true);

    /* Phase 45: 「保存」でロックされた日 (is_locked=true を 1 件でも持つ日付) は再生成対象外。
       転送の中身を直接職員が編集している意思表示なので、自動再生成で潰さない。
       強制再生成は将来の Phase で対応 (個別ロック解除 or 強制ボタン)。 */
    const lockedEntryIds = new Set(
      transportAssignments.filter((t) => t.is_locked).map((t) => t.schedule_entry_id),
    );
    const lockedDates = new Set<string>();
    for (const e of scheduleEntries) {
      if (lockedEntryIds.has(e.id)) lockedDates.add(e.date);
    }

    /* 実際に処理する日のみをカウント対象にして progress 分母を合わせる */
    const targetDates = workDays.filter(
      (date) => scheduleEntries.some((e) => e.date === date) && !lockedDates.has(date),
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
      /* Phase 47 (③): 再生成は DB を上書きするので pending を全破棄（ローカルキャッシュも消える） */
      setPendingChanges(new Map());
      await fetchAll();

      /* 結果通知: alert の代わりに控えめなトーストを使う（21st.dev 風） */
      const lockedSuffix =
        lockedDates.size > 0 ? ` ／ 🔒 保存済 ${lockedDates.size} 日はスキップ` : '';
      if (errors.length > 0) {
        setToast({
          kind: 'warning',
          message:
            `再生成完了（一部エラー）: 対象 ${totalAssigned} 件 / 未割当 ${totalUnassigned} 件` +
            ` / エラー ${errors.length} 件${lockedSuffix}`,
        });
      } else {
        setToast({
          kind: 'success',
          message:
            `再生成完了: ${totalAssigned} 件の担当を再割り当てしました` +
            (totalUnassigned > 0 ? ` (未割当 ${totalUnassigned} 件)` : '') +
            lockedSuffix,
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
        is_locked: boolean;
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
          /* Phase 45: 手動保存はロック扱い。次回再生成でこの日をスキップ */
          is_locked: true,
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

  /**
   * Phase 51: 送迎表から当日シフトを追加する。
   * - admin / editor のみ許可
   * - 同一 (staff, date) に既存セグメントがあれば segment_order を採番（分割シフト = Phase 50）
   * - 基本時間外（早朝・夜間）も入力可能。チェックはしない（運用上スポット出勤もあり得るため）
   */
  const handleSaveAddShift = async () => {
    if (!addShiftModal) return;
    if (myRole !== 'admin' && myRole !== 'editor') {
      setAddShiftModal((prev) => (prev ? { ...prev, errorMsg: '権限がありません' } : prev));
      return;
    }
    if (!addShiftModal.staffId) {
      setAddShiftModal((prev) => (prev ? { ...prev, errorMsg: '職員を選択してください' } : prev));
      return;
    }
    if (!addShiftModal.startTime || !addShiftModal.endTime) {
      setAddShiftModal((prev) => (prev ? { ...prev, errorMsg: '開始・終了時刻を入力してください' } : prev));
      return;
    }
    if (addShiftModal.startTime >= addShiftModal.endTime) {
      setAddShiftModal((prev) => (prev ? { ...prev, errorMsg: '終了時刻は開始時刻より後にしてください' } : prev));
      return;
    }

    setAddShiftModal((prev) => (prev ? { ...prev, saving: true, errorMsg: '' } : prev));

    /* 既存セグメントから次の segment_order を決定。
       'off'（休み）行はシフト生成が自動で作るダミーなので、シフト追加時は上書きする。
       paid_leave / public_holiday は業務上の意味があるため残し、normal と同列で分割シフト扱い。 */
    const existingSegments = shiftAssignments.filter(
      (sa) =>
        sa.staff_id === addShiftModal.staffId &&
        sa.date === selectedDate &&
        sa.assignment_type !== 'off',
    );
    const nextSegmentOrder =
      existingSegments.length === 0
        ? 0
        : Math.max(...existingSegments.map((sa) => sa.segment_order ?? 0)) + 1;

    try {
      const res = await fetch('/api/shift-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: [
            {
              staff_id: addShiftModal.staffId,
              date: selectedDate,
              start_time: addShiftModal.startTime,
              end_time: addShiftModal.endTime,
              assignment_type: 'normal',
              is_confirmed: false,
              segment_order: nextSegmentOrder,
            },
          ],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'シフト追加に失敗しました');
      }
      setAddShiftModal(null);
      await fetchAll();
    } catch (err) {
      setAddShiftModal((prev) =>
        prev
          ? { ...prev, saving: false, errorMsg: err instanceof Error ? err.message : 'シフト追加に失敗しました' }
          : prev,
      );
    }
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
    /* Phase 47 (③): 確定後は pending を破棄（confirmed は読み取り専用になるため） */
    setPendingChanges(new Map());
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

      <Header
        title="送迎表"
        actions={
          <>
            {/* Phase 58: 月の完成状態バッジ - 閲覧者には非表示 */}
            {myRole !== 'viewer' && (() => {
              const monthStr = `${year}-${String(month).padStart(2, '0')}`;
              const status: 'empty' | 'incomplete' | 'complete' =
                transportAssignments.length === 0
                  ? 'empty'
                  : confirmed && unassignedTotal === 0
                  ? 'complete'
                  : 'incomplete';
              return <MonthStatusBadge status={status} month={monthStr} />;
            })()}
            <Button
              variant="secondary"
              onClick={() => {
                const m = `${year}-${String(month).padStart(2, '0')}`;
                window.open(`/output/weekly-transport?month=${m}`, '_blank');
              }}
              title="A3 1ページ = 1週間 のフォーマットで印刷"
            >
              🖨 週次印刷
            </Button>
          </>
        }
      />

      {/* Phase 57: 日付ナビ専用行（ヘッダーからは月ナビを撤去し、ここに集約） */}
      <div className="px-4 pt-3">
        <DateStepper value={selectedDate} onChange={setSelectedDate} dayStates={dayStates} />
      </div>

      <div className="px-2 py-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {/* 送迎表の当日利用人数（schedule_entries ベース、欠席・お休みは除外） */}
            {(() => {
              const dayEntries = scheduleEntries.filter(
                (e) =>
                  e.date === selectedDate &&
                  e.attendance_status !== 'absent' &&
                  e.attendance_status !== 'leave',
              );
              return (
                <span
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--ink-2)',
                    border: '1px solid var(--rule)',
                  }}
                  title="この日の利用児童数（欠席除く）"
                >
                  🧒 利用 {dayEntries.length}人
                </span>
              );
            })()}
            {/* Phase 55: 当日の出勤スタッフ数（シフトに入っていて end_time が設定されている職員） */}
            {(() => {
              const onDuty = availableStaffForDay.filter((s) => !!s.endTime);
              const driverCount = onDuty.filter((s) => s.isDriver).length;
              /* Phase 60: ホバーで出勤者一覧を表示。分割シフトは各セグメントを " / " で並べる。
                 出勤時刻が早い順にソート。ネイティブ title は見た目が OS 依存で美しくないので、
                 group-hover 方式で自前スタイルのポップオーバーを出す。 */
              const onDutySorted = onDuty.slice().sort((a, b) => {
                const as = a.segments[0]?.startTime ?? '99:99';
                const bs = b.segments[0]?.startTime ?? '99:99';
                return as.localeCompare(bs);
              });
              return (
                <>
                  <span className="relative inline-block group">
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded cursor-help"
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--ink-2)',
                        border: '1px solid var(--rule)',
                      }}
                    >
                      👤 出勤 {onDuty.length}人
                    </span>
                    {/* Phase 60: カード型ポップオーバー。group-hover で開閉。 */}
                    <div
                      className="absolute left-0 top-full mt-1 hidden group-hover:block z-50"
                      style={{ minWidth: '240px' }}
                      role="tooltip"
                    >
                      <div
                        className="rounded shadow-lg overflow-hidden"
                        style={{
                          background: 'var(--surface, #fff)',
                          border: '1px solid var(--rule)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        }}
                      >
                        <div
                          className="px-3 py-2 text-[11px] font-bold tracking-wide"
                          style={{
                            background: 'var(--bg)',
                            color: 'var(--ink-2)',
                            borderBottom: '1px solid var(--rule)',
                          }}
                        >
                          この日の出勤者（{onDuty.length}人）
                        </div>
                        {onDutySorted.length === 0 ? (
                          <div
                            className="px-3 py-3 text-xs"
                            style={{ color: 'var(--ink-3)' }}
                          >
                            出勤者はいません
                          </div>
                        ) : (
                          <ul className="py-1">
                            {onDutySorted.map((s, idx) => (
                              <li
                                key={s.id}
                                className="flex items-center justify-between gap-4 px-3 py-2"
                                style={{
                                  background:
                                    idx % 2 === 1 ? 'rgba(0,0,0,0.03)' : 'transparent',
                                }}
                              >
                                <span
                                  className="font-semibold truncate"
                                  style={{ color: 'var(--ink)', fontSize: '0.9rem' }}
                                >
                                  {s.name}
                                </span>
                                <span
                                  className="shrink-0 tabular-nums"
                                  style={{
                                    color: 'var(--ink)',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    letterSpacing: '0.01em',
                                  }}
                                >
                                  {s.segments
                                    .map(
                                      (seg) =>
                                        `${seg.startTime.slice(0, 5)}–${seg.endTime.slice(0, 5)}`,
                                    )
                                    .join(' / ')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </span>
                  {/* Phase 59: 運転手不在警告。自動割り当てが成立しない・左スロットが空になる */}
                  {onDuty.length > 0 && driverCount === 0 && (
                    <span
                      className="text-xs font-bold px-2 py-1 rounded"
                      style={{
                        background: 'var(--red-pale)',
                        color: 'var(--red)',
                        border: '1.5px solid var(--red)',
                      }}
                      title="この日は運転手（is_driver=true）の出勤がありません。自動割り当てが成立しない・左スロットが空になります。人員調整してください。"
                    >
                      ⚠ 運転手不在
                    </span>
                  )}
                </>
              );
            })()}
            {/* Phase 45+57: 当日がロック済み かつ 未保存編集なしなら 🔒 を表示。閲覧者にも表示。 */}
            {pendingCountForDay === 0 &&
              transportAssignments.some(
                (t) =>
                  t.is_locked &&
                  scheduleEntries.some((e) => e.id === t.schedule_entry_id && e.date === selectedDate),
              ) && (
                <span
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{
                    background: 'var(--accent-pale)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                  }}
                  title="この日は手動で保存済みです。再生成でスキップされます。編集すれば自動で解除されます。"
                >
                  🔒 保存済<span className="hidden sm:inline">(再生成スキップ)</span>
                </span>
              )}
            {/* Phase 57: 未保存編集がある日のみ。閲覧者にも表示。 */}
            {pendingCountForDay > 0 && (
              <span
                className="text-xs font-semibold px-2 py-1 rounded"
                style={{
                  background: 'rgba(212,160,23,0.1)',
                  color: 'var(--gold, #b8860b)',
                  border: '1px solid var(--gold, #d4a017)',
                }}
                title="未保存の編集があります。保存するまで再生成では更新されません。"
              >
                ✏️ 編集中<span className="hidden sm:inline">（{pendingCountForDay}件未保存）</span>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {/* Phase 51: 送迎表作成中にシフト外の職員を当日出勤扱いにして担当に立てるための導線 */}
            {myRole !== 'viewer' && (myRole === 'admin' || myRole === 'editor') && (
              <Button
                data-tour="transport-add-shift"
                variant="secondary"
                onClick={() =>
                  setAddShiftModal({
                    step: 'pick',
                    staffId: '',
                    startTime: '09:00',
                    endTime: '17:00',
                    saving: false,
                    errorMsg: '',
                  })
                }
                disabled={!selectedDate}
                title="この日に出勤する職員を追加（基本時間外も可）"
              >
                ＋ シフト追加
              </Button>
            )}
            {/* Phase 55b: viewer は送迎表確定・生成・保存系ボタンを全て非表示 */}
            {generated && !confirmed && unassignedTotal === 0 && myRole !== 'viewer' && (
              <Button data-tour="transport-confirm" variant="primary" onClick={handleConfirm}>
                送迎表確定
              </Button>
            )}
            {myRole !== 'viewer' && (
            <Button
              data-tour="transport-generate"
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
            )}
          </div>
        </div>

        {error && (
          <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
        ) : isDateOutOfRange(selectedDate, myRole ?? 'viewer') ? (
          <div
            className="py-24 text-center border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4"
            style={{
              background: 'rgba(0,0,0,0.02)',
              borderColor: 'var(--rule)',
            }}
          >
            <span style={{ fontSize: '3rem', opacity: 0.3 }}>🔒</span>
            <div className="flex flex-col gap-1">
              <p className="font-bold" style={{ color: 'var(--ink-2)' }}>
                閲覧制限エリア
              </p>
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                閲覧権限により、過去2日前から7日間先までの予定のみ参照可能です。
              </p>
            </div>
          </div>
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

            <div data-tour="transport-day">
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
                pickupAreaId: e.pickupAreaId,
                dropoffAreaId: e.dropoffAreaId,
                pickupStaffIds: e.pickupStaffIds,
                dropoffStaffIds: e.dropoffStaffIds,
                isUnassigned: e.isUnassigned,
                pickupMethod: e.pickupMethod,
                dropoffMethod: e.dropoffMethod,
              }))}
              availableStaff={availableStaffForDay}
              transportMinEndTime={transportMinEndTime}
              tenantAreaIds={[...pickupAreas.map((a) => a.id), ...dropoffAreas.map((a) => a.id)]}
              childAreaEligibleStaff={childAreaEligibleStaff}
              onStaffChange={handleStaffChange}
              /* Phase 58: 当日がロック済み（保存済み）かどうか。
                 false = 自動割り当ての未保存状態 → StaffSelect は薄いグレーで「仮状態」を示す。
                 true = 手動保存済み → StaffSelect は白。編集で pending が立つと呼び出し側で再計算。 */
              dayLocked={dayStates.get(selectedDate)?.locked === true}
              /* Phase 55b: viewer は閲覧のみ。担当セル操作・列並び替え・保存系を全ロック。
                 確定済み月も従来通り読み取り専用。 */
              disabled={confirmed || myRole === 'viewer'}
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
            </div>

            {/* Phase 26: 日ごとの保存ボタン（Phase 55b: viewer には非表示） */}
            <div className="flex items-center justify-end gap-3 mt-4">
              {pendingCountForDay > 0 && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  未保存 {pendingCountForDay} 件
                </span>
              )}
              {myRole !== 'viewer' && (() => {
                /* Phase 46: 保存済み (lock 済) の日はボタンを「✅ 保存済み」表示に切り替え。
                   再編集すると pending が立つので自動的に「保存」に戻る。 */
                const currentDayLocked = transportAssignments.some(
                  (t) =>
                    t.is_locked &&
                    scheduleEntries.some(
                      (e) => e.id === t.schedule_entry_id && e.date === selectedDate,
                    ),
                );
                const showSaved = pendingCountForDay === 0 && currentDayLocked && !saving;
                return (
                  <Button
                    data-tour="transport-save-day"
                    variant="primary"
                    onClick={handleSaveDay}
                    disabled={saving || pendingCountForDay === 0 || confirmed}
                  >
                    {saving
                      ? '保存中...'
                      : pendingCountForDay > 0
                      ? `この日の送迎を保存（${pendingCountForDay}件）`
                      : showSaved
                      ? '✅ 保存済み'
                      : 'この日の送迎を保存'}
                  </Button>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* Phase 51 + Phase 59-fix: シフト追加モーダル ─ 2 ステップフロー
          step='pick': 職員を一覧から選ぶ（クリック即決定で時間ステップへ）
          step='time': 選んだ職員名を表示しながら時間を確認・入力 → 追加 */}
      {addShiftModal && (
        <Modal
          isOpen={true}
          onClose={() => (addShiftModal.saving ? null : setAddShiftModal(null))}
          title={
            addShiftModal.step === 'pick'
              ? `シフト追加（${selectedDate}）— 職員を選択`
              : `シフト追加（${selectedDate}）— 時間を入力`
          }
          size="md"
        >
          {addShiftModal.step === 'pick' ? (
            /* === Step 1: 職員選択 === */
            <div className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                この日に出勤する職員を選択してください。既に当日シフトがある職員は分割シフト（2 コマ目以降）として追加されます。
              </p>
              <div
                className="flex flex-col overflow-y-auto"
                style={{
                  maxHeight: '52vh',
                  border: '1px solid var(--rule)',
                  borderRadius: '8px',
                  background: 'var(--white)',
                }}
              >
                {buildPickerItems(staff, shiftAssignments, selectedDate).map((item, idx) => {
                  const badgeColor =
                    item.leaveLabel === '有給'
                      ? 'var(--green, #2f8f57)'
                      : item.leaveLabel === '公休'
                      ? 'var(--accent)'
                      : null;
                  const badgeBg =
                    item.leaveLabel === '有給'
                      ? 'var(--green-pale, rgba(47,143,87,0.10))'
                      : item.leaveLabel === '公休'
                      ? 'var(--accent-pale)'
                      : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const picked = staff.find((s) => s.id === item.id);
                        setAddShiftModal((prev) => {
                          if (!prev) return prev;
                          const start = picked?.default_start_time?.slice(0, 5) ?? prev.startTime;
                          const end = picked?.default_end_time?.slice(0, 5) ?? prev.endTime;
                          return {
                            ...prev,
                            staffId: item.id,
                            startTime: start,
                            endTime: end,
                            step: 'time',
                            errorMsg: '',
                          };
                        });
                      }}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors text-left"
                      style={{
                        /* Phase 60: 行を縞々にして視線誘導。奇数行のみ薄グレー */
                        background: idx % 2 === 1 ? 'rgba(0,0,0,0.025)' : 'transparent',
                        borderTop: idx === 0 ? 'none' : '1px solid var(--rule)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          idx % 2 === 1 ? 'rgba(0,0,0,0.025)' : 'transparent';
                      }}
                    >
                      <span className="text-base font-medium" style={{ color: 'var(--ink)' }}>
                        {item.name}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {item.leaveLabel && badgeColor && badgeBg && (
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              background: badgeBg,
                              color: badgeColor,
                              border: `1px solid ${badgeColor}`,
                            }}
                          >
                            ⚠ {item.leaveLabel}
                          </span>
                        )}
                        {item.hasShift && !item.leaveLabel && (
                          <span
                            className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              background: 'var(--bg)',
                              color: 'var(--ink-2)',
                              border: '1px solid var(--rule-strong)',
                            }}
                          >
                            分割追加
                          </span>
                        )}
                        <span style={{ color: 'var(--ink-3)', fontSize: '0.8rem' }}>›</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end mt-1">
                <Button variant="secondary" onClick={() => setAddShiftModal(null)}>
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            /* === Step 2: 時間入力 === */
            (() => {
              const picked = staff.find((s) => s.id === addShiftModal.staffId);
              const leave = shiftAssignments.find(
                (sa) =>
                  sa.staff_id === addShiftModal.staffId &&
                  sa.date === selectedDate &&
                  (sa.assignment_type === 'public_holiday' || sa.assignment_type === 'paid_leave'),
              );
              const hasShift = shiftAssignments.some(
                (sa) =>
                  sa.staff_id === addShiftModal.staffId &&
                  sa.date === selectedDate &&
                  sa.assignment_type === 'normal',
              );
              const isGreen = leave?.assignment_type === 'paid_leave';
              const leaveLabel = isGreen ? '有給' : leave ? '公休' : null;
              const leaveColor = isGreen ? 'var(--green, #2f8f57)' : 'var(--accent)';
              const leaveBg = isGreen ? 'var(--green-pale, rgba(47,143,87,0.10))' : 'var(--accent-pale)';
              return (
                <div className="flex flex-col gap-3">
                  {/* 選択中の職員 + 戻るリンク */}
                  <div
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded"
                    style={{ background: 'var(--accent-pale)', border: '1px solid var(--accent)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>
                        {picked?.name ?? '(未選択)'}
                      </span>
                      {leaveLabel && (
                        <span
                          className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: leaveBg, color: leaveColor, border: `1px solid ${leaveColor}` }}
                        >
                          ⚠ {leaveLabel}
                        </span>
                      )}
                      {hasShift && !leaveLabel && (
                        <span
                          className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: 'var(--white)',
                            color: 'var(--ink-2)',
                            border: '1px solid var(--rule-strong)',
                          }}
                        >
                          分割追加
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setAddShiftModal((prev) =>
                          prev ? { ...prev, step: 'pick', errorMsg: '' } : prev,
                        )
                      }
                      className="text-xs font-semibold whitespace-nowrap shrink-0"
                      style={{ color: 'var(--accent)' }}
                      disabled={addShiftModal.saving}
                    >
                      ← 職員を変更
                    </button>
                  </div>

                  {leave && leaveLabel && (
                    <div
                      className="text-xs px-3 py-2 rounded"
                      style={{
                        background: leaveBg,
                        color: leaveColor,
                        border: `1px solid ${leaveColor}`,
                      }}
                    >
                      ⚠ この職員は当日「{leaveLabel}」扱いです。出勤として追加すると現在のシフトが上書きされます。
                    </div>
                  )}

                  <div className="flex gap-3">
                    <label className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                        開始
                      </span>
                      <input
                        type="time"
                        value={addShiftModal.startTime}
                        onChange={(e) =>
                          setAddShiftModal((prev) => (prev ? { ...prev, startTime: e.target.value } : prev))
                        }
                        disabled={addShiftModal.saving}
                        style={{
                          padding: '8px 10px',
                          fontSize: '0.95rem',
                          border: '1px solid var(--rule)',
                          borderRadius: '6px',
                          background: 'var(--white)',
                        }}
                      />
                    </label>
                    <label className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                        終了
                      </span>
                      <input
                        type="time"
                        value={addShiftModal.endTime}
                        onChange={(e) =>
                          setAddShiftModal((prev) => (prev ? { ...prev, endTime: e.target.value } : prev))
                        }
                        disabled={addShiftModal.saving}
                        style={{
                          padding: '8px 10px',
                          fontSize: '0.95rem',
                          border: '1px solid var(--rule)',
                          borderRadius: '6px',
                          background: 'var(--white)',
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    職員の基本出勤・退勤時刻を初期値にしています。早朝・夜間など必要に応じて変更できます。
                  </p>

                  {addShiftModal.errorMsg && (
                    <div
                      className="px-3 py-2 rounded text-xs"
                      style={{ background: 'var(--red-pale)', color: 'var(--red)' }}
                    >
                      {addShiftModal.errorMsg}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 mt-2">
                    <Button
                      variant="secondary"
                      onClick={() => setAddShiftModal(null)}
                      disabled={addShiftModal.saving}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleSaveAddShift}
                      disabled={addShiftModal.saving || !addShiftModal.staffId}
                    >
                      {addShiftModal.saving ? '保存中…' : '追加'}
                    </Button>
                  </div>
                </div>
              );
            })()
          )}
        </Modal>
      )}
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


/* Phase 38: 送迎表ヘッダーの日付ピッカー。
   日次出力ページ (src/app/(app)/output/daily/page.tsx) と同じ「素の <input type=date>」方式。
   オーバーレイやカスタムボタンは iOS Safari で不発になるケースがあったため廃止。
   見た目だけボタン風（アクセント枠・角丸・padding）にスタイリング。 */
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
  const minDate = workDays[0] ?? `${year}-${String(month).padStart(2, '0')}-01`;
  const maxDate = workDays[workDays.length - 1] ?? minDate;

  return (
    <input
      type="date"
      value={selectedDate}
      min={minDate}
      max={maxDate}
      onChange={(e) => {
        const v = e.target.value;
        if (v) onChange(v);
      }}
      title="日付を選択して遷移"
      aria-label="日付を選択"
      style={{
        fontSize: '0.95rem',
        fontWeight: 600,
        padding: '6px 12px',
        border: '1.5px solid var(--accent)',
        borderRadius: '8px',
        background: 'var(--white)',
        color: 'var(--ink)',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    />
  );
}
