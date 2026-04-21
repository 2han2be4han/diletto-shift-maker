'use client';

import { usePathname } from 'next/navigation';
import { useTour } from '@/lib/tour/useTour';
import { resolveTourKey } from '@/lib/tour/tours';

/**
 * 「📖 使い方を見る」ボタン。
 * - 現在の pathname から対応する TourKey を解決してツアーを起動
 * - Header の右側に配置される（actions とは別に常時表示）
 */
export default function TourButton() {
  const pathname = usePathname();
  const { start } = useTour();
  const key = resolveTourKey(pathname);
  if (!key) return null;

  return (
    <button
      type="button"
      data-tour="tour-button"
      onClick={() => start(key)}
      className="text-xs lg:text-sm font-semibold px-3 py-1.5 transition-all hover:opacity-80 whitespace-nowrap"
      style={{
        background: 'var(--accent-pale)',
        color: 'var(--accent)',
        borderRadius: '6px',
        border: '1px solid var(--accent)',
      }}
      title="このページの使い方を見る"
    >
      📖 使い方を見る
    </button>
  );
}
