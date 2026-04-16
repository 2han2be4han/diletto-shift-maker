import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * サーバー用Supabaseクライアント（APIルート・Server Component向け）
 * - anon key + Cookieベースの認証セッションを使用
 * - RLSが適用される（ユーザーのセッションに基づくアクセス制御）
 *
 * ※ SUPABASE_SERVICE_ROLE_KEY はRLSをバイパスするため、
 *   管理者向けAPIルートでのみ使用すること（createAdminClient参照）
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component からの呼び出し時は set が使えないため無視
            // middleware または Route Handler で正しく処理される
          }
        },
      },
    }
  );
}

/**
 * 管理者用Supabaseクライアント（RLSバイパス）
 * - service_role key を使用
 * - ブラウザには絶対に露出させないこと
 * - 用途: テナント作成・Webhook処理など管理操作のみ
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}
