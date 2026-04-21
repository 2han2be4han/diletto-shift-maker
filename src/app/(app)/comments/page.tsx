import { redirect } from 'next/navigation';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';
import { createClient } from '@/lib/supabase/server';
import CommentsApprovalList from '@/components/comments/CommentsApprovalList';

/**
 * コメント承認センター（admin のみ）
 * - 承認待ち / 承認済 / 却下 を一覧
 * - 個別に承認/却下
 */
export default async function CommentsAdminPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');
  if (staff.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const { data: comments } = await supabase
    .from('comments')
    .select('*, staff:author_staff_id(name), comment_images(id, storage_path)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <Header title="コメント承認" />
      <div className="p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            コメント管理
          </h2>
          <Badge variant="info">admin専用</Badge>
        </div>
        <div data-tour="comments-list">
          <CommentsApprovalList
            initialComments={(comments ?? []) as unknown as Parameters<typeof CommentsApprovalList>[0]['initialComments']}
            currentStaffId={staff.id}
          />
        </div>
      </div>
    </>
  );
}
