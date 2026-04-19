-- =============================================================
-- Phase 45: 送迎担当の手動ロック
--
-- 目的:
--   /transport で「保存」ボタンが押された日の transport_assignment は
--   次回再生成 (handleGenerate) でスキップされるようにする。
--   現状は再生成が無条件に全日上書きしてしまい、職員の手動編集が消える。
--
-- 仕様:
--   - is_locked=true の行を 1 件でも持つ日付は再生成対象外
--   - 「保存」時にその日の全 row を is_locked=true に更新
--   - ロック解除は将来「強制再生成」ボタン or 個別解除で対応 (Phase 46+)
--   - is_confirmed (確定済み) とは別軸: ロック=編集中保護、確定=最終承認
-- =============================================================

alter table public.transport_assignments
  add column if not exists is_locked boolean not null default false;

comment on column public.transport_assignments.is_locked is
  '手動編集ロック。true の場合、再生成 API でその日全体がスキップされる。';

create index if not exists idx_transport_assignments_locked
  on public.transport_assignments(tenant_id, is_locked);
