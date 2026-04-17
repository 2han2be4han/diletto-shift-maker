-- =============================================================
-- 児童一覧の並び替え用 display_order カラム
--
-- nullable にすることで既存レコードへの影響なし。
-- API 側は ORDER BY display_order NULLS LAST, created_at ASC で、
-- 手動並び替えしていない児童は従来通り作成日順で並ぶ。
-- =============================================================

alter table public.children
  add column if not exists display_order integer;

comment on column public.children.display_order is
  '児童一覧の表示順。NULL の場合は created_at 昇順でフォールバック';

create index if not exists idx_children_tenant_order
  on public.children(tenant_id, display_order nulls last, created_at);
