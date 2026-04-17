-- =============================================================
-- staff.display_order: 職員一覧・シフト表での表示順
--
-- nullable で既存レコード影響なし。
-- /api/staff GET は display_order NULLS LAST, name で安定ソート。
-- /api/staff/reorder で一括更新。
-- =============================================================

alter table public.staff
  add column if not exists display_order integer;

comment on column public.staff.display_order is
  '職員一覧・シフト表の表示順。NULL の場合は name 昇順でフォールバック';

create index if not exists idx_staff_tenant_order
  on public.staff(tenant_id, display_order nulls last, name);
