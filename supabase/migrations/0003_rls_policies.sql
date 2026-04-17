-- =============================================================
-- RLS ポリシー（Phase 1-3）
--
-- 原則:
--   - 全テーブルを RLS 有効化
--   - staff.user_id = auth.uid() のレコードから current_tenant_id / current_role を取得
--   - 同一テナント内のデータだけ見える
--   - admin: 全書き込み可
--   - editor: 設定(staff/children/tenant)以外の書き込み可
--   - viewer: 基本読み取り。自分の shift_requests だけ書き込み可
-- =============================================================

-- 補助: 現在ログイン中の staff の情報を返すビュー/関数
create or replace function public.current_staff()
returns table (id uuid, tenant_id uuid, role text, staff_role text)
language sql
stable
security definer
set search_path = public
as $$
  select id, tenant_id, role, role
  from public.staff
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.staff where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.staff where user_id = auth.uid() limit 1;
$$;

-- ========== RLS 有効化 ==========
alter table public.tenants enable row level security;
alter table public.staff enable row level security;
alter table public.children enable row level security;
alter table public.child_transport_patterns enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.shift_requests enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.transport_assignments enable row level security;
alter table public.comments enable row level security;
alter table public.comment_images enable row level security;
alter table public.notifications enable row level security;
alter table public.child_dropoff_locations enable row level security;

-- ========== tenants ==========
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (id = public.current_tenant_id());

drop policy if exists tenants_update_admin on public.tenants;
create policy tenants_update_admin on public.tenants
  for update using (id = public.current_tenant_id() and public.current_role_name() = 'admin')
  with check (id = public.current_tenant_id() and public.current_role_name() = 'admin');

-- テナント作成は service_role（Stripe webhook / signup フロー）のみ
drop policy if exists tenants_insert_none on public.tenants;
create policy tenants_insert_none on public.tenants
  for insert with check (false);

-- ========== staff ==========
drop policy if exists staff_select_same_tenant on public.staff;
create policy staff_select_same_tenant on public.staff
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists staff_write_admin on public.staff;
create policy staff_write_admin on public.staff
  for all using (tenant_id = public.current_tenant_id() and public.current_role_name() = 'admin')
  with check (tenant_id = public.current_tenant_id() and public.current_role_name() = 'admin');

-- ========== children ==========
drop policy if exists children_select on public.children;
create policy children_select on public.children
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists children_write_admin_editor on public.children;
create policy children_write_admin_editor on public.children
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- ========== child_transport_patterns ==========
drop policy if exists ctp_select on public.child_transport_patterns;
create policy ctp_select on public.child_transport_patterns
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists ctp_write on public.child_transport_patterns;
create policy ctp_write on public.child_transport_patterns
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- ========== schedule_entries ==========
drop policy if exists sched_select on public.schedule_entries;
create policy sched_select on public.schedule_entries
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists sched_write on public.schedule_entries;
create policy sched_write on public.schedule_entries
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- ========== shift_requests ==========
-- 同テナント全員が閲覧可（誰が休みか共有したい）
drop policy if exists shiftreq_select on public.shift_requests;
create policy shiftreq_select on public.shift_requests
  for select using (tenant_id = public.current_tenant_id());

-- admin/editor は全員分 書き込み可
drop policy if exists shiftreq_write_admin_editor on public.shift_requests;
create policy shiftreq_write_admin_editor on public.shift_requests
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- viewer は自分のだけ insert/update/delete 可
drop policy if exists shiftreq_write_self on public.shift_requests;
create policy shiftreq_write_self on public.shift_requests
  for all using (
    tenant_id = public.current_tenant_id()
    and staff_id = public.current_staff_id()
  ) with check (
    tenant_id = public.current_tenant_id()
    and staff_id = public.current_staff_id()
  );

-- ========== shift_assignments ==========
drop policy if exists shiftassign_select on public.shift_assignments;
create policy shiftassign_select on public.shift_assignments
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists shiftassign_write on public.shift_assignments;
create policy shiftassign_write on public.shift_assignments
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- ========== transport_assignments ==========
drop policy if exists transport_select on public.transport_assignments;
create policy transport_select on public.transport_assignments
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists transport_write on public.transport_assignments;
create policy transport_write on public.transport_assignments
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- ========== comments ==========
-- select: 同テナント、ただし pending は自分のか admin のみ見える
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select using (
    tenant_id = public.current_tenant_id()
    and (
      status = 'approved'
      or author_staff_id = public.current_staff_id()
      or public.current_role_name() = 'admin'
    )
  );

-- insert: 同テナントの職員なら誰でも（自分を author として）
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert with check (
    tenant_id = public.current_tenant_id()
    and author_staff_id = public.current_staff_id()
  );

-- update: admin は全部、author は自分の pending のみ
drop policy if exists comments_update_admin on public.comments;
create policy comments_update_admin on public.comments
  for update using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() = 'admin'
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() = 'admin'
  );

drop policy if exists comments_update_own_pending on public.comments;
create policy comments_update_own_pending on public.comments
  for update using (
    tenant_id = public.current_tenant_id()
    and author_staff_id = public.current_staff_id()
    and status = 'pending'
  ) with check (
    tenant_id = public.current_tenant_id()
    and author_staff_id = public.current_staff_id()
  );

-- delete: admin のみ
drop policy if exists comments_delete_admin on public.comments;
create policy comments_delete_admin on public.comments
  for delete using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() = 'admin'
  );

-- ========== comment_images ==========
drop policy if exists comment_images_select on public.comment_images;
create policy comment_images_select on public.comment_images
  for select using (
    exists (
      select 1 from public.comments c
      where c.id = comment_images.comment_id
        and c.tenant_id = public.current_tenant_id()
        and (
          c.status = 'approved'
          or c.author_staff_id = public.current_staff_id()
          or public.current_role_name() = 'admin'
        )
    )
  );

drop policy if exists comment_images_insert on public.comment_images;
create policy comment_images_insert on public.comment_images
  for insert with check (
    exists (
      select 1 from public.comments c
      where c.id = comment_images.comment_id
        and c.tenant_id = public.current_tenant_id()
        and c.author_staff_id = public.current_staff_id()
    )
  );

drop policy if exists comment_images_delete on public.comment_images;
create policy comment_images_delete on public.comment_images
  for delete using (
    exists (
      select 1 from public.comments c
      where c.id = comment_images.comment_id
        and c.tenant_id = public.current_tenant_id()
        and (c.author_staff_id = public.current_staff_id()
             or public.current_role_name() = 'admin')
    )
  );

-- ========== notifications ==========
drop policy if exists notif_select_own on public.notifications;
create policy notif_select_own on public.notifications
  for select using (
    tenant_id = public.current_tenant_id()
    and recipient_staff_id = public.current_staff_id()
  );

drop policy if exists notif_update_own on public.notifications;
create policy notif_update_own on public.notifications
  for update using (
    tenant_id = public.current_tenant_id()
    and recipient_staff_id = public.current_staff_id()
  ) with check (
    tenant_id = public.current_tenant_id()
    and recipient_staff_id = public.current_staff_id()
  );

-- 通知の insert は DB トリガー経由（security definer）で行うため、直接 insert は service_role のみ
drop policy if exists notif_insert_none on public.notifications;
create policy notif_insert_none on public.notifications
  for insert with check (false);

-- ========== child_dropoff_locations ==========
drop policy if exists dropoff_select on public.child_dropoff_locations;
create policy dropoff_select on public.child_dropoff_locations
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists dropoff_write on public.child_dropoff_locations;
create policy dropoff_write on public.child_dropoff_locations
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );
