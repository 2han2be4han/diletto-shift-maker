-- =============================================================
-- 0005_auth_trigger の改良版
--
-- 問題（Codex レビュー #1 P1）:
--   staff は (tenant_id, email) で unique。同じメールが複数テナントに
--   存在しうる。元の実装は「email 一致する全 staff」に user_id を入れる
--   ため、複数テナントに同一メールがあると 1 auth user が複数 staff に
--   紐付き、getCurrentStaff() の maybeSingle() が複数行で失敗する。
--
-- 改良:
--   1. user_id IS NULL の候補のみを対象にする
--   2. 同テナント単位で 1 行のみに絞る（LIMIT 1）
--   3. 既に他の auth user が紐付いた staff は上書きしない
--   4. 招待時に auth.users.raw_user_meta_data.staff_id が渡されていれば
--      それを最優先で使う（/api/staff/invite の invite metadata）
-- =============================================================

create or replace function public.link_staff_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
begin
  -- 優先 1: invite metadata に staff_id が入っている場合
  begin
    v_staff_id := (new.raw_user_meta_data->>'staff_id')::uuid;
  exception when others then
    v_staff_id := null;
  end;

  if v_staff_id is not null then
    update public.staff
       set user_id = new.id
     where id = v_staff_id
       and user_id is null;
    return new;
  end if;

  -- 優先 2: email 一致 & user_id 未設定 の staff から 1 行だけ選択
  -- 複数テナントに同じ email がある場合はフォールバックとして最古の 1 行のみ
  select id into v_staff_id
    from public.staff
   where email = new.email
     and user_id is null
   order by created_at asc
   limit 1;

  if v_staff_id is not null then
    update public.staff
       set user_id = new.id
     where id = v_staff_id;
  end if;

  return new;
end;
$$;

-- トリガーは 0005 で既に登録済みだが念のため再登録
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_staff_to_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.link_staff_to_auth_user();
