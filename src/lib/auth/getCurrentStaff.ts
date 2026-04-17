import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { AuthenticatedStaff, StaffRole } from '@/types';

/**
 * セッションから現在の staff を取得（Server Component / API ルート用）
 *
 * 解決戦略:
 *   1. staff.user_id = auth.uid() で検索（is_active=true のみ）
 *   2. なければ email 一致 & user_id IS NULL & is_active=true の staff を
 *      admin client で自動リンク
 *      ※ 複数テナントに同一 email がある場合は曖昧性を避けるため null を返す
 *   3. それでも見つからなければ null
 *
 * Phase 25: 退職者（is_active=false）は一律 null を返す。これにより
 * middleware / API / Server Component 全てでログインゲートが効く。
 */
export async function getCurrentStaff(): Promise<AuthenticatedStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  /* 1. user_id で検索（is_active=true のみ。退職者は弾く） */
  const { data: byUserIdList } = await supabase
    .from('staff')
    .select('id, tenant_id, name, email, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1);
  const byUserId = byUserIdList?.[0];

  if (byUserId) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { is_active: _ignore, ...rest } = byUserId;
    return rest as AuthenticatedStaff;
  }

  /* 2. email 一致で自動リンク（admin client）
        複数候補がある場合は曖昧なのでリンクせずに null を返す
        退職者（is_active=false）は候補から除外 */
  if (user.email) {
    try {
      const admin = createAdminClient();
      const { data: candidates } = await admin
        .from('staff')
        .select('id, tenant_id, name, email, role')
        .eq('email', user.email)
        .eq('is_active', true)
        .is('user_id', null)
        .limit(2);

      if (!candidates || candidates.length === 0) return null;
      if (candidates.length > 1) {
        /* 複数テナントに同 email が存在 → 自動リンクしない（管理者が手動で対応） */
        return null;
      }

      const target = candidates[0];
      await admin
        .from('staff')
        .update({ user_id: user.id })
        .eq('id', target.id);
      return target as AuthenticatedStaff;
    } catch {
      return null;
    }
  }

  return null;
}

const ROLE_LEVEL: Record<StaffRole, number> = { admin: 3, editor: 2, viewer: 1 };

export function hasRoleAtLeast(staff: AuthenticatedStaff | null, minRole: StaffRole): boolean {
  if (!staff) return false;
  return ROLE_LEVEL[staff.role] >= ROLE_LEVEL[minRole];
}
