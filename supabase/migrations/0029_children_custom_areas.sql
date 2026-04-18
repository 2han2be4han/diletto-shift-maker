-- =============================================================
-- Phase 28: 児童ごとカスタム送迎エリア（A案）
--
-- テナント共通の pickup_areas / dropoff_areas では表現しきれない
-- 「その児童だけのイレギュラー時刻/場所」を、パターン登録なしで
-- 扱えるようにするための児童専用エリア候補を追加する。
--
-- children.pickup_area_labels / dropoff_area_labels（Phase 21/27）は
-- 引き続き「この児童がどのマークを使うか」の選択結果を保持し、
-- custom_pickup_areas / custom_dropoff_areas はその選択肢の
-- 「児童専用ソース」として tenant pickup_areas / dropoff_areas と
-- 合流して使われる（resolveTransportSpec / PDF インポート側で参照）。
--
-- 形式: AreaLabel[] の JSON（{emoji, name, time?, address?}）。
-- 既存データは空配列で移行。RLS は既存 children ポリシーを継承。
-- =============================================================

alter table public.children
  add column if not exists custom_pickup_areas jsonb not null default '[]'::jsonb;

alter table public.children
  add column if not exists custom_dropoff_areas jsonb not null default '[]'::jsonb;

comment on column public.children.custom_pickup_areas is
  '児童専用の迎えエリア候補（AreaLabel[] JSON）。tenant pickup_areas とマージしてマーク解決に使う。Phase 28 追加。';

comment on column public.children.custom_dropoff_areas is
  '児童専用の送りエリア候補（AreaLabel[] JSON）。tenant dropoff_areas とマージしてマーク解決に使う。Phase 28 追加。';
