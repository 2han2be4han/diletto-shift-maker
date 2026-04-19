-- =============================================================
-- Phase 35: 日次出力カードの児童 DnD 並び替え学習記憶
--
-- 目的:
--   日次出力（/output/daily）の送迎ブロック内で、職員がカード内の児童バッジを
--   ドラッグ&ドロップで並び替えた順序を、スロット条件単位で記憶する。
--   次回以降、同条件のスロットが現れたときに学習済みの順で自動復元する。
--
-- スロット識別子 (slot_signature):
--   "HH:MM|pickup|areaId1,areaId2"  (areaId はソート済み・カンマ区切り)
--   日付・職員・児童構成は含めない（条件が同じなら別日でも復元）。
--   車両 ID は含めない（ユーザー指示）。
--
-- 権限:
--   Phase 25 の出欠 RPC と同じく、現場運用前提で全ロール（viewer 含む）が
--   SELECT/INSERT/UPDATE/DELETE 可。tenant_id 一致のみ強制。
--
-- データ寿命:
--   児童が転所/退所 → child_id FK CASCADE で自動削除
--   エリア改名/削除 → signature 不一致で孤立するが害はない（次回 DnD で上書き）
-- =============================================================

create table if not exists public.child_display_order_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slot_signature text not null,
  child_id uuid not null references public.children(id) on delete cascade,
  display_order integer not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, slot_signature, child_id)
);

comment on table public.child_display_order_memory is
  '日次出力カード内の児童並び順の学習記憶。スロット条件 (時刻+方向+エリア) 単位で保存。';
comment on column public.child_display_order_memory.slot_signature is
  '"HH:MM|pickup|areaId1,areaId2" 形式。areaId はソート済み。';
comment on column public.child_display_order_memory.display_order is
  '同一 signature 内での並び順（0 始まり、整数）。';

create index if not exists idx_child_order_memory_tenant_sig
  on public.child_display_order_memory(tenant_id, slot_signature);

alter table public.child_display_order_memory enable row level security;

-- 同テナント内であれば全ロール参照可
drop policy if exists child_order_memory_select on public.child_display_order_memory;
create policy child_order_memory_select on public.child_display_order_memory
  for select using (tenant_id = public.current_tenant_id());

-- 全ロール書き込み可（出欠と同じく現場で誰でも触れる扱い）
drop policy if exists child_order_memory_insert on public.child_display_order_memory;
create policy child_order_memory_insert on public.child_display_order_memory
  for insert with check (tenant_id = public.current_tenant_id());

drop policy if exists child_order_memory_update on public.child_display_order_memory;
create policy child_order_memory_update on public.child_display_order_memory
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists child_order_memory_delete on public.child_display_order_memory;
create policy child_order_memory_delete on public.child_display_order_memory
  for delete using (tenant_id = public.current_tenant_id());
