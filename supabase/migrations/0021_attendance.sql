-- =============================================================
-- Phase 25-A-2: 児童の出欠編集 + 履歴
--
-- 全ログイン済み職員（viewer 含む）が児童の出欠ステータスを
-- 編集できるようにする。編集のたびに attendance_audit_logs に
-- 履歴を残す。attendance_status の更新は専用 RPC 経由のみ許可し、
-- 他カラムの viewer 書き込みは従来どおり禁止する。
-- =============================================================

-- 出欠ステータスカラム
alter table public.schedule_entries
  add column if not exists attendance_status text not null default 'planned'
    check (attendance_status in ('planned', 'present', 'absent', 'late', 'early_leave'));

alter table public.schedule_entries
  add column if not exists attendance_updated_at timestamptz;

alter table public.schedule_entries
  add column if not exists attendance_updated_by uuid references public.staff(id) on delete set null;

comment on column public.schedule_entries.attendance_status is
  '出欠ステータス。planned=予定／present=出席／absent=欠席／late=遅刻／early_leave=早退';
comment on column public.schedule_entries.attendance_updated_at is
  '最終更新日時（出欠のみ）。RPC update_attendance_status 経由で設定';
comment on column public.schedule_entries.attendance_updated_by is
  '最終更新した staff.id（退職後も履歴参照できるよう on delete set null）';

create index if not exists idx_schedule_entries_attendance
  on public.schedule_entries(tenant_id, date, attendance_status);

-- 履歴テーブル
create table if not exists public.attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_entry_id uuid not null references public.schedule_entries(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  entry_date date not null,
  changed_by_staff_id uuid references public.staff(id) on delete set null,
  changed_by_name text not null,
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now()
);

comment on table public.attendance_audit_logs is
  '児童出欠の変更履歴。全ロールが記録対象（viewer 含む）。';
comment on column public.attendance_audit_logs.changed_by_name is
  '変更時点の職員名スナップショット。退職・改名後も履歴が読めるよう保持。';

create index if not exists idx_attendance_audit_entry
  on public.attendance_audit_logs(schedule_entry_id, changed_at desc);
create index if not exists idx_attendance_audit_tenant_date
  on public.attendance_audit_logs(tenant_id, entry_date desc);

alter table public.attendance_audit_logs enable row level security;

-- 同テナントの全ロールが履歴閲覧可
drop policy if exists attendance_audit_select on public.attendance_audit_logs;
create policy attendance_audit_select on public.attendance_audit_logs
  for select using (tenant_id = public.current_tenant_id());

-- INSERT は RPC 経由（SECURITY DEFINER）のみ。直接 INSERT は拒否。
drop policy if exists attendance_audit_insert_none on public.attendance_audit_logs;
create policy attendance_audit_insert_none on public.attendance_audit_logs
  for insert with check (false);

-- UPDATE/DELETE は一切不可
drop policy if exists attendance_audit_update_none on public.attendance_audit_logs;
create policy attendance_audit_update_none on public.attendance_audit_logs
  for update using (false);

drop policy if exists attendance_audit_delete_none on public.attendance_audit_logs;
create policy attendance_audit_delete_none on public.attendance_audit_logs
  for delete using (false);

-- =============================================================
-- RPC: update_schedule_entry_attendance
--
-- 全ロールが attendance_status のみ更新できる専用関数。
-- tenant_id 一致を強制し、履歴を自動記録する。
-- =============================================================
create or replace function public.update_schedule_entry_attendance(
  p_entry_id uuid,
  p_status text
) returns public.schedule_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff record;
  v_entry public.schedule_entries;
  v_old_status text;
begin
  -- セッションから職員情報取得（退職者・未ログインは弾かれる）
  select id, tenant_id, name
    into v_staff
    from public.staff
    where user_id = auth.uid()
      and is_active = true
    limit 1;

  if v_staff.id is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  if p_status not in ('planned', 'present', 'absent', 'late', 'early_leave') then
    raise exception '不正な出欠ステータスです: %', p_status using errcode = '22023';
  end if;

  -- エントリ取得（tenant 一致チェック）
  select * into v_entry
    from public.schedule_entries
    where id = p_entry_id
      and tenant_id = v_staff.tenant_id
    for update;

  if v_entry.id is null then
    raise exception '対象の利用予定が見つかりません' using errcode = 'P0002';
  end if;

  v_old_status := v_entry.attendance_status;

  -- 変更なしならスキップ
  if v_old_status = p_status then
    return v_entry;
  end if;

  update public.schedule_entries
    set attendance_status = p_status,
        attendance_updated_at = now(),
        attendance_updated_by = v_staff.id
    where id = p_entry_id
    returning * into v_entry;

  insert into public.attendance_audit_logs (
    tenant_id, schedule_entry_id, child_id, entry_date,
    changed_by_staff_id, changed_by_name,
    old_status, new_status
  ) values (
    v_entry.tenant_id, v_entry.id, v_entry.child_id, v_entry.date,
    v_staff.id, v_staff.name,
    v_old_status, p_status
  );

  return v_entry;
end;
$$;

comment on function public.update_schedule_entry_attendance(uuid, text) is
  '出欠ステータス更新 RPC（全ロール許可、履歴自動記録）。他カラムは更新不可。';

-- RPC を全認証ユーザーに公開
grant execute on function public.update_schedule_entry_attendance(uuid, text)
  to authenticated;
