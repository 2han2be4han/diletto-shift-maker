import { createClient } from '@/lib/supabase/server';
import type { AuthenticatedStaff, StaffRole } from '@/types';

/**
 * セッションから現在の staff を取得（Server Component / API ルート用）
 * staff が見つからない場合は null を返す（＝未招待・未紐付け状態）
 */
export async function getCurrentStaff(): Promise<AuthenticatedStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('staff')
    .select('id, tenant_id, name, email, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as AuthenticatedStaff;
}

/**
 * ロール階層: admin > editor > viewer
 */
const ROLE_LEVEL: Record<StaffRole, number> = { admin: 3, editor: 2, viewer: 1 };

export function hasRoleAtLeast(staff: AuthenticatedStaff | null, minRole: StaffRole): boolean {
  if (!staff) return false;
  return ROLE_LEVEL[staff.role] >= ROLE_LEVEL[minRole];
}
