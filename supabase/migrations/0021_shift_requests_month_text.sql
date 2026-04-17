-- =============================================================
-- shift_requests.month を date → text に戻す
--
-- 0001_initial_schema.sql では text と定義しているが、
-- 本番 DB では date 型になっていて 'YYYY-MM' 文字列の insert が
-- "invalid input syntax for type date: 2026-05" で失敗する。
-- コード側は YYYY-MM (text) 前提で統一されているため、text に戻す。
-- =============================================================

do $$
declare
  current_type text;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'shift_requests'
    and column_name = 'month';

  if current_type = 'date' then
    alter table public.shift_requests
      alter column month type text
      using to_char(month, 'YYYY-MM');
  end if;
end $$;
