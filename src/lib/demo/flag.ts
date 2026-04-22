/**
 * デモモード判定ユーティリティ
 *
 * - クライアント側: sessionStorage を真とし、Cookie はミラー（middleware 用）
 * - サーバー側: Cookie のみで判定（SSR / middleware から sessionStorage は読めない）
 *
 * 真の永続化先は sessionStorage（タブを閉じれば消える）。
 * Cookie は session-only（Max-Age 無し）= ブラウザを閉じれば消える、で sessionStorage と寿命を揃える。
 */

export const DEMO_COOKIE_NAME = 'sp_demo';
export const DEMO_COOKIE_VALUE = '1';
export const DEMO_STORAGE_KEY = 'sp_demo_state_v1';

/** クライアント専用: sessionStorage に保存された状態が存在するか */
export function isDemoClient(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DEMO_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** クライアント専用: デモモードを有効化する（Cookie + sessionStorage seed フラグ） */
export function enableDemoCookie(): void {
  if (typeof document === 'undefined') return;
  /* session cookie: Max-Age / Expires を付けないことでブラウザを閉じたら消える。
     SameSite=Lax は middleware からの読み取りに必要、Path=/ はアプリ全域。 */
  document.cookie = `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}; Path=/; SameSite=Lax`;
}

/** クライアント専用: デモモードを完全停止（Cookie 削除 + sessionStorage 削除） */
export function disableDemoClient(): void {
  if (typeof document !== 'undefined') {
    /* Max-Age=0 で即時削除 */
    document.cookie = `${DEMO_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}

/**
 * サーバー専用: Cookie ヘッダ文字列からデモ判定。
 * Next.js の `cookies()` API から取得した値を渡す想定。
 */
export function isDemoCookie(cookieValue: string | undefined | null): boolean {
  return cookieValue === DEMO_COOKIE_VALUE;
}
