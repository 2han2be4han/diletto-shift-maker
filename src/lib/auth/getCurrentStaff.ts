import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { AuthenticatedStaff, StaffRole } from '@/types';

/**
 * セッションから現在の staff を取得（Server Component / API ルート用）
 *
 * 解決戦略:
 *   1. staff.user_id = auth.uid() で検索
 *   2. なければ email 一致 & user_id IS NULL の staff を admin client で自動リンク
 *      （DB トリガー 0005 が未発火・seed 未実行のケース救済）
 *   3. それでも見つからなければ null
 */
export async function getCurrentStaff(): Promise<AuthenticatedStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  /* 1. user_id で検索 */
  const { data: byUserId } = await supabase
    .from('staff')
    .select('id, tenant_id, name, email, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (byUserId) return byUserId as AuthenticatedStaff;

  /* 2. email 一致で自動リンク（RLS を回避するため admin client） */
  if (user.email) {
    try {
      const admin = createAdminClient();
      const { data: byEmail } = await admin
        .from('staff')
        .select('id, tenant_id, name, email, role')
        .eq('email', user.email)
        .is('user_id', null)
        .maybeSingle();

      if (byEmail) {
        await admin
          .from('staff')
          .update({ user_id: user.id })
          .eq('id', byEmail.id);
        return byEmail as AuthenticatedStaff;
      }
    } catch {
      /* service_role key 未設定時は失敗する可能性があるため catch */
    }
  }

  return null;
}

const ROLE_LEVEL: Record<StaffRole, number> = { admin: 3, editor: 2, viewer: 1 };

export function hasRoleAtLeast(staff: AuthenticatedStaff | null, minRole: StaffRole): boolean {
  if (!staff) return false;
  return ROLE_LEVEL[staff.role] >= ROLE_LEVEL[minRole];
}
