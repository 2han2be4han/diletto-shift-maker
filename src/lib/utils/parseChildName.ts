import type { GradeType } from '@/types';

/**
 * デイロボの児童名から名前と学年を自動検出
 *
 * 対応パターン:
 * - "川島舞桜 (未就学)" → { name: "川島舞桜", grade: "preschool" }
 * - "川島颯斗 (5)"      → { name: "川島颯斗", grade: "elementary_5" }
 * - "黒川蒼斗 (3)"      → { name: "黒川蒼斗", grade: "elementary_3" }
 * - "板倉千夏 (小2)"    → { name: "板倉千夏", grade: "elementary_2" }
 * - "川島舞桜(未就学)"   → カッコ前後のスペースなしにも対応
 * - "川島舞桜"           → 学年なし（null）
 */

type ParsedChildName = {
  name: string;
  grade: GradeType | null;
  gradeLabel: string;
  rawGrade: string | null;
};

const GRADE_MAP: Record<string, GradeType> = {
  '未就学': 'preschool',
  '未就': 'preschool',
  '年少': 'nursery_3',
  '年中': 'nursery_4',
  '年長': 'nursery_5',
  '小1': 'elementary_1',
  '小2': 'elementary_2',
  '小3': 'elementary_3',
  '小4': 'elementary_4',
  '小5': 'elementary_5',
  '小6': 'elementary_6',
  '1': 'elementary_1',
  '2': 'elementary_2',
  '3': 'elementary_3',
  '4': 'elementary_4',
  '5': 'elementary_5',
  '6': 'elementary_6',
  '中1': 'junior_high_1',
  '中2': 'junior_high_2',
  '中3': 'junior_high_3',
  '中学': 'junior_high',
  '高1': 'high_1',
  '高2': 'high_2',
  '高3': 'high_3',
};

/**
 * 学年ラベル。プルダウン表示順もこの定義順に従う。
 * junior_high（旧「中学」）は後方互換のため末尾に保持。
 */
const GRADE_LABELS: Record<GradeType, string> = {
  preschool: '未就学',
  nursery_3: '年少',
  nursery_4: '年中',
  nursery_5: '年長',
  elementary_1: '小1',
  elementary_2: '小2',
  elementary_3: '小3',
  elementary_4: '小4',
  elementary_5: '小5',
  elementary_6: '小6',
  junior_high_1: '中1',
  junior_high_2: '中2',
  junior_high_3: '中3',
  high_1: '高1',
  high_2: '高2',
  high_3: '高3',
  junior_high: '中学（旧）',
};

export function parseChildName(raw: string): ParsedChildName {
  const cleaned = raw.trim();

  /* (xxx) or （xxx） パターンを探す */
  const match = cleaned.match(/^(.+?)\s*[\(（]([^)）]+)[\)）]\s*$/);

  if (match) {
    const name = match[1].trim();
    const rawGrade = match[2].trim();

    /* 学年マップで検索 */
    const grade = GRADE_MAP[rawGrade] || null;

    /* 数字のみの場合（"3" → 小3） */
    if (!grade && /^\d$/.test(rawGrade)) {
      const numGrade = GRADE_MAP[rawGrade];
      if (numGrade) {
        return {
          name,
          grade: numGrade,
          gradeLabel: GRADE_LABELS[numGrade],
          rawGrade,
        };
      }
    }

    return {
      name,
      grade,
      gradeLabel: grade ? GRADE_LABELS[grade] : rawGrade,
      rawGrade,
    };
  }

  /* カッコなし → 学年不明 */
  return {
    name: cleaned,
    grade: null,
    gradeLabel: '',
    rawGrade: null,
  };
}

/**
 * 学年から標準的な迎え時間帯を推定
 * （テナント設定で上書き可能にする前提のデフォルト値）
 */
export function getDefaultPickupTimeByGrade(grade: GradeType | null): string {
  switch (grade) {
    case 'preschool':
    case 'nursery_3':
    case 'nursery_4':
    case 'nursery_5':
      return '11:00';
    case 'elementary_1':
    case 'elementary_2':
      return '14:00';
    case 'elementary_3':
    case 'elementary_4':
    case 'elementary_5':
    case 'elementary_6':
      return '14:30';
    case 'junior_high':
    case 'junior_high_1':
    case 'junior_high_2':
    case 'junior_high_3':
      return '15:30';
    case 'high_1':
    case 'high_2':
    case 'high_3':
      return '16:00';
    default:
      return '14:00';
  }
}

export { GRADE_LABELS };
