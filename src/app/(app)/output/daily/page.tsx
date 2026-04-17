'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { ja } from 'date-fns/locale';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { defaultOutputDate, toDateString, nextBusinessDay } from '@/lib/dates/nextBusinessDay';
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

/**
 * Phase 25-D: 日次出力ページ
 *
 * 当日（または土日アクセス時は翌月曜）の送迎表と出勤職員をホワイトボード風に
 * 一枚のビューで出力。全ログイン済み職員がアクセス可能。PDF ダウンロード対応。
 * attendance_status='absent' の児童は送迎表示から除外する（欠席連動）。
 */

type TransportSlot = {
  time: string;
  direction: 'pickup' | 'dropoff';
  areaLabel: string | null;
  location: string | null;
  children: Array<{
    name: string;
    isNew: boolean;
    areaLabel: string | null;
  }>;
  staffIds: string[];
  isUnassigned: boolean;
  isConfirmed: boolean;
};

type OnDutyStaff = {
  id: string;
  name: string;
  start: string;
  end: string;
};

/** 新規利用児童: 直近7日以内に created_at があるもの */
function isNewChild(child: ChildRow): boolean {
  const created = new Date(child.created_at);
  const diff = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 7;
}

/** HH:MM:SS → HH:MM */
function fmtTime(t: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function DailyOutputPage() {
  const [date, setDate] = useState(defaultOutputDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [patterns, setPatterns] = useState<ChildTransportPatternRow[]>([]);
  const [entries, setEntries] = useState<ScheduleEntryRow[]>([]);
  const [shifts, setShifts] = useState<ShiftAssignmentRow[]>([]);
  const [transportAssignments, setTransportAssignments] = useState<TransportAssignmentRow[]>([]);
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sRes, cRes, eRes, aRes, tRes, tenantRes] = await Promise.all([
        fetch('/api/staff'),
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${date}&to=${date}`),
        fetch(`/api/shift-assignments?from=${date}&to=${date}`),
        fetch(`/api/transport-assignments?from=${date}&to=${date}`),
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
      setEntries(eJson.entries ?? []);
      setShifts(aJson.assignments ?? []);
      setTransportAssignments(tJson.assignments ?? []);
      const settings: TenantSettings = tenantJson.tenant?.settings ?? {};
      setPickupAreas(settings.pickup_areas ?? settings.transport_areas ?? []);
      setDropoffAreas(settings.dropoff_areas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /* ---- 送迎スロットをタイムライン順に組み立て ---- */
  const slots: TransportSlot[] = useMemo(() => {
    const childById = new Map(children.map((c) => [c.id, c]));
    const entryById = new Map(entries.map((e) => [e.id, e]));
    const patternById = new Map(patterns.map((p) => [p.id, p]));

    const list: TransportSlot[] = [];

    for (const ta of transportAssignments) {
      const entry = entryById.get(ta.schedule_entry_id);
      if (!entry) continue;
      /* 欠席児童は除外 */
      if (entry.attendance_status === 'absent') continue;

      const child = childById.get(entry.child_id);
      if (!child) continue;
      const pattern = entry.pattern_id ? patternById.get(entry.pattern_id) : null;

      /* 迎（来所） */
      if (entry.pickup_time && entry.pickup_method === 'pickup') {
        list.push({
          time: fmtTime(entry.pickup_time),
          direction: 'pickup',
          areaLabel: pattern?.pickup_area_label ?? null,
          location: pattern?.pickup_location ?? null,
          children: [
            {
              name: child.name,
              isNew: isNewChild(child),
              areaLabel: pattern?.pickup_area_label ?? null,
            },
          ],
          staffIds: ta.pickup_staff_ids,
          isUnassigned:
            ta.is_unassigned ||
            (entry.pickup_method === 'pickup' && ta.pickup_staff_ids.length === 0),
          isConfirmed: ta.is_confirmed,
        });
      }

      /* 送（退所） */
      if (entry.dropoff_time && entry.dropoff_method === 'dropoff') {
        list.push({
          time: fmtTime(entry.dropoff_time),
          direction: 'dropoff',
          areaLabel: pattern?.dropoff_area_label ?? null,
          location: pattern?.dropoff_location ?? child.home_address,
          children: [
            {
              name: child.name,
              isNew: isNewChild(child),
              areaLabel: pattern?.dropoff_area_label ?? null,
            },
          ],
          staffIds: ta.dropoff_staff_ids,
          isUnassigned:
            ta.is_unassigned ||
            (entry.dropoff_method === 'dropoff' && ta.dropoff_staff_ids.length === 0),
          isConfirmed: ta.is_confirmed,
        });
      }
    }

    /* 同時刻 + 同方向 + 同エリアの児童をグルーピング */
    const grouped = new Map<string, TransportSlot>();
    for (const s of list) {
      const key = `${s.time}|${s.direction}|${s.areaLabel ?? ''}|${s.location ?? ''}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.children.push(...s.children);
        existing.staffIds = Array.from(new Set([...existing.staffIds, ...s.staffIds]));
        existing.isUnassigned = existing.isUnassigned || s.isUnassigned;
      } else {
        grouped.set(key, { ...s, children: [...s.children] });
      }
    }

    const result = Array.from(grouped.values());
    result.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.direction === 'pickup' ? -1 : 1));
    return result;
  }, [children, entries, patterns, transportAssignments]);

  /* ---- 出勤者一覧 ---- */
  const onDuty: OnDutyStaff[] = useMemo(() => {
    const staffById = new Map(staff.map((s) => [s.id, s]));
    return shifts
      .filter((sa) => sa.assignment_type === 'normal' && sa.start_time && sa.end_time)
      .map((sa) => {
        const s = staffById.get(sa.staff_id);
        return {
          id: sa.staff_id,
          name: s?.name ?? '(不明)',
          start: fmtTime(sa.start_time),
          end: fmtTime(sa.end_time),
        };
      })
      .sort((a, b) => (a.start < b.start ? -1 : 1));
  }, [shifts, staff]);

  const unassignedCount = slots.filter((s) => s.isUnassigned).length;
  const staffNameById = useMemo(
    () => new Map(staff.map((s) => [s.id, s.name])),
    [staff],
  );

  const allAreas = useMemo(
    () => [...pickupAreas, ...dropoffAreas],
    [pickupAreas, dropoffAreas],
  );

  const areaEmojiByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of allAreas) {
      m.set(`${a.emoji} ${a.name}`, a.emoji);
      m.set(a.name, a.emoji);
    }
    return m;
  }, [allAreas]);

  const handleDownload = async () => {
    setDownloadBusy(true);
    try {
      const res = await fetch(`/api/output/daily/pdf?date=${date}`);
      if (!res.ok) throw new Error('PDF生成に失敗しました');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily_${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ダウンロード失敗');
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="日次出力"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setDate(toDateString(subDays(new Date(date), 1)))}
            >
              ← 前日
            </Button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2 py-1 rounded text-sm"
              style={{ border: '1px solid var(--rule)' }}
            />
            <Button
              variant="secondary"
              onClick={() => setDate(toDateString(addDays(new Date(date), 1)))}
            >
              翌日 →
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDate(toDateString(nextBusinessDay(new Date())))}
            >
              今日/翌営業日
            </Button>
            <Button variant="primary" onClick={handleDownload} disabled={downloadBusy}>
              {downloadBusy ? '生成中...' : '📄 PDF出力'}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div
            className="mb-2 px-4 py-2 rounded"
            style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}
          >
            {error}
          </div>
        )}

        {/* サマリー */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
            {format(new Date(date), 'yyyy年M月d日(E)', { locale: ja })}
          </h2>
          <Badge variant="info">送迎 {slots.length}便</Badge>
          <Badge variant="info">出勤 {onDuty.length}名</Badge>
          {unassignedCount > 0 && <Badge variant="error">未割当 {unassignedCount}件</Badge>}
        </div>

        {loading ? (
          <div className="h-96 flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)' }}>
            読み込み中...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-6">
            {/* 左: 送迎カードリスト */}
            <div>
              <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--ink-2)' }}>
                送迎予定
              </h3>
              {slots.length === 0 ? (
                <div
                  className="p-4 rounded text-sm"
                  style={{ background: 'var(--white)', border: '1px solid var(--rule)', color: 'var(--ink-3)' }}
                >
                  この日の送迎予定はありません
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {slots.map((s, i) => (
                    <li
                      key={`${s.time}-${s.direction}-${i}`}
                      className="p-3 rounded"
                      style={{
                        background: s.isUnassigned ? 'var(--red-pale)' : 'var(--white)',
                        border: `1px solid ${s.isUnassigned ? 'var(--red)' : 'var(--rule)'}`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center shrink-0" style={{ minWidth: '72px' }}>
                          <span
                            className="text-lg font-bold"
                            style={{ color: s.direction === 'pickup' ? 'var(--accent)' : 'var(--green)' }}
                          >
                            {s.time}
                          </span>
                          <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                            {s.direction === 'pickup' ? '迎' : '送'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {s.areaLabel && (
                              <span
                                className="text-xs px-2 py-0.5 rounded font-semibold"
                                style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}
                              >
                                {s.areaLabel}
                              </span>
                            )}
                            {s.location && (
                              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                                {s.location}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.children.map((c, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
                                style={{
                                  background: 'var(--green-pale)',
                                  color: 'var(--green)',
                                }}
                              >
                                {c.areaLabel && areaEmojiByLabel.get(c.areaLabel)} {c.name}
                                {c.isNew && (
                                  <span
                                    className="text-[9px] px-1 rounded"
                                    style={{ background: 'var(--accent)', color: '#fff' }}
                                  >
                                    NEW
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          className="shrink-0 text-right text-xs"
                          style={{ color: s.isUnassigned ? 'var(--red)' : 'var(--ink-2)' }}
                        >
                          {s.isUnassigned ? (
                            <span className="font-bold">⚠ 未割当</span>
                          ) : (
                            <span>
                              担当:{' '}
                              {s.staffIds.length === 0
                                ? '—'
                                : s.staffIds.map((id) => staffNameById.get(id) ?? id).join(' / ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 右: 出勤者 */}
            <div>
              <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--ink-2)' }}>
                本日の出勤
              </h3>
              <div
                className="p-3 rounded"
                style={{ background: 'var(--white)', border: '1px solid var(--rule)' }}
              >
                {onDuty.length === 0 ? (
                  <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    出勤者はいません
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {onDuty.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between text-sm py-1"
                        style={{ borderBottom: '1px dashed var(--rule)' }}
                      >
                        <span className="font-semibold">{s.name}</span>
                        <span style={{ color: 'var(--ink-3)' }}>
                          {s.start}〜{s.end}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
