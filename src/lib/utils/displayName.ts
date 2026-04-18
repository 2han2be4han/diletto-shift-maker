/**
 * Phase 28 F案: 職員の送迎表用・短縮表示名の解決。
 *
 * 送迎表の担当ドロップダウンはセル幅を抑えたいため、
 * staff.display_name（手動登録、3 文字まで）を優先し、
 * 未登録の職員は name の先頭 2 文字をフォールバックとして使う。
 *
 * - 同姓同名がぶつかる場合は手動で display_name を登録して回避する運用。
 * - フルネームは select の option 側で引き続き表示するため、
 *   表示名が省略されても候補選択時の区別は可能。
 */
export function staffDisplayName(
  s: { name: string; display_name?: string | null },
): string {
  const d = (s.display_name ?? '').trim();
  if (d) return d;
  /* 内部の空白（姓と名の区切りなど）は除去してから 3 文字だけ取る。
     例: 「濱田 亜希子」→「濱田亜」、「Johnson」→「Joh」、「本岡」→「本岡」 */
  const n = (s.name ?? '').replace(/\s+/g, '');
  return n.slice(0, 3);
}

/** Phase 28 F案: 表示名フィールドの app 側バリデーション（最大 3 文字、空は許容） */
export const STAFF_DISPLAY_NAME_MAX = 3;
