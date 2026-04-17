-- =============================================================
-- shift_requests の UNIQUE 制約を (tenant_id, staff_id, month, request_type) に統一
--
-- 本番 DB は UNIQUE(tenant_id, staff_id, month) のみで、
-- 「1職員1ヶ月に1行」の古い想定。コードは request_type ごとに 3 行
-- (public_holiday / paid_leave / available_day) 持つ前提で upsert する
-- (onConflict: tenant_id, staff_id, month, request_type)。
--
-- 旧制約を drop し、重複除去してから新制約を張る。
-- =============================================================

-- 旧制約 (3カラム) を drop
alter table public.shift_requests
  drop constraint if exists shift_requests_tenant_id_staff_id_month_key;

-- 重複除去: 同一 (tenant_id, staff_id, month, request_type) は submitted_at 最新を残す
delete from public.shift_requests a
using public.shift_requests b
where a.tenant_id = b.tenant_id
  and a.staff_id = b.staff_id
  and a.month = b.month
  and a.request_type = b.request_type
  and a.submitted_at < b.submitted_at;

-- 新制約 (4カラム) を追加（存在すれば no-op）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shift_requests_tenant_staff_month_type_key'
      and conrelid = 'public.shift_requests'::regclass
  ) then
    alter table public.shift_requests
      add constraint shift_requests_tenant_staff_month_type_key
      unique (tenant_id, staff_id, month, request_type);
  end if;
end $$;
