-- =============================================================
-- 送迎パターンに method カラム追加
-- =============================================================
alter table public.child_transport_patterns
  add column if not exists pickup_method text not null default 'pickup'
    check (pickup_method in ('pickup','self','parent'));

alter table public.child_transport_patterns
  add column if not exists dropoff_method text not null default 'dropoff'
    check (dropoff_method in ('dropoff','self','parent'));
