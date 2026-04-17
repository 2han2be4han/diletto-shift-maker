import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
const DEV_SKIP_AUTH = process.env.DEV_SKIP_AUTH === 'true';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff();

  /* Supabase 接続済みなのに staff が取れない = 未招待 or DB未構築
     → /login に戻す（middleware でカバーされるケースもあるが二重防御） */
  if (SUPABASE_CONFIGURED && !DEV_SKIP_AUTH && !staff) {
    redirect('/login?error=no_staff_record');
  }

  return <AppShell staff={staff}>{children}</AppShell>;
}
