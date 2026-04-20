-- Phase 59: 職員に「運転手 / 付き添い」フラグを追加
-- 既存行はすべて false で始まり、ユーザーが settings/staff で個別設定する。
-- 両方 false の職員は送迎表の担当候補から除外される（自動割り当て・左右プルダウン両方）。
-- RLS は既存 staff テーブルのポリシー (0003) を継承するため追加不要。

alter table public.staff
  add column if not exists is_driver boolean not null default false;
alter table public.staff
  add column if not exists is_attendant boolean not null default false;

comment on column public.staff.is_driver is
  'Phase 59: 運転手フラグ。送迎担当セルの左スロット（主担当/運転手枠）候補に限定。自動割り当ても運転手のみから選出する。';
comment on column public.staff.is_attendant is
  'Phase 59: 付き添いフラグ。送迎担当セルの右スロット（副担当枠）候補に運転手と並んで出る（左スロットには出ない）。';
