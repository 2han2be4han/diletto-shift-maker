'use client';

import type { ReactNode } from 'react';
import { useSidebarToggle } from '@/components/layout/AppShell';
import NotificationBell from '@/components/layout/NotificationBell';
import MonthSelector from '@/components/layout/MonthSelector';

type HeaderProps = {
  title: string;
  onMenuToggle?: () => void;
  actions?: ReactNode;
  /** Phase 25: 対象月セレクタを表示（/schedule /shift /transport /request） */
  showMonthSelector?: boolean;
};

/**
 * ページヘッダー
 * - タブレット以下: ハンバーガーメニューボタン → サイドバー開閉
 * - デスクトップ: ページタイトル + 右側にアクションボタン
 *
 * onMenuToggle未指定時はSidebarContextのtoggleを使用
 */
export default function Header({ title, onMenuToggle, actions, showMonthSelector }: HeaderProps) {
  const { toggle } = useSidebarToggle();
  const handleToggle = onMenuToggle || toggle;

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-4 px-6 py-3 shrink-0"
      style={{
        borderBottom: '1px solid var(--rule)',
        background: 'var(--white)',
      }}
    >
      <div className="flex items-center gap-4">
        {/* ハンバーガー（タブレット以下のみ表示） */}
        <button
          onClick={handleToggle}
          className="flex flex-col justify-center items-center w-8 h-8 gap-1.5 hover:opacity-70 transition-opacity"
          aria-label="メニューを切替"
        >
          <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
          <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
          <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
        </button>

        <h1
          className="text-lg font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {showMonthSelector && <MonthSelector />}
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
