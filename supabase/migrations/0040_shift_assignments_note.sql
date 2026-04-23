-- Phase 60: シフトセルに自由入力メモを追加。
-- normal / public_holiday のみ利用、off / paid_leave では UI から入力不可。
-- RLS は既存 shift_assignments ポリシーを継承するためポリシー追加なし。

alter table public.shift_assignments
  add column if not exists note text;

comment on column public.shift_assignments.note is
  'シフトセルの自由入力メモ。例: "パステル"（外部応援先など）。normal/public_holiday のみ UI から入力。';
