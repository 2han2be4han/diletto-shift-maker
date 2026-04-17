'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import type { AuthenticatedStaff, StaffRole } from '@/types';

/**
 * (app) グループ用クライアントシェル
 * - staff 情報を Context で配布
 * - サイドバー開閉状態を管理
 */

const DEFAULT_SIDEBAR_WIDTH = 240;

type SidebarContextType = { toggle: () => void };
type StaffContextType = {
  staff: AuthenticatedStaff | null;
  isRole: (min: StaffRole) => boolean;
};

const SidebarContext = createContext<SidebarContextType>({ toggle: () => {} });
const StaffContext = createContext<StaffContextType>({
  staff: null,
  isRole: () => false,
});

export const useSidebarToggle = () => useContext(SidebarContext);
export const useCurrentStaff = () => useContext(StaffContext);

const LEVEL: Record<StaffRole, number> = { admin: 3, editor: 2, viewer: 1 };

export default function AppShell({
  children,
  staff,
}: {
  children: ReactNode;
  staff: AuthenticatedStaff | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const staffCtx: StaffContextType = {
    staff,
    isRole: (min) => (staff ? LEVEL[staff.role] >= LEVEL[min] : false),
  };

  return (
    <StaffContext.Provider value={staffCtx}>
      <SidebarContext.Provider value={{ toggle: () => setSidebarOpen((v) => !v) }}>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            role={staff?.role ?? null}
          />

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {children}
          </main>
        </div>
      </SidebarContext.Provider>
    </StaffContext.Provider>
  );
}
