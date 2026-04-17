'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Phase 25: 全ページ共通の対象月セレクタ
 *
 * - URL クエリ ?month=YYYY-MM を正とする
 * - 初回マウント時、URL に month が無ければ localStorage から復元
 * - 変更は URL と localStorage に保存
 * - `/schedule`, `/shift`, `/transport`, `/request` で参照
 *
 * デフォルト値:
 *   localStorage に保存がなければ「来月」
 *   （4月に翌月 5月分を作る業務フローを想定）
 */
const STORAGE_KEY = 'shiftpuzzle.targetMonth';

function nextMonthStr(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

function shift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlMonth = searchParams.get('month');
  const isValid = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth);
  const current = isValid ? urlMonth : nextMonthStr();

  /* 初回マウント: URL に month 無しなら localStorage or 来月を URL に反映 */
  useEffect(() => {
    if (isValid) {
      try {
        localStorage.setItem(STORAGE_KEY, urlMonth);
      } catch {
        /* noop */
      }
      return;
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    const next = saved && /^\d{4}-\d{2}$/.test(saved) ? saved : nextMonthStr();
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', next);
    router.replace(`${pathname}?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  const setMonth = (next: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', next);
    router.push(`${pathname}?${params.toString()}`);
  };

  const [y, m] = current.split('-').map(Number);

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="対象月">
      <button
        type="button"
        onClick={() => setMonth(shift(current, -1))}
        className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg)]"
        style={{ color: 'var(--ink-2)', border: '1px solid var(--rule)' }}
        aria-label="前の月"
        title="前の月"
      >
        ←
      </button>
      <span
        className="px-2 text-sm font-semibold whitespace-nowrap"
        style={{ color: 'var(--ink)', minWidth: '5.5rem', textAlign: 'center' }}
      >
        {y}年{m}月
      </span>
      <button
        type="button"
        onClick={() => setMonth(shift(current, 1))}
        className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg)]"
        style={{ color: 'var(--ink-2)', border: '1px solid var(--rule)' }}
        aria-label="次の月"
        title="次の月"
      >
        →
      </button>
      <button
        type="button"
        onClick={() => setMonth(nextMonthStr())}
        className="ml-1 px-2 h-7 text-xs rounded transition-colors hover:bg-[var(--bg)]"
        style={{ color: 'var(--ink-3)', border: '1px solid var(--rule)' }}
        title="来月にリセット"
      >
        来月
      </button>
    </div>
  );
}
