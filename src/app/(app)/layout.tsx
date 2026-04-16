'use client';

import { useState, type ReactNode } from 'react';
import Sidebar from '@/components/layout/Sidebar';

/**
 * (app)グループ共通レイアウト
 * サイドバー（幅調整可能）+ メインエリア（スクロール）
 */

const DEFAULT_SIDEBAR_WIDTH = 240;

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />

      {/* メインエリア */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* ヘッダーは各ページで <Header> を呼び出す形式 */}
        {children}
      </main>
    </div>
  );
}
