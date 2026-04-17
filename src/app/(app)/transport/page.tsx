'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
} from '@/types';

/**
 * 送迎表ページ（Supabase 接続）
 * - 月選択 + 日別タブ
 * - 既存の transport_assignments を取得
 * - 「割り当て生成」で /api/transport/generate を呼び、結果を DB に upsert
 */

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

type UiTransportEntry = {
  scheduleEntryId: string;
  childName: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupStaffIds: string[];
  dropoffStaffIds: string[];
  isUnassigned: boolean;
  isConfirmed: boolean;
};

export default function TransportPage() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [patterns, setPatterns] = useState<ChildTransportPatternRow[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntryRow[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignmentRow[]>([]);
  const [transportAssignments, setTransportAssignments] = useState<TransportAssignmentRow[]>([]);

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

      const [sRes, cRes, eRes, aRes, tRes] = await Promise.all([
        fetch('/api/staff'),
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${from}&to=${to}`),
        fetch(`/api/shift-assignments?from=${from}&to=${to}`),
        fetch(`/api/transport-assignments?from=${from}&to=${to}`),
      ]);
      const sJson = sRes.ok ? await sRes.json() : { staff: [] };
      const cJson = cRes.ok ? await cRes.json() : { children: [], patterns: [] };
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const aJson = aRes.ok ? await aRes.json() : { assignments: [] };
      const tJson = tRes.ok ? await tRes.json() : { assignments: [] };

      setStaff(sJson.staff ?? []);
      setChildren(cJson.children ?? []);
      setPatterns(cJson.patterns ?? []);
      setScheduleEntries(eJson.entries ?? []);
      setShiftAssignments(aJson.assignments ?? []);
      setTransportAssignments(tJson.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [year, month, daysInMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const childNameMap = useMemo(
    () => new Map(children.map((c) => [c.id, c.name])),
    [children]
  );

  /* UI 用エントリ構築: selectedDate の schedule_entries を列挙し、transport_assignments と結合 */
  const currentDayEntries: UiTransportEntry[] = useMemo(() => {
    const scheduleIds = scheduleEntries.filter((e) => e.date === selectedDate).map((e) => e.id);
    const entryById = new Map(scheduleEntries.map((e) => [e.id, e]));
    const assignByEntry = new Map(transportAssignments.map((t) => [t.schedule_entry_id, t]));
    return scheduleIds.map((sid) => {
      const e = entryById.get(sid)!;
      const t = assignByEntry.get(sid);
      return {
        scheduleEntryId: sid,
        childName: childNameMap.get(e.child_id) ?? '(不明)',
        pickupTime: e.pickup_time,
        dropoffTime: e.dropoff_time,
        pickupStaffIds: t?.pickup_staff_ids ?? [],
        dropoffStaffIds: t?.dropoff_staff_ids ?? [],
        isUnassigned: t?.is_unassigned ?? true,
        isConfirmed: t?.is_confirmed ?? false,
      };
    });
  }, [selectedDate, scheduleEntries, transportAssignments, childNameMap]);

  const unassignedTotal = useMemo(() => {
    return transportAssignments.filter((t) => t.is_unassigned).length;
  }, [transportAssignments]);

  const confirmed = currentDayEntries.length > 0 && currentDayEntries.every((e) => e.isConfirmed);
  const generated = transportAssignments.length > 0;

  const tenantId = staff[0]?.tenant_id ?? '';

  const handleGenerate = async () => {
    try {
      /* 各日付ごとに /api/transport/generate → 結果を /api/transport-assignments に upsert */
      for (const date of workDays) {
        const genRes = await fetch('/api/transport/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            date,
            scheduleEntries: scheduleEntries.filter((e) => e.date === date),
            patterns,
            staff,
            shiftAssignments: shiftAssignments.filter((a) => a.date === date),
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

  const handleStaffChange = async (
    scheduleEntryId: string,
    field: 'pickup' | 'dropoff',
    staffIds: string[]
  ) => {
    const current = transportAssignments.find((t) => t.schedule_entry_id === scheduleEntryId);
    const pickup = field === 'pickup' ? staffIds : current?.pickup_staff_ids ?? [];
    const dropoff = field === 'dropoff' ? staffIds : current?.dropoff_staff_ids ?? [];
    const isUnassigned = pickup.length === 0 && dropoff.length === 0;

    await fetch('/api/transport-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments: [{
          schedule_entry_id: scheduleEntryId,
          pickup_staff_ids: pickup,
          dropoff_staff_ids: dropoff,
          is_unassigned: isUnassigned,
          is_confirmed: current?.is_confirmed ?? false,
        }],
      }),
    });
    await fetchAll();
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
      <Header
        title="送迎表"
        actions={
          <select
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setYear(y); setMonth(m);
            }}
            className="px-2 py-1 rounded text-sm"
            style={{ border: '1px solid var(--rule)' }}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(currentYear, currentMonth - 1 - 3 + i, 1);
              return (
                <option key={`${d.getFullYear()}-${d.getMonth() + 1}`} value={`${d.getFullYear()}-${d.getMonth() + 1}`}>
                  {d.getFullYear()}年{d.getMonth() + 1}月
                </option>
              );
            })}
          </select>
        }
      />

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
                    onClick={() => setSelectedDate(date)}
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
                pickupStaffIds: e.pickupStaffIds,
                dropoffStaffIds: e.dropoffStaffIds,
                isUnassigned: e.isUnassigned,
              }))}
              availableStaff={staff.map((s) => ({ id: s.id, name: s.name }))}
              onStaffChange={handleStaffChange}
              onAddPattern={() => {
                alert('児童管理ページで送迎パターンを編集できます');
              }}
              disabled={confirmed}
            />
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
