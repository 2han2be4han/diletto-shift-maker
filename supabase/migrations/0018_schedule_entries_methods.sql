-- =============================================================
-- schedule_entries に pickup_method / dropoff_method を追加
--
-- 背景:
--   Excelの貼り付けで「迎」「送」ラベルが付いていない時間は
--   "自分で来る / 自分で帰る" として扱いたい（Phase 24）。
--   ラベルの有無で UI 表示も変わる（迎=青、自=グレー）。
--
-- 値:
--   pickup_method:  'pickup' (お迎え) | 'self' (自分で来る)
--   dropoff_method: 'dropoff' (送り)  | 'self' (自分で帰る)
--
-- default は 'pickup' / 'dropoff'（従来どおりの想定）、
-- nullable ではなく not null で運用（UIで必ず値を持つ）。
-- =============================================================

alter table public.schedule_entries
  add column if not exists pickup_method text not null default 'pickup'
    check (pickup_method in ('pickup', 'self')),
  add column if not exists dropoff_method text not null default 'dropoff'
    check (dropoff_method in ('dropoff', 'self'));

comment on column public.schedule_entries.pickup_method is
  'pickup=お迎え、self=自分で来る。Excel貼付で「迎」ラベル無しは self に推定';
comment on column public.schedule_entries.dropoff_method is
  'dropoff=送り、self=自分で帰る。Excel貼付で「送」ラベル無しは self に推定';
