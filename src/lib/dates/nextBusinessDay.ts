/**
 * 週末スキップユーティリティ。
 *
 * 土曜/日曜ならその直後の月曜を返す。それ以外はその日付のまま返す。
 * 祝日対応は将来拡張。
 */
export function nextBusinessDay(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); /* 0=日 1=月 ... 6=土 */
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return d;
}

/** YYYY-MM-DD 形式 */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Phase 25-D: アプリ起動時の初期日付。
 *   - 平日 → 今日
 *   - 土日 → 翌月曜
 */
export function defaultOutputDate(now: Date = new Date()): string {
  return toDateString(nextBusinessDay(now));
}
