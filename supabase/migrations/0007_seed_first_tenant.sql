-- =============================================================
-- 初回セットアップ用（任意・サンプル）
--
-- 本番では「admin を Supabase Auth Dashboard から作成」→「このファイルの
-- TODO 部分を埋めて実行」で初期テナント＋初代 admin を作成する。
--
-- 使い方:
--   1. Supabase Dashboard → Authentication → Users → Add user
--      admin になるメールアドレスとパスワードで登録（メール確認を skip しておく）
--   2. 作成された user の UUID をコピー
--   3. 下の :tenant_name / :admin_email / :admin_name / :admin_user_id を埋める
--   4. SQL Editor で実行
-- =============================================================

-- ▼ 実行前に値を書き換えてください ▼
do $$
declare
  v_tenant_name text := 'Diletto サンプル事業所';   -- TODO: 事業所名
  v_admin_email text := 'admin@example.com';       -- TODO: auth.users に登録済みのメール
  v_admin_name text := '管理者';                   -- TODO: admin の氏名
  v_admin_user_id uuid;
  v_tenant_id uuid;
begin
  -- auth.users から該当ユーザーを取得
  select id into v_admin_user_id from auth.users where email = v_admin_email limit 1;
  if v_admin_user_id is null then
    raise exception 'auth.users に %% が見つかりません。先に Dashboard で作成してください', v_admin_email;
  end if;

  -- tenants（service_role で insert）
  insert into public.tenants (name, status)
  values (v_tenant_name, 'active')
  returning id into v_tenant_id;

  -- 初代 admin staff
  insert into public.staff
    (tenant_id, user_id, name, email, role, employment_type, is_qualified)
  values
    (v_tenant_id, v_admin_user_id, v_admin_name, v_admin_email, 'admin', 'full_time', true);

  raise notice '✅ テナント作成: % / 初代 admin: %', v_tenant_id, v_admin_email;
end $$;
