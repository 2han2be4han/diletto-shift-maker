-- =============================================================
-- children.pickup_area_labels: 児童ごとに複数のお迎えマークを登録できるようにする
--
-- 背景（Phase 21 ド王仕様）:
--   - 送迎パターンテーブルを個別に組み立てるのは手間
--   - 多くの児童は「学校 / 5限 / 6限 / 幼稚部」などいくつかの迎えパターンを
--     行き来する。対象マークだけ選べばテナント設定の time が反映される構成にしたい
--   - 送り先は home_address にフォールバック（Phase 20）、学年から時間推定
--
-- 設計:
--   - text[] で複数マーク（例: ['🐻 幼稚部', '🎒 5限']）
--   - default '{}'（空配列）、既存レコードへの影響なし
--   - 既存 child_transport_patterns は例外用として残置（互換性）
-- =============================================================

alter table public.children
  add column if not exists pickup_area_labels text[] not null default '{}';

comment on column public.children.pickup_area_labels is
  '児童が利用可能なお迎えマーク（emoji + name 形式の配列）。テナント pickup_areas の選択肢から複数選ぶ';
