-- =============================================================
-- children.home_address: 児童の自宅住所（送迎デフォルトに使用）
--
-- 設計意図:
--   - 送り先は児童ごとに固有（各自の自宅）なケースが大半
--   - エリア設定に 1 住所を持たせる方式では表現しきれない
--   - 児童に自宅住所を 1 つ持たせ、送迎パターンの dropoff_location が
--     空のときのフォールバックとして使う
--   - /locations (child_dropoff_locations) 機能はこの仕組みで置き換えられるため
--     UI から撤去予定（このマイグレーションでは既存テーブルに手を加えない）
-- =============================================================

alter table public.children
  add column if not exists home_address text;

comment on column public.children.home_address is
  '児童の自宅住所。送迎パターンの dropoff_location 未入力時の default 値として使用';
