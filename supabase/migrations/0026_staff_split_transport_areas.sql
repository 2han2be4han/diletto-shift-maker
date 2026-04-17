-- =============================================================
-- Phase 27-D: 職員の対応エリアを迎/送に分割
--
-- 現状 staff.transport_areas は迎/送を区別しない単一配列。
-- これを pickup_transport_areas / dropoff_transport_areas に
-- 分割し、生成ロジックで「迎担当は pickup エリア、送担当は
-- dropoff エリアで候補フィルタ」を可能にする。
--
-- 既存 transport_areas カラムは後方互換のため残置し、既存値は
-- 両カラムへコピー移行する（初回は「迎も送も全対応」扱いになるため
-- 初回移行後にユーザーが個別見直しを行う運用）。
-- =============================================================

alter table public.staff
  add column if not exists pickup_transport_areas text[] not null default '{}'::text[];

alter table public.staff
  add column if not exists dropoff_transport_areas text[] not null default '{}'::text[];

comment on column public.staff.pickup_transport_areas is
  '職員が迎対応可能なエリアラベル配列（例: "🌳 豊明"）。Phase 27-D で追加。';
comment on column public.staff.dropoff_transport_areas is
  '職員が送り対応可能なエリアラベル配列。Phase 27-D で追加。';

-- 既存データ移行: transport_areas をそのまま両カラムにコピー。
-- 既に分割済みのレコード（どちらかに値がある）はスキップする。
update public.staff
   set pickup_transport_areas = coalesce(transport_areas, '{}'::text[])
 where pickup_transport_areas = '{}'::text[]
   and coalesce(transport_areas, '{}'::text[]) <> '{}'::text[];

update public.staff
   set dropoff_transport_areas = coalesce(transport_areas, '{}'::text[])
 where dropoff_transport_areas = '{}'::text[]
   and coalesce(transport_areas, '{}'::text[]) <> '{}'::text[];

-- 旧カラムは残置（後方互換用）。
comment on column public.staff.transport_areas is
  '【旧・後方互換用】対応エリア（迎/送 共通）。Phase 27-D 以降は pickup_transport_areas / dropoff_transport_areas を使用すること。';

-- RLS は既存 staff ポリシーをそのまま継承（カラム追加のみのため追加不要）
