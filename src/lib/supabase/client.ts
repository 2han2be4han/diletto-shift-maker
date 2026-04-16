import { createBrowserClient } from '@supabase/ssr';

/**
 * ブラウザ用Supabaseクライアント
 * - anon key を使用（NEXT_PUBLIC_ プレフィックス = ブラウザに露出OK）
 * - RLSが適用される
 *
 * 環境変数未設定時はビルド（プリレンダリング）を壊さないため
 * プレースホルダURLでクライアントを生成する。
 * 実際のログイン・データ取得は環境変数が設定されたブラウザ実行時にのみ成立する。
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
  return createBrowserClient(url, key);
}
