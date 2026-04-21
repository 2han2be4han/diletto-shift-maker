'use client';

import { resetAllTours } from '@/lib/tour/storage';

/**
 * 使い方ツアーの完了状態を全リセットするボタン。
 * 設定ページに配置する。押すと localStorage のツアー関連キーをクリアし、
 * 次回各ページアクセス時に自動ツアーが再表示される。
 */
export default function TourResetButton() {
  const handleClick = () => {
    if (!confirm('使い方ツアーの完了状態をリセットしますか？\n次回各ページを開いたときに自動でツアーが再表示されます。')) return;
    resetAllTours();
    alert('リセットしました。ページを再読み込みしてください。');
  };

  return (
    <button
      type="button"
      data-tour="tour-reset"
      onClick={handleClick}
      className="text-xs font-semibold px-3 py-2 transition-all hover:opacity-80 self-start whitespace-nowrap"
      style={{
        background: 'var(--white)',
        color: 'var(--ink-2)',
        borderRadius: '6px',
        border: '1px solid var(--rule-strong)',
      }}
    >
      📖 使い方ツアーをもう一度見る
    </button>
  );
}
