-- =============================================================
-- Phase 25-A-3: シフト変更申請（職員→admin承認フロー）
--
-- 職員は自分の staff_id に対してのみ申請可。admin が承認すると
-- shift_assignments を更新する。承認操作の「出勤中 admin のみ」
-- 制約は API レイヤーで実施（RLS では現在時刻と shift_assignments
-- 突合が煩雑なため）。RLS では admin のみ status 更新可までを保証。
--
-- change_type:
--   - 'time'        : 出勤時刻の変更（start_time / end_time 変更）
--   - 'leave'       : 休暇申請（assignment_type を 'holiday'/'paid'等に）
--   - 'type_change' : 勤務種別変更（assignment_type 変更のみ）
--
-- requested_payload: JSON。change_type に応じて必要フィールドを格納
--   例) { "start_time": "09:00", "end_time": "17:00" }
--   例) { "assignment_type": "paid" }
-- snapshot_before:  申請時点の shift_assignments スナップショット
-- =============================================================

create table if not exists public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  target_date date not null,
  change_type text not null
    check (change_type in ('time', 'leave', 'type_change')),
  requested_payload jsonb not null,
  snapshot_before jsonb,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by_staff_id uuid references public.staff(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shift_change_requests is
  'シフト変更申請。職員が自分の分のみ提出、出勤中 admin が承認で shift_assignments 更新。';
comment on column public.shift_change_requests.change_type is
  'time=時刻変更／leave=休暇申請／type_change=勤務種別変更';
comment on column public.shift_change_requests.requested_payload is
  '変更内容 JSON。change_type に応じて start_time/end_time/assignment_type 等';
comment on column public.shift_change_requests.snapshot_before is
  '申請時点の shift_assignments スナップショット。承認時の差分表示用';

create index if not exists idx_shift_change_requests_tenant_status
  on public.shift_change_requests(tenant_id, status, created_at desc);
create index if not exists idx_shift_change_requests_staff
  on public.shift_change_requests(staff_id, target_date desc);

-- updated_at 自動更新
create or replace function public.tg_shift_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shift_change_requests_updated_at on public.shift_change_requests;
create trigger trg_shift_change_requests_updated_at
  before update on public.shift_change_requests
  for each row execute function public.tg_shift_change_requests_updated_at();

-- =============================================================
-- RLS
-- =============================================================
alter table public.shift_change_requests enable row level security;

-- SELECT: 同テナント全員（自分の申請＋他人の閲覧も可＝透明性確保）
drop policy if exists scr_select_same_tenant on public.shift_change_requests;
create policy scr_select_same_tenant on public.shift_change_requests
  for select using (tenant_id = public.current_tenant_id());

-- INSERT: admin/editor は誰の分でも。viewer は自分の分のみ。
drop policy if exists scr_insert_self_or_privileged on public.shift_change_requests;
create policy scr_insert_self_or_privileged on public.shift_change_requests
  for insert with check (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role_name() in ('admin', 'editor')
      or staff_id = public.current_staff_id()
    )
  );

-- UPDATE:
--  - 申請者本人は pending のまま内容修正・キャンセル可
--  - admin は status を承認/却下に変更可（出勤中チェックは API 側）
drop policy if exists scr_update_self_or_admin on public.shift_change_requests;
create policy scr_update_self_or_admin on public.shift_change_requests
  for update using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role_name() = 'admin'
      or (
        staff_id = public.current_staff_id()
        and status = 'pending'
      )
    )
  ) with check (
    tenant_id = public.current_tenant_id()
  );

-- DELETE: admin のみ（通常は使わない。キャンセルは status='cancelled' で）
drop policy if exists scr_delete_admin on public.shift_change_requests;
create policy scr_delete_admin on public.shift_change_requests
  for delete using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() = 'admin'
  );
