'use client';

import { format, getDaysInMonth, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';

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
  note: string | null; // 追・休、定・休 など
};

type ScheduleGridProps = {
  year: number;
  month: number;
  children: ScheduleChild[];
  cells: ScheduleCellData[];
  onCellClick: (childId: string, date: string) => void;
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

export default function ScheduleGrid({
  year,
  month,
  children,
  cells,
  onCellClick,
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

  /* 曜日に応じた列ヘッダーの色 */
  const getDowStyle = (dow: number): React.CSSProperties => {
    if (dow === 0) return { color: 'var(--red)', background: 'rgba(155,51,51,0.04)' };
    if (dow === 6) return { color: 'var(--accent)', background: 'rgba(26,62,184,0.04)' };
    return {};
  };

  /* 日曜かどうかで列の背景を変える */
  const getCellBg = (dow: number): string => {
    if (dow === 0) return 'rgba(155,51,51,0.03)';
    if (dow === 6) return 'rgba(26,62,184,0.03)';
    return 'transparent';
  };

  return (
    <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
      <table
        className="w-full border-collapse"
        style={{ minWidth: `${dates.length * 80 + 140}px`, fontSize: '0.8rem' }}
      >
        <thead>
          {/* 曜日 + 日付ヘッダー */}
          <tr>
            <th
              className="sticky left-0 z-10 px-3 py-2 text-left font-semibold"
              style={{
                background: 'var(--white)',
                borderBottom: '2px solid var(--rule-strong)',
                borderRight: '2px solid var(--rule-strong)',
                minWidth: '140px',
                color: 'var(--ink)',
              }}
            >
              氏名
            </th>
            {dates.map((d) => (
              <th
                key={d.dateStr}
                className="px-1 py-2 text-center font-semibold whitespace-nowrap"
                style={{
                  borderBottom: '2px solid var(--rule-strong)',
                  borderRight: '1px solid var(--rule)',
                  minWidth: '72px',
                  background: getCellBg(d.dow),
                  ...getDowStyle(d.dow),
                  color: getDowStyle(d.dow).color || 'var(--ink-2)',
                }}
              >
                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  {d.dow === 0 || d.dow === 6 ? '休' : '営'}
                </div>
                <div>
                  {d.day}
                  <span style={{ fontSize: '0.7rem' }}>({DOW_SHORT[d.dow]})</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children.map((child) => (
            <tr key={child.id}>
              {/* 児童名（固定列） */}
              <td
                className="sticky left-0 z-10 px-3 py-2 font-medium whitespace-nowrap"
                style={{
                  background: 'var(--white)',
                  borderBottom: '1px solid var(--rule)',
                  borderRight: '2px solid var(--rule-strong)',
                  color: 'var(--ink)',
                }}
              >
                <div className="font-semibold">{child.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>{child.grade_label}</div>
              </td>
              {dates.map((d) => {
                const cell = cellMap.get(`${child.id}_${d.dateStr}`);
                const hasData = cell && (cell.pickup_time || cell.dropoff_time);

                return (
                  <td
                    key={d.dateStr}
                    className="px-1 py-1 text-center cursor-pointer transition-colors hover:bg-[var(--accent-pale)]"
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      borderRight: '1px solid var(--rule)',
                      background: getCellBg(d.dow),
                    }}
                    onClick={() => onCellClick(child.id, d.dateStr)}
                  >
                    {cell?.note ? (
                      /* 追・休 や 定・休 などの特殊表示 */
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--accent)' }}
                      >
                        {cell.note}
                      </span>
                    ) : hasData ? (
                      <div className="flex flex-col gap-0 leading-tight">
                        <span style={{ color: 'var(--accent)', fontSize: '0.72rem' }}>
                          迎 {cell.pickup_time}
                        </span>
                        <span style={{ color: 'var(--green)', fontSize: '0.72rem' }}>
                          送 {cell.dropoff_time}
                        </span>
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* 利用数合計行 */}
          <tr>
            <td
              className="sticky left-0 z-10 px-3 py-2 font-bold"
              style={{
                background: 'var(--white)',
                borderTop: '2px solid var(--rule-strong)',
                borderRight: '2px solid var(--rule-strong)',
                color: 'var(--ink)',
              }}
            >
              利用数
            </td>
            {dates.map((d) => {
              const count = dailyCounts.get(d.dateStr) || 0;
              return (
                <td
                  key={d.dateStr}
                  className="px-1 py-2 text-center font-bold"
                  style={{
                    borderTop: '2px solid var(--rule-strong)',
                    borderRight: '1px solid var(--rule)',
                    color: count >= 8 ? 'var(--red)' : count > 0 ? 'var(--green)' : 'var(--ink-3)',
                    background: getCellBg(d.dow),
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
