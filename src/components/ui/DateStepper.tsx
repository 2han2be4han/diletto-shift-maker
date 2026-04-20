'use client';

import { useRef, useState } from 'react';
import { addDays, addMonths, endOfMonth, format, getDay, getDaysInMonth, isSameDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import DatePopover, { DayState } from './DatePopover';
import { todayStr } from '@/lib/date/isToday';
import { isJpHoliday, jpHolidayName } from '@/lib/date/holidays';

type DateStepperProps = {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  dayStates?: Map<string, DayState>;
};

function toDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toStr(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * 日付ステッパ: ⟪前月 ⟨前日 [2026年4月22日(水) 📅] 翌日⟩ 翌月⟫ + 「今日へ」
 * 📅 ボタンクリックで DatePopover（自前カレンダー）が開く
 */
export default function DateStepper({ value, onChange, dayStates }: DateStepperProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const today = todayStr();

  const dt = /^\d{4}-\d{2}-\d{2}$/.test(value) ? toDate(value) : new Date();
  const label = format(dt, 'yyyy年M月d日（E）', { locale: ja });
  const isToday = value === today;
  /* Phase 58: 土日祝はラベル色を変える（日曜・祝日=赤、土曜=accent、平日=ink） */
  const dow = getDay(dt);
  const holiday = isJpHoliday(value);
  const holidayName = holiday ? jpHolidayName(value) : null;
  const labelColor = holiday || dow === 0 ? 'var(--red)' : dow === 6 ? 'var(--accent)' : 'var(--ink)';

  /* 月境界までの差分で disabled 判定（翌月・前月ボタンは常に有効、前日・翌日は月境界でも効く設計でも良いが
     ここは UX 優先で常に有効にする = クリックで自然に月も跨ぐ） */
  const goPrevDay = () => onChange(toStr(subDays(dt, 1)));
  const goNextDay = () => onChange(toStr(addDays(dt, 1)));
  const goPrevMonth = () => {
    const prev = subMonths(dt, 1);
    /* 日数の少ない月に移動した時は末日にクリップ */
    const clip = Math.min(dt.getDate(), getDaysInMonth(prev));
    const target = new Date(prev.getFullYear(), prev.getMonth(), clip);
    onChange(toStr(target));
  };
  const goNextMonth = () => {
    const next = addMonths(dt, 1);
    const clip = Math.min(dt.getDate(), getDaysInMonth(next));
    const target = new Date(next.getFullYear(), next.getMonth(), clip);
    onChange(toStr(target));
  };
  const goToday = () => onChange(today);

  const btnBase: React.CSSProperties = {
    background: 'var(--white)',
    color: 'var(--ink-2)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
  };
  const chevronBtn = 'w-8 h-8 inline-flex items-center justify-center text-sm font-semibold transition-colors';

  const firstOfMonth = startOfMonth(dt);
  const lastOfMonth = endOfMonth(dt);

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={goPrevMonth}
          className={chevronBtn}
          style={btnBase}
          aria-label="前の月"
          title="前の月"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        >
          ⟪
        </button>
        <button
          type="button"
          onClick={goPrevDay}
          className={chevronBtn}
          style={btnBase}
          aria-label="前の日"
          title={isSameDay(dt, firstOfMonth) ? '前月末日へ' : '前の日'}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        >
          ‹
        </button>
      </div>

      {/* 中央の日付ボタン + 📅 */}
      <div className="relative">
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 font-bold transition-all"
          style={{
            color: labelColor,
            background: 'var(--white)',
            border: '1.5px solid var(--accent)',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '0.95rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; }}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={holidayName ? `祝日: ${holidayName}` : 'カレンダーを開く'}
        >
          <span>{label}</span>
          {holidayName && (
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--red)', opacity: 0.9 }}
            >
              {holidayName}
            </span>
          )}
          {/* 今日マーカー: 今日を表示中は数字の右肩に accent ドット */}
          {isToday && (
            <span
              aria-hidden
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 0 2px var(--accent-pale)',
              }}
            />
          )}
          <span style={{ fontSize: '1rem', lineHeight: 1 }}>📅</span>
        </button>

        <DatePopover
          open={open}
          value={value}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          dayStates={dayStates}
          anchorRef={anchorRef}
          allowMonthBrowse
        />
      </div>

      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={goNextDay}
          className={chevronBtn}
          style={btnBase}
          aria-label="次の日"
          title={isSameDay(dt, lastOfMonth) ? '翌月1日へ' : '次の日'}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        >
          ›
        </button>
        <button
          type="button"
          onClick={goNextMonth}
          className={chevronBtn}
          style={btnBase}
          aria-label="次の月"
          title="次の月"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        >
          ⟫
        </button>
      </div>

      {/* 今日でない時だけ表示: 「今日へ」ゴーストボタン */}
      {!isToday && (
        <button
          type="button"
          onClick={goToday}
          className="text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          title="今日の日付にジャンプ"
        >
          今日へ
        </button>
      )}
    </div>
  );
}
