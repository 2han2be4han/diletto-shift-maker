'use client';

import React, { useEffect, useRef } from 'react';
import { format, getDaysInMonth, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { todayStr } from '@/lib/date/isToday';
import { isJpHoliday, jpHolidayName } from '@/lib/date/holidays';
import { isDateOutOfRange } from '@/lib/date/dateLimit';
import { StaffRole } from '@/types';

/**
 * 利用予定グリッド（児童×日付）
 * - 行: 児童名
 * - 列: 日付（1日〜末日）
 * - セル: 迎え時間 + 送り時間
 * - 最下行: 利用人数合計
 * - セルクリックで編集
 */

type ScheduleChild = {
  id: string;
  name: string;
  grade_label: string;
};

type ScheduleCellData = {
  child_id: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  pickup_method: 'self' | 'pickup'; // self=自分で来る, pickup=お迎え
  dropoff_method: 'self' | 'dropoff'; // self=自分で帰る, dropoff=送り
  note: string | null; // 追・休、定・休 など
  /** Phase 42: セルに状態バッジを出すための追加項目 */
  entry_id?: string | null;
  attendance_status?: 'planned' | 'present' | 'absent' | 'late' | 'early_leave' | 'leave';
};

type ScheduleGridProps = {
  year: number;
  month: number;
  children: ScheduleChild[];
  cells: ScheduleCellData[];
  onCellClick: (childId: string, date: string) => void;
  myRole: StaffRole;
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

/** "HH:MM:SS" / "HH:MM" / "H:MM" → "HH:MM" に整形（秒を切り捨て、ゼロ埋め） */
function formatHM(raw: string | null | undefined): string {
  if (!raw) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export default function ScheduleGrid({
  year,
  month,
  children,
  cells,
  onCellClick,
  myRole,
}: ScheduleGridProps) {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const dates: { day: number; dow: number; dateStr: string }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    dates.push({
      day: d,
      dow: getDay(dateObj),
      dateStr: format(dateObj, 'yyyy-MM-dd'),
    });
  }

  /* セルデータを高速検索用にマップ化 */
  const cellMap = new Map<string, ScheduleCellData>();
  cells.forEach((c) => {
    cellMap.set(`${c.child_id}_${c.date}`, c);
  });

  /* 各日の利用人数 */
  const dailyCounts = new Map<string, number>();
  dates.forEach((d) => {
    let count = 0;
    children.forEach((child) => {
      const cell = cellMap.get(`${child.id}_${d.dateStr}`);
      if (cell && (cell.pickup_time || cell.dropoff_time)) count++;
    });
    dailyCounts.set(d.dateStr, count);
  });

  /* Phase 56: 今日列の視覚ハイライト + マウント時の自動スクロール */
  const today = todayStr();
  const todayInMonth = dates.some((d) => d.dateStr === today);
  const todayHeaderRef = useRef<HTMLTableCellElement | null>(null);
  useEffect(() => {
    if (!todayInMonth) return;
    todayHeaderRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [todayInMonth, today]);

  /* 曜日に応じた列ヘッダーの色（祝日は日曜と同じ赤扱い） */
  const getDowStyle = (dow: number, isHoliday = false): React.CSSProperties => {
    if (isHoliday || dow === 0) return { color: 'var(--red)', background: 'rgba(155,51,51,0.04)' };
    if (dow === 6) return { color: 'var(--accent)', background: 'rgba(26,62,184,0.04)' };
    return {};
  };

  /* 日曜かどうかで列の背景を変える */
  const getCellBg = (dow: number): string => {
    if (dow === 0) return 'rgba(155,51,51,0.03)';
    if (dow === 6) return 'rgba(26,62,184,0.03)';
    return 'transparent';
  };

  /* sticky ヘッダー/フッター用: 半透明 tint の下に不透明な var(--bg) を敷いて
     スクロール時にデータ行が透けないようにする */
  const getStickyBg = (dow: number): string => {
    const tint = getCellBg(dow);
    if (tint === 'transparent') return 'var(--bg)';
    return `linear-gradient(${tint}, ${tint}), var(--bg)`;
  };

  return (
    <div className="flex-1 overflow-auto border-2 rounded-xl" style={{ borderColor: 'var(--rule)', background: 'var(--white)' }}>
      <table
        className="w-full border-separate border-spacing-0"
        style={{ minWidth: `${dates.length * 80 + 160}px`, fontSize: '0.85rem' }}
      >
        <thead>
          <tr>
            <th
              className="sticky left-0 top-0 z-50 px-4 py-4 text-left font-bold"
              style={{
                background: 'var(--bg)',
                borderBottom: '2px solid var(--rule-strong)',
                borderRight: '2px solid var(--rule-strong)',
                minWidth: '160px',
                color: 'var(--ink)',
                boxShadow: '4px 4px 10px rgba(0,0,0,0.03)',
              }}
            >
              氏名
            </th>
            {dates.map((d) => {
              const isTodayCol = d.dateStr === today;
              const holiday = isJpHoliday(d.dateStr);
              const holidayName = holiday ? jpHolidayName(d.dateStr) : null;
              const titleBits: string[] = [];
              if (isTodayCol) titleBits.push('今日');
              if (holidayName) titleBits.push(holidayName);
              return (
                <th
                  key={d.dateStr}
                  ref={isTodayCol ? todayHeaderRef : undefined}
                  className="sticky top-0 z-30 px-1 py-1.5 text-center font-bold whitespace-nowrap"
                  style={{
                    borderBottom: '2px solid var(--rule-strong)',
                    borderRight: isTodayCol ? '2px solid var(--accent)' : '1px solid var(--rule)',
                    borderLeft: isTodayCol ? '2px solid var(--accent)' : undefined,
                    minWidth: '80px',
                    ...getDowStyle(d.dow, holiday),
                    background: isTodayCol ? 'var(--accent-pale-solid)' : getStickyBg(d.dow),
                    color: isTodayCol ? 'var(--accent)' : holiday ? 'var(--red)' : undefined,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                  }}
                  title={titleBits.join('\n') || undefined}
                >
                  <div style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '2px' }}>
                    {holiday ? '祝' : d.dow === 0 || d.dow === 6 ? '休' : '営'}
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>
                    {month}/{d.day}
                  </div>
                  <div style={{ fontSize: '0.65rem' }}>
                    ({DOW_SHORT[d.dow]})
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {children.map((child) => (
            /* Phase 47: 行ホバー UX に統一。group-hover でインライン背景を持つセルも一括ハイライト。
               インライン background は CSS class より優先されるため、!important 付き Tailwind が必要。 */
            <tr key={child.id} className="group cursor-pointer transition-colors">
              <td
                className="sticky left-0 z-20 px-4 py-3 font-semibold whitespace-nowrap group-hover:!bg-[var(--accent-pale-solid)] transition-colors"
                style={{
                  background: 'var(--white)',
                  borderBottom: '1px solid var(--rule)',
                  borderRight: '2px solid var(--rule-strong)',
                  color: 'var(--ink)',
                  boxShadow: '4px 0 6px rgba(0,0,0,0.02)',
                }}
              >
                <div className="group-hover:text-[var(--accent)] transition-colors">{child.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--ink-3)', marginTop: '2px' }}>{child.grade_label}</div>
              </td>
              {dates.map((d) => {
                const cell = cellMap.get(`${child.id}_${d.dateStr}`);
                const hasTimes = !!(cell && (cell.pickup_time || cell.dropoff_time));
                /* 状態判定
                   - 未入力: entry が存在しない（cell == null or entry_id == null）
                   - 欠席: attendance_status='absent'
                   - お休み: attendance_status='leave'、または entry あり / times 両方 null（旧データ互換）
                   - 出席: times あり */
                const hasEntry = !!cell && (cell.entry_id ?? null) !== null;
                const isAbsent = cell?.attendance_status === 'absent';
                const isLeave = cell?.attendance_status === 'leave';
                const isOff = isLeave || (hasEntry && !hasTimes && !isAbsent);

                /* セル背景: 状態によって淡くハイライト */
                let bg = getCellBg(d.dow);
                if (isAbsent) bg = 'var(--red-pale)';
                else if (isOff) bg = 'rgba(0,0,0,0.04)';

                const isTodayCol = d.dateStr === today;
                const isRestricted = isDateOutOfRange(d.dateStr, myRole ?? 'viewer');

                return (
                  <td
                    key={d.dateStr}
                    className={`px-1 py-1 text-center transition-colors ${!isRestricted ? 'cursor-pointer group-hover:!bg-[var(--accent-pale)]' : 'cursor-not-allowed'}`}
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      borderRight: isTodayCol ? '2px solid var(--accent)' : '1px solid var(--rule)',
                      borderLeft: isTodayCol ? '2px solid var(--accent)' : undefined,
                      background: isRestricted 
                        ? 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.03) 5px, rgba(0,0,0,0.03) 10px), var(--bg)'
                        : bg,
                      opacity: isRestricted ? 0.7 : 1,
                    }}
                    onClick={() => !isRestricted && onCellClick(child.id, d.dateStr)}
                    title={
                      isRestricted ? '閲覧制限により表示できません' :
                      isAbsent ? '欠席' : isOff ? 'お休み' : hasTimes ? '出席' : '未入力（クリックで編集）'
                    }
                  >
                    {isRestricted ? (
                      <span style={{ fontSize: '1rem', opacity: 0.4 }}>🔒</span>
                    ) : cell?.note ? (
                      /* 追・休 や 定・休 などの特殊表示 */
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--accent)' }}
                      >
                        {cell.note}
                      </span>
                    ) : isAbsent ? (
                      <span
                        className="text-xs font-bold"
                        style={{ color: 'var(--red)' }}
                      >
                        欠席
                      </span>
                    ) : isOff ? (
                      <span
                        className="text-xs font-bold"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        お休み
                      </span>
                    ) : hasTimes ? (
                      <div className="flex flex-col gap-0 leading-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {cell?.pickup_time && (
                          cell.pickup_method === 'self' ? (
                            <span style={{ color: 'var(--ink-3)', fontSize: '0.72rem' }}>
                              自 {formatHM(cell.pickup_time)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--accent)', fontSize: '0.72rem' }}>
                              迎 {formatHM(cell.pickup_time)}
                            </span>
                          )
                        )}
                        {cell?.dropoff_time && (
                          cell.dropoff_method === 'self' ? (
                            <span style={{ color: 'var(--ink-3)', fontSize: '0.72rem' }}>
                              自 {formatHM(cell.dropoff_time)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--green)', fontSize: '0.72rem' }}>
                              送 {formatHM(cell.dropoff_time)}
                            </span>
                          )
                        )}
                      </div>
                    ) : (
                      /* 未入力（entry が無い） */
                      <span
                        className="text-xs"
                        style={{ color: 'var(--ink-3)', opacity: 0.5 }}
                      >
                        −
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* 利用数合計行 */}
          <tr>
            <td
              className="sticky left-0 bottom-0 z-50 px-4 py-3 font-bold"
              style={{
                background: 'var(--bg)',
                borderTop: '2px solid var(--rule-strong)',
                borderRight: '2px solid var(--rule-strong)',
                color: 'var(--ink)',
                boxShadow: '4px -4px 6px rgba(0,0,0,0.02)',
              }}
            >
              利用数
            </td>
            {dates.map((d) => {
              const count = dailyCounts.get(d.dateStr) || 0;
              const isTodayCol = d.dateStr === today;
              return (
                <td
                  key={d.dateStr}
                  className="sticky bottom-0 z-40 px-1 py-2 text-center font-bold"
                  style={{
                    borderTop: '2px solid var(--rule-strong)',
                    borderRight: isTodayCol ? '2px solid var(--accent)' : '1px solid var(--rule)',
                    borderLeft: isTodayCol ? '2px solid var(--accent)' : undefined,
                    color: count > 10 ? 'var(--red)' : count > 0 ? 'var(--green)' : 'var(--ink-3)',
                    fontWeight: count > 10 ? 800 : 700,
                    background: isTodayCol ? 'var(--accent-pale-solid)' : getStickyBg(d.dow),
                    boxShadow: '0 -4px 4px rgba(0,0,0,0.02)',
                  }}
                >
                  {count > 0 ? count : ''}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
