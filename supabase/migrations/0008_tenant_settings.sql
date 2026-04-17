-- =============================================================
-- テナント追加設定 + tenants insert 緩和（自前登録フロー用）
-- =============================================================

-- ----- tenants.settings（JSONB）追加 -----
-- UI 上のエリア・資格・締切日などを 1 カラムにまとめて保持
alter table public.tenants
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.tenants.settings is
  'UI 設定（transport_areas, qualifications, min_qualified_staff, request_deadline_day など）';

-- ----- children.parent_contact（オプション） -----
-- 送り場所ページで使う保護者連絡先。空なら非表示。
alter table public.children
  add column if not exists parent_contact text;

-- ----- 関数: public.is_admin（再利用） -----
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false);
$$;

-- ----- staff.qualifications（複数資格を持てるように） -----
-- 既存の is_qualified は残しつつ、具体的な資格名リストを保持
alter table public.staff
  add column if not exists qualifications text[] not null default '{}';
