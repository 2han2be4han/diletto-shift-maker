import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/signup
 * 事業所 + 初代管理者の自己登録
 *
 * body: { email, password, tenantName, userName }
 *
 * フロー:
 *   1. auth.users に新規 user を作成（email_confirm: true で即有効化）
 *   2. public.tenants に事業所を作成
 *   3. public.staff に admin として staff を作成（user_id リンク済み）
 *   4. 失敗時は作成済みのリソースをロールバック
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; tenantName?: string; userName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
  }

  const { email, password, tenantName, userName } = body;
  if (!email || !password || !tenantName || !userName) {
    return NextResponse.json(
      { error: 'メール・パスワード・事業所名・氏名は必須です' },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
  }

  const admin = createAdminClient();

  /* 1. Auth user 作成 */
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: userName },
  });

  if (userError || !userData?.user) {
    const message = userError?.message ?? 'ユーザー作成に失敗しました';
    /* 既にメールが登録されている場合の分かりやすい日本語 */
    if (message.toLowerCase().includes('already')) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に登録されています。ログインページからサインインしてください' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const authUserId = userData.user.id;

  /* 2. テナント作成 */
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({ name: tenantName, status: 'active' })
    .select()
    .single();

  if (tenantError || !tenant) {
    /* ロールバック: auth user 削除 */
    await admin.auth.admin.deleteUser(authUserId);
    return NextResponse.json(
      { error: `事業所作成に失敗しました: ${tenantError?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }

  /* 3. 初代 admin として staff 作成 */
  const { error: staffError } = await admin.from('staff').insert({
    tenant_id: tenant.id,
    user_id: authUserId,
    name: userName,
    email,
    role: 'admin',
    employment_type: 'full_time',
    is_qualified: true,
  });

  if (staffError) {
    /* ロールバック */
    await admin.from('tenants').delete().eq('id', tenant.id);
    await admin.auth.admin.deleteUser(authUserId);
    return NextResponse.json(
      { error: `職員登録に失敗しました: ${staffError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, tenant_id: tenant.id });
}
