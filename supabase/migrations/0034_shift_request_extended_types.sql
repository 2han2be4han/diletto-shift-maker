-- =============================================================
-- Phase 36: 休み希望の選択肢拡張 + コメント機能
--
-- 1. shift_requests.request_type を拡張:
--    旧: 'public_holiday' | 'paid_leave' | 'available_day'
--    新: 'public_holiday' | 'paid_leave' | 'full_day_available' | 'am_off' | 'pm_off' | 'comment'
--    既存 'available_day' は 'full_day_available' に自動変換（同じ意味）。
--    'am_off' = 午前休（午後出勤可）、'pm_off' = 午後休（午前出勤可）
--    'comment' は他選択肢と排他。日付ごとの自由入力（他施設応援/会議/研修等）。
--
-- 2. shift_request_comments テーブル新設:
--    日付ごとのコメントを格納。シフト表で「⚠」赤マーク表示の判定にも使う。
--    1 職員 × 1 日 = 1 コメント (unique)。
--
-- 権限:
--   shift_request_comments の RLS は shift_requests と同等。
--   admin/editor は全員分書き込み可、viewer は本人のみ書き込み可、同テナント SELECT 可。
-- =============================================================

-- ---- 1. shift_requests.request_type を拡張 ----
-- 重要: 旧 CHECK 制約が 'full_day_available' を許可していないので、
--       UPDATE より先に DROP しないと既存 'available_day' を変換できず弾かれる。

alter table public.shift_requests
  drop constraint if exists shift_requests_request_type_check;

-- 既存の 'available_day' を 'full_day_available' に置換
update public.shift_requests
  set request_type = 'full_day_available'
  where request_type = 'available_day';

-- 新 CHECK 制約を追加
alter table public.shift_requests
  add constraint shift_requests_request_type_check
  check (request_type in (
    'public_holiday', 'paid_leave',
    'full_day_available', 'am_off', 'pm_off',
    'comment'
  ));

comment on column public.shift_requests.request_type is
  'public_holiday=公休 / paid_leave=有給 / full_day_available=1日出勤可 / am_off=午前休 / pm_off=午後休 / comment=自由入力（他選択肢と排他）';


-- ---- 2. shift_request_comments テーブル ----

create table if not exists public.shift_request_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  /* 'YYYY-MM' 形式。月単位の絞り込み高速化用にも保持（date から導出可能だが冗長保持） */
  month text not null,
  /* 'YYYY-MM-DD' 形式 */
  date text not null,
  comment_text text not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, staff_id, date)
);

comment on table public.shift_request_comments is
  '休み希望の自由入力コメント（日付ごと）。他選択肢と排他。シフト表の赤マーク判定に使用。';

create index if not exists idx_shift_request_comments_tenant_month
  on public.shift_request_comments(tenant_id, month);
create index if not exists idx_shift_request_comments_staff_date
  on public.shift_request_comments(staff_id, date);

alter table public.shift_request_comments enable row level security;

-- 同テナント内であれば全ロール SELECT 可
drop policy if exists shift_request_comments_select on public.shift_request_comments;
create policy shift_request_comments_select on public.shift_request_comments
  for select using (tenant_id = public.current_tenant_id());

-- admin/editor は全員分 書き込み可
drop policy if exists shift_request_comments_write_admin_editor on public.shift_request_comments;
create policy shift_request_comments_write_admin_editor on public.shift_request_comments
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin','editor')
  );

-- viewer は自分のだけ insert/update/delete 可
drop policy if exists shift_request_comments_write_self on public.shift_request_comments;
create policy shift_request_comments_write_self on public.shift_request_comments
  for all using (
    tenant_id = public.current_tenant_id()
    and staff_id = public.current_staff_id()
  ) with check (
    tenant_id = public.current_tenant_id()
    and staff_id = public.current_staff_id()
  );
