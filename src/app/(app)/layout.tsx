'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';
import Sidebar from '@/components/layout/Sidebar';

/**
 * (app)グループ共通レイアウト
 * サイドバー（幅調整可能）+ メインエリア（スクロール）
 * SidebarContextで子ページからサイドバーの開閉を制御可能
 */

const DEFAULT_SIDEBAR_WIDTH = 240;

type SidebarContextType = {
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType>({ toggle: () => {} });
export const useSidebarToggle = () => useContext(SidebarContext);

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  return (
    <SidebarContext.Provider value={{ toggle: () => setSidebarOpen((v) => !v) }}>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />

        {/* メインエリア（ページ側でスクロールを管理させるため overflow-hidden に変更） */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
