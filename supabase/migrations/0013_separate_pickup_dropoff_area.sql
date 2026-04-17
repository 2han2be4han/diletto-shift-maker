-- =============================================================
-- 児童の送迎パターン: 迎 / 送 で別エリアを選べるようにする
--
-- 背景:
--   従来は area_label 1 カラムでパターン全体にエリアを 1 つだけ付与していたが、
--   「迎は幼稚部、送は自宅」のように迎と送で異なる場所/時間を指定したい要望が出た。
--
-- 設計方針:
--   - 既存 area_label は互換のため残す（読み取り専用の扱い）
--   - 新カラム pickup_area_label / dropoff_area_label を nullable で追加
--   - UI/API は新カラムを正としつつ、旧 area_label にも同じ値を書く（当面の移行期間）
-- =============================================================

alter table public.child_transport_patterns
  add column if not exists pickup_area_label text,
  add column if not exists dropoff_area_label text;

comment on column public.child_transport_patterns.pickup_area_label is
  '迎のエリア（emoji + 半角スペース + name 形式）。エリア名とマークはテナント設定に従う';
comment on column public.child_transport_patterns.dropoff_area_label is
  '送のエリア（emoji + 半角スペース + name 形式）。エリア名とマークはテナント設定に従う';
