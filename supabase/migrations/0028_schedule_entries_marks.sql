-- =============================================================
-- Phase 28: schedule_entries にマーク列を追加（マーク第一級市民化）
--
-- 背景:
--   Phase 21 で children.pickup_area_labels / dropoff_area_labels を追加したが
--   送迎生成ロジックはこれを一切読まず、child_transport_patterns のみ参照していた
--   （= マークは飾り状態）。本フェーズでマーク自体を解決キーに昇格し、
--   テナントの pickup_areas / dropoff_areas を通して時刻・住所・エリアラベルを
--   自動解決できるようにする。
--
-- 解決順（送迎生成ロジック側での契約）:
--   1. schedule_entries.pattern_id がある → 従来どおり child_transport_patterns 経由
--   2. pickup_mark / dropoff_mark がある → テナント pickup_areas / dropoff_areas
--      の同名エントリから time / address を解決
--   3. いずれも無い場合は entry.pickup_time / dropoff_time を直接利用
--
-- 値の形式:
--   "🐻 幼稚部" のような emoji + スペース + name 形式の文字列。
--   tenant.settings.pickup_areas / dropoff_areas の emoji+name を formatAreaLabel で
--   組み立てたものと一致させる。
-- =============================================================

alter table public.schedule_entries
  add column if not exists pickup_mark text,
  add column if not exists dropoff_mark text;

comment on column public.schedule_entries.pickup_mark is
  'お迎えマーク。テナント pickup_areas の emoji+name 形式。Phase 28 追加。'
  'pattern_id が未設定のとき、送迎生成が tenant.pickup_areas から time/address を解決するキー。';

comment on column public.schedule_entries.dropoff_mark is
  'お送りマーク。テナント dropoff_areas の emoji+name 形式。Phase 28 追加。'
  'pattern_id が未設定のとき、送迎生成が tenant.dropoff_areas から time/address を解決するキー。';

-- RLS は既存 schedule_entries ポリシーをそのまま継承（カラム追加のみ、追加不要）
