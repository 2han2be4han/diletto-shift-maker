import type { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 招待用のアクションリンクを生成する。
 *
 * まず type:'invite' で試し、既存ユーザー起因で失敗した場合は
 * type:'magiclink' にフォールバックする。
 *
 * メール送信は Supabase 側では行わない（呼び出し側で Resend から送る想定）。
 */
export type GenerateInviteLinkParams = {
  email: string;
  redirectTo: string;
  tenantId: string;
  staffId: string;
};

export type GenerateInviteLinkResult =
  | { ok: true; actionLink: string }
  | { ok: false; error: string };

export async function generateInviteLink(
  admin: AdminClient,
  params: GenerateInviteLinkParams
): Promise<GenerateInviteLinkResult> {
  const data = {
    tenant_id: params.tenantId,
    staff_id: params.staffId,
  };

  /* 1. invite で試行 */
  const inviteRes = await admin.auth.admin.generateLink({
    type: 'invite',
    email: params.email,
    options: { redirectTo: params.redirectTo, data },
  });

  if (inviteRes.data?.properties?.action_link) {
    return { ok: true, actionLink: inviteRes.data.properties.action_link };
  }

  /* 2. invite が失敗（既存ユーザーなど）→ magiclink にフォールバック */
  const inviteErrorMessage = inviteRes.error?.message ?? '';
  const isUserExistsError =
    inviteErrorMessage.toLowerCase().includes('already') ||
    inviteErrorMessage.toLowerCase().includes('exist') ||
    inviteErrorMessage.toLowerCase().includes('registered');

  if (!isUserExistsError && inviteRes.error) {
    return { ok: false, error: inviteErrorMessage };
  }

  const magicRes = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: params.email,
    options: { redirectTo: params.redirectTo, data },
  });

  if (magicRes.data?.properties?.action_link) {
    return { ok: true, actionLink: magicRes.data.properties.action_link };
  }

  return {
    ok: false,
    error: magicRes.error?.message ?? (inviteErrorMessage || 'リンク生成に失敗しました'),
  };
}
