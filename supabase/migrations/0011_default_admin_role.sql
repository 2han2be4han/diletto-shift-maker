-- =============================================================
-- 全テナントの既存 staff を admin に昇格 + デフォルト role を admin へ
--
-- 背景: 運用初期は全員に管理権限を持たせたいという要件。
-- role の choice は 'admin' / 'editor' / 'viewer' のまま残し、
-- 必要に応じて後から個別に絞れる。
-- =============================================================

-- 1. 既存の全 staff を admin に（再実行安全）
update public.staff
   set role = 'admin'
 where role <> 'admin';

-- 2. 今後の新規追加 staff のデフォルトを admin に
alter table public.staff
  alter column role set default 'admin';
