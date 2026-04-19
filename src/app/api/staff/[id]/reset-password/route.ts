import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { sendPasswordResetEmail } from '@/lib/email/sendPasswordResetEmail';
import { generateRecoveryLink } from '@/lib/email/generateInviteLink';

/**
 * POST /api/staff/[id]/reset-password
 * admin のみ: 既にログイン済の職員にパスワード再発行メールを送る
 *
 * フロー:
 *   1. 対象 staff を取得（テナント一致 + user_id != null チェック）
 *   2. last_invited_at をクールダウン共通として 60 秒判定
 *   3. Supabase admin.generateLink({ type:'recovery' }) でリカバリーリンク生成
 *   4. Resend で sendPasswordResetEmail を送信
 *   5. last_invited_at を更新（次回再送 / 招待のクールダウン基準にも兼用）
 *
 * 未ログイン (user_id IS NULL) の職員は招待フロー側 (resend-invite) を使う。
 */
const COOLDOWN_SECONDS = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;
  const { staff: actor } = gate;

  const { id } = await params;
  const admin = createAdminClient();

  /* 1. 対象 staff 取得（テナント一致チェック） */
  const { data: target, error: fetchError } = await admin
    .from('staff')
    .select('id, tenant_id, name, email, user_id, last_invited_at, is_active')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: `職員情報の取得に失敗しました: ${fetchError.message}` },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json({ error: '該当する職員が見つかりません' }, { status: 404 });
  }
  if (target.tenant_id !== actor.tenant_id) {
    return NextResponse.json({ error: 'この職員を操作する権限がありません' }, { status: 403 });
  }
  if (target.is_active === false) {
    return NextResponse.json({ error: '退職済の職員には再発行できません' }, { status: 400 });
  }

  /* 2. ログイン未完了なら招待フローを使うべき */
  if (!target.user_id) {
    return NextResponse.json(
      { error: 'この職員はまだ初回ログインが完了していません。「再送」から招待メールを再送信してください' },
      { status: 400 },
    );
  }

  if (!target.email) {
    return NextResponse.json(
      { error: 'メールアドレスが登録されていないため再発行できません' },
      { status: 400 },
    );
  }

  /* 3. クールダウン判定（招待と共通の last_invited_at を流用） */
  if (target.last_invited_at) {
    const last = new Date(target.last_invited_at).getTime();
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - elapsed);
      return NextResponse.json(
        { error: `連続送信を防ぐため、あと ${wait} 秒お待ちください` },
        { status: 429 },
      );
    }
  }

  /* 4. テナント名取得（メール本文用） */
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('name')
    .eq('id', actor.tenant_id)
    .maybeSingle();
  const tenantName = tenantRow?.name ?? '事業所';

  /* 5. リカバリーリンク生成。
        招待と同じく /auth/confirm 経由でパスワード設定画面へ誘導する。 */
  const siteUrl = request.nextUrl.origin;
  const redirectTo = `${siteUrl}/auth/confirm?next=/auth/set-password`;

  const linkResult = await generateRecoveryLink(admin, {
    email: target.email,
    redirectTo,
  });

  if (!linkResult.ok) {
    return NextResponse.json(
      { error: `リカバリーリンクの生成に失敗しました: ${linkResult.error}` },
      { status: 500 },
    );
  }

  /* 6. Resend で送信 */
  const mailResult = await sendPasswordResetEmail({
    to: target.email,
    staffName: target.name,
    tenantName,
    actionLink: linkResult.actionLink,
    siteUrl,
  });

  if (!mailResult.ok) {
    return NextResponse.json({ error: mailResult.error }, { status: 500 });
  }

  /* 7. クールダウン基準時刻を更新 */
  await admin
    .from('staff')
    .update({ last_invited_at: new Date().toISOString() })
    .eq('id', target.id);

  return NextResponse.json({ ok: true });
}
