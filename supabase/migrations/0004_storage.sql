-- =============================================================
-- Supabase Storage バケットとポリシー（Phase 1-4）
--
-- バケット構成:
--   - comment-images       … コメント添付画像
--   - child-location-images … 児童送り場所の目印写真
--
-- どちらも非公開（private）。アクセス制御は RLS と signedUrl で行う。
-- =============================================================

insert into storage.buckets (id, name, public)
values
  ('comment-images', 'comment-images', false),
  ('child-location-images', 'child-location-images', false)
on conflict (id) do nothing;

-- パス命名規則: {tenant_id}/{sub_path}/{filename}
-- 先頭ディレクトリが tenant_id なのでそれでテナント分離する

-- ========== comment-images ==========

drop policy if exists "ci_select" on storage.objects;
create policy "ci_select" on storage.objects
  for select using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "ci_insert" on storage.objects;
create policy "ci_insert" on storage.objects
  for insert with check (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and auth.uid() is not null
  );

drop policy if exists "ci_delete" on storage.objects;
create policy "ci_delete" on storage.objects
  for delete using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.current_role_name() = 'admin'
  );

-- ========== child-location-images ==========

drop policy if exists "cli_select" on storage.objects;
create policy "cli_select" on storage.objects
  for select using (
    bucket_id = 'child-location-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists "cli_insert" on storage.objects;
create policy "cli_insert" on storage.objects
  for insert with check (
    bucket_id = 'child-location-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.current_role_name() in ('admin','editor')
  );

drop policy if exists "cli_delete" on storage.objects;
create policy "cli_delete" on storage.objects
  for delete using (
    bucket_id = 'child-location-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.current_role_name() in ('admin','editor')
  );
