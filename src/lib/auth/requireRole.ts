import { NextResponse } from 'next/server';
import { getCurrentStaff, hasRoleAtLeast } from './getCurrentStaff';
import type { AuthenticatedStaff, StaffRole } from '@/types';

/**
 * API ルートでロール検証
 *
 *   const gate = await requireRole('editor');
 *   if (!gate.ok) return gate.response;
 *   const { staff } = gate;
 */
export type RequireRoleResult =
  | { ok: true; staff: AuthenticatedStaff }
  | { ok: false; response: NextResponse };

export async function requireRole(minRole: StaffRole): Promise<RequireRoleResult> {
  const staff = await getCurrentStaff();

  if (!staff) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      ),
    };
  }

  if (!hasRoleAtLeast(staff, minRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'この操作を行う権限がありません' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, staff };
}
