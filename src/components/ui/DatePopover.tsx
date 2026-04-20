'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, getDay, getDaysInMonth, startOfMonth, subMonths } from 'date-fns';
import { todayStr } from '@/lib/date/isToday';
import { isJpHoliday, jpHolidayName } from '@/lib/date/holidays';
import { useCurrentStaff } from '@/components/layout/AppShell';
import { isDateOutOfRange } from '@/lib/date/dateLimit';

export type DayState = {
  locked?: boolean;
  unassigned?: boolean;
  /** Phase 57-b: 未保存編集あり。locked と同時に true でもこちらを優先表示（編集中は保存済を隠す） */
  editing?: boolean;
};

type DatePopoverProps = {
  open: boolean;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  onClose: () => void;
  dayStates?: Map<string, DayState>;
  /** 表示月を value と独立に切替可能にするか（送迎表は true）。false なら value の月だけ */
  allowMonthBrowse?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DatePopover({
  open,
  value,
  onChange,
  onClose,
  dayStates,
  allowMonthBrowse = true,
  anchorRef,
}: DatePopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [viewYm, setViewYm] = useState<{ year: number; month: number }>(() => {
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : new Date();
    return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
  });

  /* value が変わったら表示月を追従（外部からの遷移に合わせる） */
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const [y, m] = value.split('-').map(Number);
    setViewYm({ year: y, month: m });
  }, [value]);

  /* クリック外 / Esc で閉じる */
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  const { year, month } = viewYm;
  const today = todayStr();
  const { staff } = useCurrentStaff();
  const role = staff?.role ?? 'viewer';

  const cells = useMemo(() => {
    const first = startOfMonth(new Date(year, month - 1, 1));
    const leadingBlanks = getDay(first);
    const daysInMonth = getDaysInMonth(first);
    const list: Array<{ day: number | null; date?: string; dow?: number }> = [];
    for (let i = 0; i < leadingBlanks; i++) list.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = keyOf(year, month, d);
      const dow = getDay(new Date(year, month - 1, d));
      list.push({ day: d, date, dow });
    }
    /* 末尾を 7 の倍数に（レイアウト安定のため） */
    while (list.length % 7 !== 0) list.push({ day: null });
    return list;
  }, [year, month]);

  if (!open) return null;

  const canPrev = allowMonthBrowse;
  const canNext = allowMonthBrowse;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="日付を選択"
      className="absolute z-50 mt-2 p-3 shadow-xl"
      style={{
        left: 0,
        top: '100%',
        width: '300px',
        background: 'var(--white)',
        border: '1px solid var(--rule)',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
      }}
    >
      {/* 月ナビ */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => {
            if (!canPrev) return;
            const d = subMonths(new Date(year, month - 1, 1), 1);
            setViewYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
          }}
          disabled={!canPrev}
          className="w-7 h-7 inline-flex items-center justify-center rounded transition-colors disabled:opacity-30"
          style={{ color: 'var(--ink-2)' }}
          aria-label="前の月"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          ‹
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {year}年{month}月
        </div>
        <button
          type="button"
          onClick={() => {
            if (!canNext) return;
            const d = addMonths(new Date(year, month - 1, 1), 1);
            setViewYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
          }}
          disabled={!canNext}
          className="w-7 h-7 inline-flex items-center justify-center rounded transition-colors disabled:opacity-30"
          style={{ color: 'var(--ink-2)' }}
          aria-label="次の月"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          ›
        </button>
      </div>

      {/* 曜日ヘッダ */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DOW_LABELS.map((l, i) => (
          <div
            key={l}
            className="text-center text-xs font-semibold py-1"
            style={{ color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--accent)' : 'var(--ink-3)' }}
          >
            {l}
          </div>
        ))}
      </div>

      {/* 日グリッド */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, idx) => {
          if (c.day == null) return <div key={idx} />;
          const isSelected = c.date === value;
          const isToday = c.date === today;
          const state = c.date ? dayStates?.get(c.date) : undefined;
          const isWeekend = c.dow === 0 || c.dow === 6;
          const holiday = c.date ? isJpHoliday(c.date) : false;
          const holidayName = holiday && c.date ? jpHolidayName(c.date) : null;
          const isDisabled = c.date ? isDateOutOfRange(c.date, role) : false;

          const color = isSelected
            ? 'var(--white)'
            : isDisabled
            ? 'var(--ink-3)'
            : holiday || c.dow === 0
            ? 'var(--red)'
            : c.dow === 6
            ? 'var(--accent)'
            : 'var(--ink)';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => c.date && !isDisabled && onChange(c.date)}
              disabled={isDisabled}
              className="relative h-9 w-full rounded-md text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: isSelected ? 'var(--accent)' : 'transparent',
                color,
                border: isToday && !isSelected ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                fontWeight: isSelected || isToday ? 700 : 500,
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !isDisabled) e.currentTarget.style.background = 'var(--accent-pale)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isDisabled) e.currentTarget.style.background = 'transparent';
              }}
              aria-pressed={isSelected}
              aria-label={`${year}年${month}月${c.day}日${isToday ? '（今日）' : ''}${holidayName ? `（${holidayName}）` : ''}${isDisabled ? '（参照制限あり）' : ''}`}
              title={isDisabled ? '閲覧制限により選択できません' : (holidayName ?? undefined)}
            >
              <span>{c.day}</span>
              {/* ドット: 編集中 = gold / 🔒保存済 = accent / ⚠未割当 = red（編集中は保存済を上書き非表示） */}
              {(state?.editing || (state?.locked && !state?.editing) || state?.unassigned) && (
                <div
                  className="absolute flex items-center gap-0.5"
                  style={{ bottom: '3px', left: '50%', transform: 'translateX(-50%)' }}
                >
                  {state?.editing && (
                    <span
                      aria-hidden
                      style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: isSelected ? 'var(--white)' : 'var(--gold, #d4a017)',
                      }}
                    />
                  )}
                  {state?.locked && !state?.editing && (
                    <span
                      aria-hidden
                      style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: isSelected ? 'var(--white)' : 'var(--accent)',
                      }}
                    />
                  )}
                  {state?.unassigned && (
                    <span
                      aria-hidden
                      style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: isSelected ? 'var(--white)' : 'var(--red)',
                      }}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 凡例 + アクション */}
      <div
        className="mt-3 pt-2 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--rule)', fontSize: '0.7rem', color: 'var(--ink-3)' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {dayStates && dayStates.size > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--gold, #d4a017)' }} />
                編集中
              </span>
              <span className="inline-flex items-center gap-1">
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)' }} />
                保存済
              </span>
              <span className="inline-flex items-center gap-1">
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--red)' }} />
                未割当
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(today);
          }}
          className="text-xs font-semibold px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--accent)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          今日へ
        </button>
      </div>
    </div>
  );
}
