-- =============================================================
-- コメント・通知・児童送り場所（Phase 1-2）
-- =============================================================

-- ----- コメント（ポリモーフィック） -----
-- target_type は 4 機能のいずれか
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_staff_id uuid not null references public.staff(id) on delete cascade,
  target_type text not null check (target_type in
    ('shift_request','shift_assignment','transport_assignment','child_dropoff_location')),
  target_id uuid not null,
  body text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by_staff_id uuid references public.staff(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_target on public.comments(tenant_id, target_type, target_id);
create index if not exists idx_comments_status on public.comments(tenant_id, status);
create index if not exists idx_comments_author on public.comments(author_staff_id);

-- ----- コメント画像（Supabase Storage の path を保持） -----
create table if not exists public.comment_images (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  storage_path text not null,      -- bucket 'comment-images' 内のパス
  created_at timestamptz not null default now()
);
create index if not exists idx_comment_images_comment on public.comment_images(comment_id);

-- ----- 通知（アプリ内ベル用） -----
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  recipient_staff_id uuid not null references public.staff(id) on delete cascade,
  type text not null check (type in
    ('comment_pending','comment_approved','comment_rejected','generic')),
  target_type text,
  target_id uuid,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_recipient_unread on public.notifications(recipient_staff_id, is_read);
create index if not exists idx_notif_tenant on public.notifications(tenant_id);

-- ----- 児童の送り場所（新機能） -----
create table if not exists public.child_dropoff_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  label text not null,
  address text,
  map_url text,                    -- Google Maps URL 等
  notes text,
  image_storage_path text,         -- bucket 'child-location-images'
  created_at timestamptz not null default now()
);
create index if not exists idx_dropoff_tenant on public.child_dropoff_locations(tenant_id);
create index if not exists idx_dropoff_child on public.child_dropoff_locations(child_id);

comment on table public.comments is 'ポリモーフィックコメント。承認フロー(pending→approved/rejected)';
comment on table public.notifications is 'アプリ内通知（ベルアイコン用）';
comment on table public.child_dropoff_locations is '児童ごとの送り場所（住所・目印写真）';
