-- Phase 29: 送迎パターン（旧③）完全撤去
-- 事前確認済み: schedule_entries.pattern_id が非 NULL の行は 0 件（FK 違反なし）
-- 既存 58 件の child_transport_patterns レコードは DROP と同時に削除される
-- 運用: ユーザーが先に該当 19 児童の custom_pickup_areas / custom_dropoff_areas へ手動移行済み

-- 1. schedule_entries.pattern_id カラム削除（FK 含む）
ALTER TABLE schedule_entries
  DROP COLUMN IF EXISTS pattern_id;

-- 2. child_transport_patterns テーブル削除（関連 RLS・インデックス・FK も自動で消える）
DROP TABLE IF EXISTS child_transport_patterns CASCADE;
