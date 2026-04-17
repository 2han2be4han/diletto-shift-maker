-- =============================================================
-- children.grade_type の CHECK 制約を拡張
--
-- 追加する学年:
--   - 年少 / 年中 / 年長（幼稚園・保育園の 3〜5 歳児クラス）
--   - 中1 / 中2 / 中3（中学生の学年別）
--   - 高1 / 高2 / 高3（高校生の学年別）
--
-- 既存の 'junior_high' は旧データ互換のため残す（UI では「中学（旧）」表記）。
--
-- 適用手順:
--   1. 旧制約を drop
--   2. 新制約を add（既存データ ('preschool', 'elementary_1'..'6', 'junior_high') は全て許容値に含まれる）
-- =============================================================

alter table public.children
  drop constraint if exists children_grade_type_check;

alter table public.children
  add constraint children_grade_type_check
  check (grade_type in (
    'preschool',
    'nursery_3','nursery_4','nursery_5',
    'elementary_1','elementary_2','elementary_3',
    'elementary_4','elementary_5','elementary_6',
    'junior_high',
    'junior_high_1','junior_high_2','junior_high_3',
    'high_1','high_2','high_3'
  ));
