-- =============================================================
-- ShiftPuzzle 初期スキーマ（Phase 1-1）
-- 既存型定義（src/types/index.ts）と完全一致
-- =============================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ----- テナント -----
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  created_at timestamptz not null default now()
);

-- ----- 職員 -----
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  employment_type text not null default 'part_time' check (employment_type in ('full_time','part_time')),
  default_start_time time,
  default_end_time time,
  transport_areas text[] not null default '{}',
  is_qualified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists idx_staff_tenant on public.staff(tenant_id);
create index if not exists idx_staff_user on public.staff(user_id);

-- ----- 児童 -----
create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  grade_type text not null check (grade_type in
    ('preschool','elementary_1','elementary_2','elementary_3',
     'elementary_4','elementary_5','elementary_6','junior_high')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_children_tenant on public.children(tenant_id);

-- ----- 児童の送迎パターン -----
create table if not exists public.child_transport_patterns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  pattern_name text not null,
  pickup_location text,
  pickup_time time,
  dropoff_location text,
  dropoff_time time,
  area_label text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ctp_tenant on public.child_transport_patterns(tenant_id);
create index if not exists idx_ctp_child on public.child_transport_patterns(child_id);

-- ----- 利用予定 -----
create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null,
  pickup_time time,
  dropoff_time time,
  pattern_id uuid references public.child_transport_patterns(id) on delete set null,
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, child_id, date)
);
create index if not exists idx_schedule_tenant_date on public.schedule_entries(tenant_id, date);

-- ----- 休み希望 -----
create table if not exists public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  month text not null,           -- 'YYYY-MM'
  request_type text not null check (request_type in ('public_holiday','paid_leave','available_day')),
  dates text[] not null default '{}',
  notes text,
  submitted_at timestamptz not null default now(),
  unique (tenant_id, staff_id, month, request_type)
);
create index if not exists idx_shiftreq_tenant_month on public.shift_requests(tenant_id, month);

-- ----- シフト確定 -----
create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  assignment_type text not null check (assignment_type in ('normal','public_holiday','paid_leave','off')),
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, staff_id, date)
);
create index if not exists idx_shiftassign_tenant_date on public.shift_assignments(tenant_id, date);

-- ----- 送迎担当 -----
create table if not exists public.transport_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_entry_id uuid not null references public.schedule_entries(id) on delete cascade,
  pickup_staff_ids uuid[] not null default '{}',
  dropoff_staff_ids uuid[] not null default '{}',
  is_confirmed boolean not null default false,
  is_unassigned boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, schedule_entry_id)
);
create index if not exists idx_transport_tenant on public.transport_assignments(tenant_id);

comment on table public.tenants is '事業所（マルチテナントの単位）';
comment on table public.staff is '職員（admin/editor/viewer のロール保持）';
comment on table public.children is '利用児童';
