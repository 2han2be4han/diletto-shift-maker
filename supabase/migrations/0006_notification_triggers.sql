-- =============================================================
-- 通知トリガー（Phase 1-6 / Phase 8 準備）
--
-- 1. コメントが pending で insert → テナント内の admin 全員に "要承認" 通知
-- 2. コメントが approved に更新 → author に "承認されました" 通知
-- 3. コメントが rejected に更新 → author に "却下されました" 通知
-- =============================================================

create or replace function public.notify_on_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  body_text text;
begin
  -- 新規コメント（pending）→ admin 全員に通知
  if tg_op = 'INSERT' and new.status = 'pending' then
    body_text := '新しいコメントが承認待ちです';
    for r in
      select id from public.staff
       where tenant_id = new.tenant_id
         and role = 'admin'
         and id <> new.author_staff_id
    loop
      insert into public.notifications (tenant_id, recipient_staff_id, type, target_type, target_id, body)
      values (new.tenant_id, r.id, 'comment_pending', new.target_type, new.target_id, body_text);
    end loop;

  -- ステータス変更 → author に通知
  elsif tg_op = 'UPDATE' and old.status <> new.status then
    if new.status = 'approved' then
      body_text := 'コメントが承認されました';
      insert into public.notifications (tenant_id, recipient_staff_id, type, target_type, target_id, body)
      values (new.tenant_id, new.author_staff_id, 'comment_approved', new.target_type, new.target_id, body_text);
    elsif new.status = 'rejected' then
      body_text := 'コメントが却下されました';
      insert into public.notifications (tenant_id, recipient_staff_id, type, target_type, target_id, body)
      values (new.tenant_id, new.author_staff_id, 'comment_rejected', new.target_type, new.target_id, body_text);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_comment_insert on public.comments;
create trigger on_comment_insert
  after insert on public.comments
  for each row execute function public.notify_on_comment_change();

drop trigger if exists on_comment_update on public.comments;
create trigger on_comment_update
  after update on public.comments
  for each row execute function public.notify_on_comment_change();
