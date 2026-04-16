'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useCallback, useEffect } from 'react';

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

const NAV_SETTINGS = [
  { href: '/settings/tenant', label: 'テナント設定', icon: '🏢' },
  { href: '/settings/staff', label: '職員管理', icon: '👤' },
  { href: '/settings/children', label: '児童管理', icon: '🧒' },
];

const NAV_BOTTOM = [
  { href: '/billing', label: '契約管理', icon: '💳' },
];

const MINI_WIDTH = 64;
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;

export default function Sidebar({ isOpen, onClose, width, onWidthChange }: SidebarProps) {
  const pathname = usePathname();
  const isResizing = useRef(false);

  /* デスクトップでの表示幅 */
  const desktopWidth = isOpen ? width : MINI_WIDTH;

  /* ドラッグでサイドバー幅を変更する */
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isOpen) return; // 閉じている時はリサイズ不可
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
    [isOpen, onWidthChange]
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const navContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ロゴ */}
      <div className="px-5 py-5 flex items-center h-16 shrink-0 transition-all">
        <Link href="/dashboard" className="text-xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
          {isOpen ? 'ShiftPuzzle' : 'S'}
        </Link>
      </div>

      {/* メインナビ */}
      <nav className="flex-1 px-2.5 overflow-y-auto overflow-x-hidden">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className="flex items-center h-10 px-2.5 rounded-md transition-all group overflow-hidden"
                title={!isOpen ? item.label : undefined}
                style={{
                  color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-2)',
                  background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                }}
              >
                <span className="text-xl w-7 flex items-center justify-center shrink-0">{item.icon}</span>
                <span
                  className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* 設定セクション */}
        <div className="mt-4 pt-4 mb-2" style={{ borderTop: '1px solid var(--rule)' }}>
          {isOpen && (
            <p className="px-3 mb-2 text-[10px] font-bold tracking-wider uppercase opacity-50" style={{ color: 'var(--ink-3)' }}>
              Settings
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {NAV_SETTINGS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                  className="flex items-center h-10 px-2.5 rounded-md transition-all group overflow-hidden"
                  title={!isOpen ? item.label : undefined}
                  style={{
                    color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-3)',
                    background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                  }}
                >
                  <span className="text-xl w-7 flex items-center justify-center shrink-0">{item.icon}</span>
                  <span
                    className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* 下部ナビ */}
      <div className="px-2.5 pb-4 mt-auto border-t pt-4" style={{ borderColor: 'var(--rule)' }}>
        <ul className="flex flex-col gap-1">
          {NAV_BOTTOM.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className="flex items-center h-10 px-2.5 rounded-md transition-all group overflow-hidden"
                title={!isOpen ? item.label : undefined}
                style={{
                  color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-3)',
                  background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                }}
              >
                <span className="text-xl w-7 flex items-center justify-center shrink-0">{item.icon}</span>
                <span
                  className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      {/* === モバイル用オーバーレイ === */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={onClose}
        />
      )}

      {/* === サイドバー本体 === */}
      <aside
        className={`
          fixed top-0 left-0 z-[60] h-full flex flex-col
          lg:sticky lg:translate-x-0
          transition-[width,transform] duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          width: isMobile ? '260px' : `${desktopWidth}px`,
          background: 'var(--white)',
          borderRight: '1px solid var(--rule)',
        }}
      >
        {navContent}

        {/* リサイズハンドル（デスクトップの開いている時のみ） */}
        {isOpen && (
          <div
            onMouseDown={startResize}
            className="hidden lg:block absolute top-0 right-[-2px] h-full w-4 cursor-col-resize group z-50"
          >
            <div className="h-full w-[1px] ml-auto group-hover:bg-[var(--accent)] group-hover:w-[3px] transition-all" />
          </div>
        )}
      </aside>
    </>
  );
}
