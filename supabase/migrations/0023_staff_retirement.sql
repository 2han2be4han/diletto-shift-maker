-- =============================================================
-- Phase 25-A-1: 職員の退職（ソフト削除）
--
-- 物理削除を完全廃止し、is_active=false / retired_at 設定で
-- 退職扱いに統一する。current_staff() / current_tenant_id() /
-- current_role_name() / current_staff_id() は is_active=true
-- のレコードのみ返すため、退職者のセッションは自動的に全 RLS を
-- 通過できず、実質ログイン不可になる（middleware でも弾く）。
-- =============================================================

alter table public.staff
  add column if not exists is_active boolean not null default true;

alter table public.staff
  add column if not exists retired_at timestamptz;

comment on column public.staff.is_active is
  '在職フラグ。false=退職。退職時は必ず retired_at を設定する。';
comment on column public.staff.retired_at is
  '退職日時。is_active=false と連動。';

-- 既存のアクティブ職員インデックスに is_active を含める
create index if not exists idx_staff_tenant_active
  on public.staff(tenant_id, is_active, display_order nulls last, name);

-- =============================================================
-- RLS 補助関数の更新: 退職者を除外
-- =============================================================

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
    and is_active = true
  limit 1;
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.staff
  where user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff
  where user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.staff
  where user_id = auth.uid()
    and is_active = true
  limit 1;
$$;
