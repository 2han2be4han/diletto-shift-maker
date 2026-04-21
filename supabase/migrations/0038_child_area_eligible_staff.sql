-- =============================================================
-- Phase 60: 児童専用エリア × 担当可能職員（多対多）
--
-- 背景:
--   children.custom_pickup_areas / custom_dropoff_areas は AreaLabel[]（JSON）で
--   特定児童にだけ存在するエリア（例: 祖母宅 🐻）を保持する。
--   テナント共通エリアはどの職員も transport_areas で網羅設定するが、
--   児童専用エリアは「その子のルートを知っている職員」だけに絞って割り当てたい。
--   JSON 配列にネストさせると職員削除時の整合性が取りにくいため、
--   独立した多対多テーブルに切り出す（RDB の王道）。
--
-- 割り当てロジック:
--   generateTransport.ts / TransportDayView の対応エリア判定で、
--     - tenant area_id → staff.transport_areas / pickup_transport_areas /
--                         dropoff_transport_areas を参照（従来通り）
--     - child-specific area_id → この child_area_eligible_staff を参照
--   という 2 段階評価に拡張する。
--
-- direction:
--   'pickup' = 迎担当可、 'dropoff' = 送担当可
--   同一 (child, area, staff) でも方向別に別行を持たせる設計。
--   迎だけ可／送だけ可 を自然に表現できる。
-- =============================================================

create table if not exists public.child_area_eligible_staff (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  /* area_id は children.custom_pickup_areas / custom_dropoff_areas 内の
     AreaLabel.id（JSON 内の uuid 文字列）。外部キー制約は張れないため
     アプリ層で整合性を保証する。 */
  area_id     uuid not null,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  direction   text not null check (direction in ('pickup', 'dropoff')),
  created_at  timestamptz not null default now(),
  unique (child_id, area_id, staff_id, direction)
);

comment on table public.child_area_eligible_staff is
  'Phase 60: 児童専用エリアごとの担当可能職員（多対多）。送迎担当の候補・自動割り当てで参照。';
comment on column public.child_area_eligible_staff.area_id is
  'children.custom_pickup_areas / custom_dropoff_areas 内の AreaLabel.id。FK は張らない（JSON 内のため）。';
comment on column public.child_area_eligible_staff.direction is
  'pickup=迎のみ、dropoff=送のみ。両方可の場合は 2 行作る。';

create index if not exists idx_caes_child_dir_area
  on public.child_area_eligible_staff (child_id, direction, area_id);
create index if not exists idx_caes_staff
  on public.child_area_eligible_staff (staff_id);
create index if not exists idx_caes_tenant
  on public.child_area_eligible_staff (tenant_id);

-- =============================================================
-- RLS
-- 同テナントのみ参照可。書き込みは admin / editor。
-- viewer は閲覧のみ。
-- =============================================================
alter table public.child_area_eligible_staff enable row level security;

drop policy if exists caes_select_same_tenant on public.child_area_eligible_staff;
create policy caes_select_same_tenant on public.child_area_eligible_staff
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists caes_insert_privileged on public.child_area_eligible_staff;
create policy caes_insert_privileged on public.child_area_eligible_staff
  for insert with check (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin', 'editor')
  );

drop policy if exists caes_delete_privileged on public.child_area_eligible_staff;
create policy caes_delete_privileged on public.child_area_eligible_staff
  for delete using (
    tenant_id = public.current_tenant_id()
    and public.current_role_name() in ('admin', 'editor')
  );

-- UPDATE は運用上不要（削除→挿入で組み替え）。許可ポリシーを貼らなければ不可。
