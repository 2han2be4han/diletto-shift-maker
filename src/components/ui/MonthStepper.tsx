'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addMonths, format, subMonths } from 'date-fns';

/**
 * 月ステッパ: ⟪前年 ⟨前月 [2026年4月] 翌月⟩ 翌年⟫ + 「今月へ」
 * URL ?month=YYYY-MM を唯一の真実として扱う（MonthSelector と同じ契約）。
 */

function nextMonthStr(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

function thisMonthStr(): string {
  return format(new Date(), 'yyyy-MM');
}

const STORAGE_KEY = 'shift-puzzle.current-month';

type MonthStepperProps = {
  /** ⟪ / ⟫（年送り）を表示するか。デフォルト false（シフト/利用表などでは不要との要望） */
  showYearJump?: boolean;
};

export default function MonthStepper({ showYearJump = false }: MonthStepperProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlMonth = searchParams.get('month');
  const isValid = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth);
  const current = isValid ? urlMonth : nextMonthStr();
  const thisMonth = thisMonthStr();
  const isCurrentMonth = current === thisMonth;

  const setMonth = (next: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', next);
    /* 月が変わる = date はもう意味が無いので削除。useTransportDate が fallback で解決する */
    params.delete('date');
    router.push(`${pathname}?${params.toString()}`);
  };

  const shift = (ym: string, delta: number): string => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const next = delta > 0 ? addMonths(d, delta) : subMonths(d, -delta);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  };

  const [y, m] = current.split('-').map(Number);

  const btnBase: React.CSSProperties = {
    background: 'var(--white)',
    color: 'var(--ink-2)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
  };
  const chevronBtn = 'w-8 h-8 inline-flex items-center justify-center text-sm font-semibold transition-colors';

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap" role="group" aria-label="対象月">
      <div className="inline-flex items-center gap-1">
        {showYearJump && (
          <button
            type="button"
            onClick={() => setMonth(shift(current, -12))}
            className={chevronBtn}
            style={btnBase}
            aria-label="前の年"
            title="前の年"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
          >
            ⟪
          </button>
        )}
        <button
          type="button"
          onClick={() => setMonth(shift(current, -1))}
          className={chevronBtn}
          style={btnBase}
          aria-label="前の月"
          title="前の月"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        >
          ‹
        </button>
      </div>

      <div
        className="inline-flex items-center gap-2 font-bold"
        style={{
          color: 'var(--ink)',
          background: 'var(--white)',
          border: '1.5px solid var(--accent)',
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '0.95rem',
          minWidth: '110px',
          justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <span>{y}年{m}月</span>
        {isCurrentMonth && (
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
      </div>

      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMonth(shift(current, 1))}
          className={chevronBtn}
          style={btnBase}
          aria-label="次の月"
          title="次の月"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        >
          ›
        </button>
        {showYearJump && (
          <button
            type="button"
            onClick={() => setMonth(shift(current, 12))}
            className={chevronBtn}
            style={btnBase}
            aria-label="次の年"
            title="次の年"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
          >
            ⟫
          </button>
        )}
      </div>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={() => setMonth(thisMonth)}
          className="text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pale)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          title="今月にジャンプ"
        >
          今月へ
        </button>
      )}
    </div>
  );
}
