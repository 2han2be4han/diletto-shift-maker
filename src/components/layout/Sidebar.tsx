'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { StaffRole } from '@/types';

/**
 * サイドバーナビゲーション
 * - デスクトップ: 幅はドラッグで調整可能（180px〜360px、デフォルト240px）
 * - タブレット以下（<1024px）: オーバーレイ表示、トグルボタンで開閉
 * - role により表示項目を制御
 */

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  role: StaffRole | null;
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'ダッシュボード', icon: '📊' },
  { href: '/schedule', label: '利用予定', icon: '📅' },
  { href: '/shift', label: 'シフト表', icon: '📋' },
  { href: '/transport', label: '送迎表', icon: '🚗' },
  { href: '/output/daily', label: '日次出力', icon: '📄' },
  { href: '/request', label: '休み希望', icon: '✋' },
];

const NAV_SETTINGS = [
  { href: '/comments', label: 'コメント承認', icon: '💬' },
  { href: '/settings/tenant', label: 'テナント設定', icon: '🏢' },
  { href: '/settings/staff', label: '職員管理', icon: '👤' },
  { href: '/settings/children', label: '児童管理', icon: '🧒' },
];

const NAV_BOTTOM = [
  { href: '/billing', label: '契約管理', icon: '💳' },
];

const MINI_WIDTH = 56;
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;

export default function Sidebar({ isOpen, onClose, width, onWidthChange, role }: SidebarProps) {
  const pathname = usePathname();
  const isResizing = useRef(false);
  const isAdmin = role === 'admin';
  const canSeeBilling = isAdmin;

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

  /* Phase 28: ミニモード（isOpen=false）ではアイコン中央揃え + パディング統一で縦列をスッキリさせる
     共通化のため nav item のスタイルをここで集約 */
  const navItemClass = isOpen
    ? 'flex items-center h-10 px-2.5 rounded-md transition-all group overflow-hidden'
    : 'flex items-center justify-center h-10 mx-auto w-10 rounded-md transition-all group overflow-hidden';

  const navContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ロゴ: ミニモードでは中央揃え + コンパクト */}
      <div className={`flex items-center h-16 shrink-0 transition-all ${isOpen ? 'px-5 py-5' : 'px-0 py-5 justify-center'}`}>
        <Link
          href="/dashboard"
          className="text-xl font-black tracking-tight"
          style={{ color: 'var(--ink)' }}
          title={!isOpen ? 'ShiftPuzzle' : undefined}
        >
          {isOpen ? 'ShiftPuzzle' : 'S'}
        </Link>
      </div>

      {/* メインナビ */}
      <nav
        className={`flex-1 overflow-y-auto overflow-x-hidden ${isOpen ? 'px-2.5' : 'px-0'}`}
        /* ミニモード時はスクロールバーを薄くしてノイズを減らす */
        style={!isOpen ? { scrollbarWidth: 'thin' } : undefined}
      >
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className={navItemClass}
                title={!isOpen ? item.label : undefined}
                style={{
                  color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-2)',
                  background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                }}
              >
                <span className="text-xl w-7 flex items-center justify-center shrink-0">{item.icon}</span>
                {isOpen && (
                  <span className="ml-3 text-sm font-medium whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        {/* 設定セクション（admin のみ） */}
        {isAdmin && (
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
                  className={navItemClass}
                  title={!isOpen ? item.label : undefined}
                  style={{
                    color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-3)',
                    background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                  }}
                >
                  <span className="text-xl w-7 flex items-center justify-center shrink-0">{item.icon}</span>
                  {isOpen && (
                    <span className="ml-3 text-sm font-medium whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        )}
      </nav>

      {/* 下部ナビ（admin のみ） */}
      {canSeeBilling && (
      <div className={`mt-auto border-t pt-4 pb-4 ${isOpen ? 'px-2.5' : 'px-0'}`} style={{ borderColor: 'var(--rule)' }}>
        <ul className="flex flex-col gap-1">
          {NAV_BOTTOM.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className={navItemClass}
                title={!isOpen ? item.label : undefined}
                style={{
                  color: isActive(item.href) ? 'var(--accent)' : 'var(--ink-3)',
                  background: isActive(item.href) ? 'var(--accent-pale)' : 'transparent',
                }}
              >
                <span className="text-xl w-7 flex items-center justify-center shrink-0">{item.icon}</span>
                {isOpen && (
                  <span className="ml-3 text-sm font-medium whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      )}

      {/* サインアウト（常時表示） */}
      <div
        className={`pb-4 ${canSeeBilling ? '' : 'mt-auto border-t pt-4'} ${isOpen ? 'px-2.5' : 'px-0'}`}
        style={{ borderColor: 'var(--rule)' }}
      >
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className={`${navItemClass} ${isOpen ? 'w-full' : ''} hover:bg-[var(--red-pale)]`}
            title={!isOpen ? 'サインアウト' : undefined}
            style={{ color: 'var(--ink-3)' }}
          >
            <span className="text-xl w-7 flex items-center justify-center shrink-0">🚪</span>
            {isOpen && (
              <span className="ml-3 text-sm font-medium whitespace-nowrap">
                サインアウト
              </span>
            )}
          </button>
        </form>
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
