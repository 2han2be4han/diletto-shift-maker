'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, getDaysInMonth } from 'date-fns';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import { staffDisplayName } from '@/lib/utils/displayName';
import { resolveEntryTransportSpec } from '@/lib/logic/resolveTransportSpec';
import type {
  StaffRow,
  ChildRow,
  ScheduleEntryRow,
  TransportAssignmentRow,
  AreaLabel,
  TenantSettings,
} from '@/types';

/**
 * Phase 47: 送迎表 週次印刷ページ
 *
 * 仕様:
 * - 月単位で取得した送迎データを「月曜始まりの週」で分割
 * - 1 週間 = 1 ページ（A3 縦）として印刷可能
 * - 各週ブロックは「日付 / 児童名 / 場所 / 時間 / 迎担当 / 送担当」の表
 * - 添付 PDF 「2026.4送迎表.pdf」のレイアウトに準拠（コメント列等の付記は省略）
 *
 * URL: /output/weekly-transport?month=YYYY-MM
 */

function defaultMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/** Phase 47: 月の各日が含まれる週（月曜始まり 7 日）を返す。
 *  各週は常に「月-日 の 7 日」固定。月外の日付は string で持ち、
 *  描画側で「対象月外」として扱う（空ブロック表示）。
 *  これにより全週ページのレイアウトが揃い、同じ曜日が常に同じ位置に来る。 */
function buildWeeklyGrid(year: number, month: number): { weeks: { date: string; inMonth: boolean }[][] } {
  const monthStart = new Date(year, month - 1, 1);
  const monthEndDay = new Date(year, month, 0).getDate();
  /* 1日が含まれる週の月曜を起点にする */
  const dow = monthStart.getDay(); /* 0=Sun..6=Sat */
  const offsetToMonday = dow === 0 ? -6 : 1 - dow; /* 月曜まで戻る日数 */
  const cursor = new Date(year, month - 1, 1 + offsetToMonday);

  const weeks: { date: string; inMonth: boolean }[][] = [];
  while (true) {
    const week: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const d = cursor.getDate();
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      week.push({ date: dateStr, inMonth: m === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    /* 1 週進めて、その週の最初の日が翌月の月末以降なら終了 */
    const firstOfNextWeek = new Date(cursor);
    if (firstOfNextWeek.getMonth() + 1 !== month && firstOfNextWeek.getDate() > 7) break;
    /* 安全弁: 6 週超えたら break（カレンダー上限） */
    if (weeks.length >= 6) break;
    /* この月の日が 1 つもない週なら終了 */
    if (week.every((d) => !d.inMonth) && week[0].date.split('-')[2] !== '01') break;
    /* 残りの月内日数があるかチェック */
    const lastInWeek = week[6];
    const [ly, lm, ld] = lastInWeek.date.split('-').map(Number);
    if (lm > month || (lm === month && ld >= monthEndDay)) break;
  }
  return { weeks };
}

/** 1 日あたりの固定枠数（運用上の定員 12 枠で揃える）。
 *  実際の利用人数が少なくても枠数は固定し、週ごとのレイアウトを統一する。 */
const SLOTS_PER_DAY = 12;

export default function WeeklyTransportPrintPage() {
  const searchParams = useSearchParams();
  const urlMonth = searchParams.get('month');
  const { year, month } = useMemo(() => {
    const source = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : defaultMonthStr();
    const [y, m] = source.split('-').map(Number);
    return { year: y, month: m };
  }, [urlMonth]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntryRow[]>([]);
  const [transportAssignments, setTransportAssignments] = useState<TransportAssignmentRow[]>([]);
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));

  const monthDates = useMemo(() => {
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(format(new Date(year, month - 1, d), 'yyyy-MM-dd'));
    }
    return days;
  }, [year, month, daysInMonth]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const [sRes, cRes, eRes, tRes, tenantRes] = await Promise.all([
        fetch('/api/staff'),
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${from}&to=${to}`),
        fetch(`/api/transport-assignments?from=${from}&to=${to}`),
        fetch('/api/tenant'),
      ]);
      const sJson = sRes.ok ? await sRes.json() : { staff: [] };
      const cJson = cRes.ok ? await cRes.json() : { children: [] };
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const tJson = tRes.ok ? await tRes.json() : { assignments: [] };
      const tenantJson = tenantRes.ok ? await tenantRes.json() : { tenant: null };

      setStaff(sJson.staff ?? []);
      setChildren(cJson.children ?? []);
      /* 欠席・お休み（時刻両方 null）は印刷対象外 */
      setScheduleEntries(
        ((eJson.entries ?? []) as ScheduleEntryRow[]).filter((e) => {
          if (e.attendance_status === 'absent') return false;
          if (!e.pickup_time && !e.dropoff_time) return false;
          return true;
        }),
      );
      setTransportAssignments(tJson.assignments ?? []);
      const settings: TenantSettings = tenantJson.tenant?.settings ?? {};
      setPickupAreas(settings.pickup_areas ?? settings.transport_areas ?? []);
      setDropoffAreas(settings.dropoff_areas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [year, month, daysInMonth]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  void monthDates; /* 月内日リストは fetch 用に保持（描画は buildWeeklyGrid 経由） */
  const { weeks } = useMemo(() => buildWeeklyGrid(year, month), [year, month]);
  const childById = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const childOrder = useMemo(() => new Map(children.map((c, i) => [c.id, i])), [children]);
  const assignByEntry = useMemo(
    () => new Map(transportAssignments.map((t) => [t.schedule_entry_id, t])),
    [transportAssignments],
  );

  /* 1 日分の表示行を構築 */
  const buildDayRows = useCallback((date: string) => {
    const entries = scheduleEntries.filter((e) => e.date === date);
    return entries
      .map((e) => {
        const spec = resolveEntryTransportSpec(e, {
          child: childById.get(e.child_id),
          pickupAreas,
          dropoffAreas,
        });
        const t = assignByEntry.get(e.id);
        const pickupStaffNames = (t?.pickup_staff_ids ?? [])
          .map((id) => {
            const s = staffById.get(id);
            return s ? (staffDisplayName(s) || s.name) : '';
          })
          .filter(Boolean)
          .join('・');
        const dropoffStaffNames = (t?.dropoff_staff_ids ?? [])
          .map((id) => {
            const s = staffById.get(id);
            return s ? (staffDisplayName(s) || s.name) : '';
          })
          .filter(Boolean)
          .join('・');
        return {
          entryId: e.id,
          childName: childById.get(e.child_id)?.name ?? '(不明)',
          /* 場所表示: 迎/送のラベル + 時刻 */
          pickupLabel: spec.pickup.areaLabel ?? '',
          dropoffLabel: spec.dropoff.areaLabel ?? '',
          pickupTime: spec.pickup.time ?? e.pickup_time ?? '',
          dropoffTime: spec.dropoff.time ?? e.dropoff_time ?? '',
          pickupMethod: e.pickup_method,
          dropoffMethod: e.dropoff_method,
          pickupStaffNames,
          dropoffStaffNames,
          childOrder: childOrder.get(e.child_id) ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.childOrder - b.childOrder);
  }, [scheduleEntries, childById, pickupAreas, dropoffAreas, assignByEntry, staffById, childOrder]);

  return (
    <div className="flex flex-col h-full overflow-hidden weekly-transport-print-root">
      {/* Phase 47: 週次送迎表の印刷専用 CSS。1 週 = 1 A3 ページ。 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A3 portrait; margin: 8mm; }
              .weekly-transport-print-root { overflow: visible !important; height: auto !important; }
              .weekly-transport-print-root .weekly-scroll { overflow: visible !important; padding: 0 !important; }
              .week-page { page-break-after: always; break-after: page; }
              .week-page:last-child { page-break-after: auto; break-after: auto; }
              .day-block { page-break-inside: avoid; break-inside: avoid; }
              .week-page table { font-size: 8.5pt !important; }
              .week-page th, .week-page td { padding: 1px 3px !important; }
              .weekly-print-toolbar { display: none !important; }
            }
          `,
        }}
      />

      <Header
        title={`${year}年${month}月 送迎表（週次印刷）`}
        showMonthSelector
        actions={
          <div className="weekly-print-toolbar flex items-center gap-2">
            <Button variant="primary" onClick={() => window.print()}>🖨 印刷</Button>
          </div>
        }
      />

      <div className="weekly-scroll flex-1 overflow-auto px-6 py-4" style={{ background: 'var(--bg)' }}>
        {error && (
          <div className="mb-4 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)' }}>
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-center py-10 text-sm" style={{ color: 'var(--ink-3)' }}>読み込み中...</p>
        ) : (
          <div className="flex flex-col gap-6">
            {weeks.map((week, wIdx) => {
              /* 週ラベル: 月内に存在する最初/最後の日付を採用、無ければ週端を採用 */
              const inMonth = week.filter((d) => d.inMonth);
              const startObj = new Date((inMonth[0] ?? week[0]).date);
              const endObj = new Date((inMonth[inMonth.length - 1] ?? week[6]).date);
              const label =
                `第${wIdx + 1}週 ` +
                `${startObj.getMonth() + 1}/${startObj.getDate()}（${DOW_LABELS[startObj.getDay()]}）` +
                ` 〜 ${endObj.getMonth() + 1}/${endObj.getDate()}（${DOW_LABELS[endObj.getDay()]}）`;
              return (
                <section
                  key={wIdx}
                  className="week-page bg-white rounded-lg p-4"
                  style={{ background: 'var(--white)', border: '1px solid var(--rule)' }}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
                      {year}年{month}月 {label}
                    </h2>
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      ShiftPuzzle 送迎表
                    </span>
                  </div>
                  {/* 7 日固定で常に同じレイアウト。月外の日は枠だけ薄表示 */}
                  {week.map(({ date, inMonth: isInMonth }) => {
                    const realRows = isInMonth ? buildDayRows(date) : [];
                    /* 12 枠固定: 実データを先頭、不足ぶんは空行で埋める */
                    const padded: (ReturnType<typeof buildDayRows>[number] | null)[] = Array(SLOTS_PER_DAY)
                      .fill(null)
                      .map((_, i) => realRows[i] ?? null);
                    const dt = new Date(date);
                    const dayLabel = `${dt.getMonth() + 1}/${dt.getDate()}（${DOW_LABELS[dt.getDay()]}）`;
                    const dayLabelColor =
                      !isInMonth ? 'var(--ink-3)' : dt.getDay() === 0 ? 'var(--red)' : dt.getDay() === 6 ? 'var(--accent)' : '#fff';

                    /* 場所ラベルの先頭絵文字（マーク）を抽出: "🐻 学校" → "🐻" */
                    const extractEmoji = (label: string | null | undefined): string => {
                      if (!label) return '';
                      const trimmed = label.trim();
                      const sp = trimmed.indexOf(' ');
                      return sp === -1 ? trimmed : trimmed.slice(0, sp);
                    };
                    return (
                      <div key={date} className="day-block mb-2" style={{ opacity: isInMonth ? 1 : 0.45 }}>
                        <table className="w-full border-collapse" style={{ fontSize: '0.74rem' }}>
                          {/* Phase 47: 場所列を 110px 固定で狭く、担当列を 130px に広げる */}
                          <colgroup>
                            <col style={{ width: '70px' }} />
                            <col style={{ width: '24px' }} />
                            <col style={{ width: '95px' }} />
                            <col style={{ width: '110px' }} />
                            <col style={{ width: '110px' }} />
                            <col style={{ width: '100px' }} />
                            <col style={{ width: '130px' }} />
                            <col style={{ width: '130px' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th
                                className="text-left whitespace-nowrap"
                                style={{
                                  background: 'var(--ink)',
                                  color: dayLabelColor,
                                  padding: '2px 6px',
                                }}
                              >
                                {dayLabel}
                                {!isInMonth && <span style={{ marginLeft: 4, fontSize: '0.65rem' }}>(対象外)</span>}
                              </th>
                              <th style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px', textAlign: 'center' }}>
                                #
                              </th>
                              <th className="text-left whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px' }}>
                                利用者名
                              </th>
                              <th className="text-left whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px' }}>
                                迎場所
                              </th>
                              <th className="text-left whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px' }}>
                                送場所
                              </th>
                              <th className="text-left whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px' }}>
                                時間
                              </th>
                              <th className="text-left whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px' }}>
                                迎担当
                              </th>
                              <th className="text-left whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff', padding: '2px 4px' }}>
                                送担当
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {padded.map((r, i) => {
                              const cellStyle: React.CSSProperties = {
                                padding: '2px 4px',
                                border: '1px solid var(--rule)',
                                fontSize: '0.7rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              };
                              return (
                                <tr key={i}>
                                  <td style={{ ...cellStyle, background: 'var(--bg)' }}>&nbsp;</td>
                                  <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--ink-3)' }}>{i + 1}</td>
                                  <td style={{ ...cellStyle, fontWeight: r ? 600 : 400 }}>
                                    {r?.childName ?? ''}
                                  </td>
                                  <td style={cellStyle}>
                                    {r ? (
                                      r.pickupMethod === 'self' ? (
                                        '保護者'
                                      ) : (
                                        <>
                                          <span style={{ color: 'var(--accent)' }}>迎</span> {r.pickupLabel || '-'}
                                        </>
                                      )
                                    ) : ''}
                                  </td>
                                  <td style={cellStyle}>
                                    {r ? (
                                      r.dropoffMethod === 'self' ? (
                                        '保護者'
                                      ) : (
                                        <>
                                          <span style={{ color: 'var(--green)' }}>送</span> {r.dropoffLabel || '-'}
                                        </>
                                      )
                                    ) : ''}
                                  </td>
                                  <td style={cellStyle}>
                                    {r ? (
                                      <>
                                        <span style={{ color: 'var(--accent)' }}>迎</span> {r.pickupTime || '-'}
                                        {' '}
                                        <span style={{ color: 'var(--green)' }}>送</span> {r.dropoffTime || '-'}
                                      </>
                                    ) : ''}
                                  </td>
                                  <td style={cellStyle}>
                                    {r
                                      ? r.pickupMethod === 'self'
                                        ? '保護者'
                                        : (() => {
                                            const mark = extractEmoji(r.pickupLabel);
                                            const names = r.pickupStaffNames || '-';
                                            return mark ? `${mark} ${names}` : names;
                                          })()
                                      : ''}
                                  </td>
                                  <td style={cellStyle}>
                                    {r
                                      ? r.dropoffMethod === 'self'
                                        ? '保護者'
                                        : (() => {
                                            const mark = extractEmoji(r.dropoffLabel);
                                            const names = r.dropoffStaffNames || '-';
                                            return mark ? `${mark} ${names}` : names;
                                          })()
                                      : ''}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
