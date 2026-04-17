-- =============================================================
-- 招待メール連打防止のためのクールダウンカラム追加
--
-- 背景:
--   再送 API を叩いた直後にもう一度叩かれるケースを防ぐ。
--   60秒以内の再送はサーバ側で 429 Too Many Requests を返す。
--
-- 使われる場所:
--   - /api/staff/invite          （新規招待送信時に now() を書き込み）
--   - /api/staff/[id]/resend-invite （再送時に now() を書き込み、直前値と比較）
-- =============================================================

alter table public.staff
  add column if not exists last_invited_at timestamptz;

comment on column public.staff.last_invited_at is
  '最後に招待メールを送った時刻。再送連打防止の cooldown 判定に使用';
