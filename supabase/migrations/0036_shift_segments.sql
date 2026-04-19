-- Phase 50: 分割シフト基盤。
-- 旧仕様: shift_assignments は (tenant_id, staff_id, date) で UNIQUE =「1 日 1 行」前提。
-- 新仕様: 同一職員が 1 日に複数時間帯で出勤（例: 9:30-11:30 + 14:30-18:30）できるよう
--         segment_order カラムを追加し UNIQUE を拡張。既存行は全て segment_order=0 として扱う。

-- 1. segment_order カラム追加（既存行は default 0）
alter table public.shift_assignments
  add column if not exists segment_order integer not null default 0;

-- 2. 旧 UNIQUE 制約を削除。CREATE TABLE で生成された標準名を明示的に drop。
alter table public.shift_assignments
  drop constraint if exists shift_assignments_tenant_id_staff_id_date_key;

-- 3. 新 UNIQUE: (tenant_id, staff_id, date, segment_order)
alter table public.shift_assignments
  add constraint shift_assignments_unique_segment
  unique (tenant_id, staff_id, date, segment_order);

-- 4. (staff, date) での検索最適化用 index（既存があれば維持）
create index if not exists idx_shiftassign_staff_date
  on public.shift_assignments(tenant_id, staff_id, date);
