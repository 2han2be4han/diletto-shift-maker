import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { sendInviteEmail } from '@/lib/email/sendInviteEmail';
import { generateInviteLink } from '@/lib/email/generateInviteLink';

/**
 * POST /api/staff/[id]/resend-invite
 * admin のみ: 招待メール再送
 *
 * 前提・チェック:
 *   - 対象 staff が自テナントに属していること（RLS + 明示チェック）
 *   - staff.user_id IS NULL（未ログイン）であること
 *   - last_invited_at から 60秒以上経過していること（連打防止）
 */
const COOLDOWN_SECONDS = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;
  const { staff: inviter } = gate;

  const { id } = await params;
  const admin = createAdminClient();

  /* 1. 対象 staff を取得（テナント一致チェック込み） */
  const { data: target, error: fetchError } = await admin
    .from('staff')
    .select('id, tenant_id, name, email, user_id, last_invited_at')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: `職員情報の取得に失敗しました: ${fetchError.message}` },
      { status: 500 }
    );
  }
  if (!target) {
    return NextResponse.json({ error: '該当する職員が見つかりません' }, { status: 404 });
  }
  if (target.tenant_id !== inviter.tenant_id) {
    return NextResponse.json({ error: 'この職員を操作する権限がありません' }, { status: 403 });
  }

  /* 2. 既に登録済みの場合は拒否 */
  if (target.user_id) {
    return NextResponse.json(
      { error: 'この職員は既にログイン登録が完了しています' },
      { status: 400 }
    );
  }

  /* 3. メールアドレスが無いと再送できない */
  if (!target.email) {
    return NextResponse.json(
      { error: 'メールアドレスが登録されていないため再送できません' },
      { status: 400 }
    );
  }

  /* 4. クールダウン判定 */
  if (target.last_invited_at) {
    const last = new Date(target.last_invited_at).getTime();
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - elapsed);
      return NextResponse.json(
        { error: `連続送信を防ぐため、あと ${wait} 秒お待ちください` },
        { status: 429 }
      );
    }
  }

  /* 5. テナント名を取得（メール本文用） */
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('name')
    .eq('id', inviter.tenant_id)
    .maybeSingle();
  const tenantName = tenantRow?.name ?? '事業所';

  /* 6. 招待リンク生成
     Phase 47: 初回招待 (POST /api/staff/invite) と同じ redirectTo を使う。
     再送が許される条件は user_id IS NULL（未パスワード設定）なので、
     初回と同じく /auth/confirm 経由でパスワード設定画面へ誘導する必要がある。
     旧実装は /auth/callback?next=/dashboard で、未設定のままダッシュボードに飛ぶバグがあった。 */
  const siteUrl = request.nextUrl.origin;
  const redirectTo = `${siteUrl}/auth/confirm?next=/auth/set-password`;

  const linkResult = await generateInviteLink(admin, {
    email: target.email,
    redirectTo,
    tenantId: target.tenant_id,
    staffId: target.id,
  });

  if (!linkResult.ok) {
    return NextResponse.json(
      { error: `招待リンクの生成に失敗しました: ${linkResult.error}` },
      { status: 500 }
    );
  }

  /* 7. Resend で送信 */
  const mailResult = await sendInviteEmail({
    to: target.email,
    staffName: target.name,
    tenantName,
    actionLink: linkResult.actionLink,
    siteUrl,
  });

  if (!mailResult.ok) {
    return NextResponse.json(
      { error: mailResult.error },
      { status: 500 }
    );
  }

  /* 8. last_invited_at を更新 */
  await admin
    .from('staff')
    .update({ last_invited_at: new Date().toISOString() })
    .eq('id', target.id);

  return NextResponse.json({ ok: true });
}
