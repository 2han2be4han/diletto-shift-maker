'use client';

import { getDaysInMonth, getDay } from 'date-fns';
import type { ShiftAssignmentType } from '@/types';

/**
 * シフトグリッド（職員×日付）
 * - 行: 職員名
 * - 列: 日付（1日〜末日）
 * - セル: 勤務/公休/有給/休み を色分け表示
 * - セルクリックで編集
 * - 不足日をハイライト（赤: 人員不足、黄: 有資格者不足）
 */

type ShiftStaff = {
  id: string;
  name: string;
  employment_type: 'full_time' | 'part_time';
  is_qualified: boolean;
};

type ShiftCell = {
  staff_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  assignment_type: ShiftAssignmentType;
};

type ShiftWarning = {
  date: string;
  type: 'understaffed' | 'no_qualified' | 'overworked';
  message: string;
};

type ShiftGridProps = {
  year: number;
  month: number;
  staff: ShiftStaff[];
  cells: ShiftCell[];
  warnings: ShiftWarning[];
  onCellClick: (staffId: string, date: string) => void;
};

const TYPE_CONFIG: Record<ShiftAssignmentType, { label: string; color: string; bg: string }> = {
  normal: { label: '出勤', color: 'var(--ink)', bg: 'transparent' },
  public_holiday: { label: '公休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  paid_leave: { label: '有給', color: 'var(--green)', bg: 'var(--green-pale)' },
  off: { label: '休', color: 'var(--ink-3)', bg: 'rgba(0,0,0,0.03)' },
};

const DOW_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

export default function ShiftGrid({
  year,
  month,
  staff,
  cells,
  warnings,
  onCellClick,
}: ShiftGridProps) {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const dates: { day: number; dow: number; dateStr: string }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    dates.push({
      day: d,
      dow: getDay(dateObj),
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  /* セルデータをマップ化 */
  const cellMap = new Map<string, ShiftCell>();
  cells.forEach((c) => cellMap.set(`${c.staff_id}_${c.date}`, c));

  /* 警告をマップ化 */
  const warningMap = new Map<string, ShiftWarning[]>();
  warnings.forEach((w) => {
    const existing = warningMap.get(w.date) || [];
    existing.push(w);
    warningMap.set(w.date, existing);
  });

  /* 各日の出勤人数 */
  const dailyWorkingCount = new Map<string, number>();
  dates.forEach((d) => {
    let count = 0;
    staff.forEach((s) => {
      const cell = cellMap.get(`${s.id}_${d.dateStr}`);
      if (cell && cell.assignment_type === 'normal') count++;
    });
    dailyWorkingCount.set(d.dateStr, count);
  });

  const getDowColor = (dow: number) => {
    if (dow === 0) return 'var(--red)';
    if (dow === 6) return 'var(--accent)';
    return 'var(--ink-2)';
  };

  const getCellBg = (dow: number) => {
    if (dow === 0) return 'rgba(155,51,51,0.03)';
    if (dow === 6) return 'rgba(26,62,184,0.03)';
    return 'transparent';
  };

  return (
    <div className="flex-1 overflow-auto border-2 rounded-xl" style={{ borderColor: 'var(--rule)', background: 'var(--white)' }}>
      <table
        className="w-full border-separate border-spacing-0"
        style={{ minWidth: `${dates.length * 56 + 180}px`, fontSize: '0.85rem' }}
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
              職員名
            </th>
            {dates.map((d) => {
              const dayWarnings = warningMap.get(d.dateStr) || [];
              const hasWarning = dayWarnings.length > 0;
              const isUnderstaffed = dayWarnings.some((w) => w.type === 'understaffed');

              return (
                <th
                  key={d.dateStr}
                  className="sticky top-0 z-30 px-1 py-1.5 text-center font-bold whitespace-nowrap"
                  style={{
                    borderBottom: '2px solid var(--rule-strong)',
                    borderRight: '1px solid var(--rule)',
                    minWidth: '56px',
                    background: isUnderstaffed
                      ? 'var(--red-pale)'
                      : hasWarning
                      ? 'var(--gold-pale)'
                      : getCellBg(d.dow) !== 'transparent' ? getCellBg(d.dow) : 'var(--bg)',
                    color: getDowColor(d.dow),
                    boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                  }}
                  title={dayWarnings.map((w) => w.message).join('\n')}
                >
                  <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{DOW_SHORT[d.dow]}</div>
                  <div style={{ fontSize: '0.85rem' }}>{d.day}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="group">
              <td
                className="sticky left-0 z-20 px-4 py-3 font-semibold whitespace-nowrap"
                style={{
                  background: 'var(--white)',
                  borderBottom: '1px solid var(--rule)',
                  borderRight: '2px solid var(--rule-strong)',
                  color: 'var(--ink)',
                  boxShadow: '4px 0 6px rgba(0,0,0,0.02)',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="group-hover:text-[var(--accent)] transition-colors">{s.name}</span>
                  {s.is_qualified && (
                    <span
                      className="text-xs px-1 rounded"
                      style={{ background: 'var(--green-pale)', color: 'var(--green)', fontSize: '0.6rem' }}
                    >
                      有資格
                    </span>
                  )}
                </div>
              </td>
              {dates.map((d) => {
                const cell = cellMap.get(`${s.id}_${d.dateStr}`);
                const type = cell?.assignment_type || 'off';
                const config = TYPE_CONFIG[type];

                return (
                  <td
                    key={d.dateStr}
                    className="px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-[var(--accent-pale)]"
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      borderRight: '1px solid var(--rule)',
                      background: type !== 'normal' ? config.bg : getCellBg(d.dow),
                    }}
                    onClick={() => onCellClick(s.id, d.dateStr)}
                    title={type === 'normal' && cell ? `${cell.start_time}〜${cell.end_time}` : config.label}
                  >
                    {type === 'normal' ? (
                      <div className="flex flex-col gap-0.5 leading-tight py-0.5">
                        <span style={{ color: 'var(--ink-2)', fontSize: '0.68rem' }}>
                          {cell?.start_time?.slice(0, 5)}
                        </span>
                        <span style={{ color: 'var(--ink-3)', fontSize: '0.68rem' }}>
                          {cell?.end_time?.slice(0, 5)}
                        </span>
                      </div>
                    ) : (
                      <span
                        className="font-semibold"
                        style={{ color: config.color, fontSize: '0.7rem' }}
                      >
                        {config.label}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

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
              出勤数
            </td>
            {dates.map((d) => {
              const count = dailyCounts.get(d.dateStr) || 0;
              return (
                <td
                  key={d.dateStr}
                  className="sticky bottom-0 z-40 px-1 py-2 text-center font-bold"
                  style={{
                    borderTop: '2px solid var(--rule-strong)',
                    borderRight: '1px solid var(--rule)',
                    color: count > 3 ? 'var(--green)' : count > 0 ? 'var(--gold)' : 'var(--ink-3)',
                    background: getCellBg(d.dow) !== 'transparent' ? getCellBg(d.dow) : 'var(--bg)',
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
