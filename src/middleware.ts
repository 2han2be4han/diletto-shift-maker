import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 認証ミドルウェア
 * - Supabase が設定されている & DEV_SKIP_AUTH != 'true' のときのみ認証を強制
 * - 未認証 → /login
 * - 認証済みで /login → /dashboard
 * - /request/submit と /auth/* は常時通過（招待リンク・コールバック用）
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SKIP_AUTH_FLAG = process.env.DEV_SKIP_AUTH === 'true';
const SUPABASE_CONFIGURED =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('placeholder');

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/signout'];

export async function middleware(request: NextRequest) {
  /* Supabase 未接続 or 明示スキップ時 = 開発用バイパス */
  if (!SUPABASE_CONFIGURED || SKIP_AUTH_FLAG) {
    return NextResponse.next();
  }

  const supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // 認証済みユーザーが /login にアクセス → /dashboard へ
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // 未認証ユーザーが保護ページにアクセス → /login へ
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 以下を除外:
     * - _next/static, _next/image（Next.js内部）
     * - favicon.ico, *.svg, *.png 等の静的ファイル
     * - api/webhooks（Stripe Webhook は認証不要）
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/webhooks).*)',
  ],
};
