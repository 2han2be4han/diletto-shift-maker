'use client';

import type { ReactNode } from 'react';
import { useSidebarToggle } from '@/components/layout/AppShell';
import NotificationBell from '@/components/layout/NotificationBell';

type HeaderProps = {
  title: string;
  onMenuToggle?: () => void;
  actions?: ReactNode;
  /**
   * @deprecated Phase 57: 廃止。月ナビはページ本体の MonthStepper / DateStepper に移動。
   * 互換のため prop は受け付けるが無視する。
   */
  showMonthSelector?: boolean;
};

/**
 * ページヘッダー
 * - タブレット以下: ハンバーガーメニューボタン → サイドバー開閉
 * - デスクトップ: ページタイトル + 右側にアクションボタン
 *
 * onMenuToggle未指定時はSidebarContextのtoggleを使用
 */
export default function Header({ title, onMenuToggle, actions }: HeaderProps) {
  const { toggle } = useSidebarToggle();
  const handleToggle = onMenuToggle || toggle;

  return (
    <header
      className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 lg:px-6 py-3 shrink-0"
      style={{
        borderBottom: '1px solid var(--rule)',
        background: 'var(--white)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* ハンバーガー（タブレット以下のみ表示） */}
        <button
          onClick={handleToggle}
          className="flex flex-col justify-center items-center w-8 h-8 gap-1.5 hover:opacity-70 transition-opacity shrink-0"
          aria-label="メニューを切替"
        >
          <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
          <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
          <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
        </button>

        <h1
          className="text-base lg:text-lg font-bold whitespace-nowrap"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h1>
      </div>

      <div className="flex items-center flex-wrap gap-2 min-w-0">
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
