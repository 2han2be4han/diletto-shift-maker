import { createBrowserClient } from '@supabase/ssr';

/**
 * ブラウザ用Supabaseクライアント
 * - anon key を使用（NEXT_PUBLIC_ プレフィックス = ブラウザに露出OK）
 * - RLSが適用される
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
