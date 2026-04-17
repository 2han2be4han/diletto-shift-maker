import { NextResponse } from 'next/server';
import { getCurrentStaff, hasRoleAtLeast } from './getCurrentStaff';
import { isOnDutyAdmin } from './isOnDutyAdmin';
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

/**
 * 認証のみ要求（ロール問わず）。Phase 25: 出欠更新 API 等、
 * 全ログイン済み職員（viewer 含む）にアクセス許可する場合に使う。
 */
export async function requireAuthenticated(): Promise<RequireRoleResult> {
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
  return { ok: true, staff };
}

/**
 * 「出勤中の admin」を要求。Phase 25: シフト変更申請の承認・却下操作で使う。
 * admin 以外や、admin でも現在時刻がシフト外（未出勤/退勤後）だと 403 を返す。
 */
export async function requireOnDutyAdmin(): Promise<RequireRoleResult> {
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
  if (staff.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '管理者のみ実行できます' },
        { status: 403 }
      ),
    };
  }
  const onDuty = await isOnDutyAdmin(staff);
  if (!onDuty) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '現在出勤中の管理者のみ承認操作ができます' },
        { status: 403 }
      ),
    };
  }
  return { ok: true, staff };
}
