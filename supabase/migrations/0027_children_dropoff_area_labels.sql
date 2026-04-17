-- =============================================================
-- Phase 27: 児童の送り対応エリアラベルを追加
--
-- children.pickup_area_labels（お迎えマーク）に対応する送り側として
-- dropoff_area_labels を追加。テナント設定の dropoff_areas（送のエリア）
-- から複数選択できるようにする。
--
-- 既存データは空配列（default）で移行。ユーザーが手動で設定する。
-- =============================================================

alter table public.children
  add column if not exists dropoff_area_labels text[] not null default '{}'::text[];

comment on column public.children.dropoff_area_labels is
  '児童の送り対応エリアラベル（emoji + name 形式）。テナント dropoff_areas から複数選択。'
  'Phase 27 追加。';

-- RLS は既存 children ポリシーを継承（カラム追加のみ、追加不要）
