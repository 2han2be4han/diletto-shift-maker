-- =============================================================
-- auth.users ↔ staff の自動リンク（Phase 1-5）
--
-- フロー:
--   1. admin が /settings/staff で職員を招待
--      → public.staff に email 付きで行を insert（user_id は null）
--      → Supabase Admin API で invite メール送信
--   2. 職員が invite リンクから password 設定
--      → auth.users に行が作られる
--   3. 本トリガーが発火し、email が一致する staff 行の user_id を埋める
-- =============================================================

create or replace function public.link_staff_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- email 一致する staff 行で user_id が null のものに紐付け
  update public.staff
     set user_id = new.id
   where email = new.email
     and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_staff_to_auth_user();

-- email が後から変更された場合にも追従
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.link_staff_to_auth_user();
