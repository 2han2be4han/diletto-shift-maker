'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useCallback } from 'react';

/**
 * サイドバーナビゲーション
 * - デスクトップ: 幅はドラッグで調整可能（180px〜360px、デフォルト240px）
 * - タブレット以下（<1024px）: オーバーレイ表示、トグルボタンで開閉
 */

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'ダッシュボード', icon: '📊' },
  { href: '/schedule', label: '利用予定', icon: '📅' },
  { href: '/shift', label: 'シフト表', icon: '📋' },
  { href: '/transport', label: '送迎表', icon: '🚗' },
  { href: '/request', label: '休み希望', icon: '✋' },
];

const NAV_BOTTOM = [
  { href: '/settings/tenant', label: '設定', icon: '⚙️' },
  { href: '/billing', label: '契約管理', icon: '💳' },
];

const MIN_WIDTH = 180;
const MAX_WIDTH = 360;

export default function Sidebar({ isOpen, onClose, width, onWidthChange }: SidebarProps) {
  const pathname = usePathname();
  const isResizing = useRef(false);

  /* ドラッグでサイドバー幅を変更する */
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onWidthChange]
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const navContent = (
    <>
      {/* ロゴ */}
      <div className="px-5 py-5">
        <Link href="/dashboard" className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
          ShiftPuzzle
        </Link>
      </div>

      {/* メインナビ */}
      <nav className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
                style={{
                  color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-2)',
                  background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* 下部ナビ */}
      <div
        className="px-3 pb-4 pt-2"
        style={{ borderTop: '1px solid var(--rule)' }}
      >
        <ul className="flex flex-col gap-1">
          {NAV_BOTTOM.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
                style={{
                  color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-3)',
                  background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  return (
    <>
      {/* === モバイル/タブレット: オーバーレイ === */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={onClose}
        />
      )}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full flex flex-col
          transition-transform duration-200 ease-in-out
          lg:hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          width: '260px',
          background: 'var(--white)',
          borderRight: '1px solid var(--rule)',
        }}
      >
        {navContent}
      </aside>

      {/* === デスクトップ: 固定サイドバー + リサイズハンドル === */}
      <aside
        className="hidden lg:flex flex-col h-screen sticky top-0 shrink-0 select-none"
        style={{
          width: `${width}px`,
          background: 'var(--white)',
          borderRight: '1px solid var(--rule)',
        }}
      >
        {navContent}

        {/* リサイズハンドル */}
        <div
          onMouseDown={startResize}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-[var(--accent-mid)] transition-colors"
          title="ドラッグで幅を調整"
        />
      </aside>
    </>
  );
}
