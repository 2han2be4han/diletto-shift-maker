import { redirect } from 'next/navigation';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import { getCurrentStaff, hasRoleAtLeast } from '@/lib/auth/getCurrentStaff';
import { createClient } from '@/lib/supabase/server';
import type { ShiftRequestRow, StaffRow } from '@/types';
import MyRequestCalendar from '@/components/request/MyRequestCalendar';
import AdminRequestList from '@/components/request/AdminRequestList';
import ShiftChangeRequestSection from '@/components/request/ShiftChangeRequestSection';

/**
 * 休み希望ページ
 * - admin / editor: 全職員の提出状況リスト
 * - viewer: 自分の休み希望カレンダー
 */
export default async function RequestPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');

  const supabase = await createClient();

  /* 対象月は「来月」 */
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const targetMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;

  const { data: myRequests } = await supabase
    .from('shift_requests')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('month', targetMonth);

  const showAdminView = hasRoleAtLeast(staff, 'editor');

  let allStaff: StaffRow[] = [];
  let allRequests: ShiftRequestRow[] = [];
  if (showAdminView) {
    const [sRes, rRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('shift_requests').select('*').eq('month', targetMonth),
    ]);
    allStaff = (sRes.data ?? []) as StaffRow[];
    allRequests = (rRes.data ?? []) as ShiftRequestRow[];
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="休み希望" />

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            {target.getFullYear()}年{target.getMonth() + 1}月分
          </h2>
          <Badge variant="info">
            {showAdminView ? '管理者ビュー' : 'あなたの希望入力'}
          </Badge>
        </div>

        {showAdminView ? (
          <AdminRequestList
            staff={allStaff}
            requests={allRequests}
            targetMonth={targetMonth}
          />
        ) : (
          <MyRequestCalendar
            myStaffId={staff.id}
            myStaffName={staff.name}
            targetMonth={targetMonth}
            initialRequests={(myRequests as ShiftRequestRow[]) ?? []}
          />
        )}

        {/* Phase 25: シフト変更申請（全ロール共通） */}
        <ShiftChangeRequestSection myStaffId={staff.id} />
      </div>
    </div>
  );
}
