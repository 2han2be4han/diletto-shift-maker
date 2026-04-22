import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import AppShell from '@/components/layout/AppShell';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';
import { DEMO_COOKIE_NAME, isDemoCookie } from '@/lib/demo/flag';
import { DEMO_STAFF_ID_ME, DEMO_TENANT_ID } from '@/lib/demo/seedData';
import DemoProvider from '@/lib/demo/DemoProvider';
import DemoBanner from '@/components/demo/DemoBanner';
import type { AuthenticatedStaff } from '@/types';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
const DEV_SKIP_AUTH = process.env.DEV_SKIP_AUTH === 'true';

/* デモモード時にサーバー側で合成する admin staff。
   本物の staff と同じ shape なので AppShell / 権限判定はそのまま動く。 */
const DEMO_STAFF: AuthenticatedStaff = {
  id: DEMO_STAFF_ID_ME,
  tenant_id: DEMO_TENANT_ID,
  name: 'デモ太郎',
  email: 'demo@example.com',
  role: 'admin',
};

export const metadata = {
  /* デモ経路でも robots を noindex したいが、layout metadata は静的。
     実際の noindex 制御は D-15 で page 側に追加する */
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  /* デモ Cookie を先に判定。立っていれば Supabase を一切触らず合成 staff で AppShell を返す。
     middleware (D-6) で Supabase 認証はスキップされているが、ここでも独立判定することで
     DEV_SKIP_AUTH 併用環境でも「デモボタン → デモ体験」が成立する。 */
  const cookieStore = await cookies();
  const demoCookieValue = cookieStore.get(DEMO_COOKIE_NAME)?.value;
  if (isDemoCookie(demoCookieValue)) {
    return (
      <DemoProvider>
        <AppShell staff={DEMO_STAFF}>
          <DemoBanner />
          {children}
        </AppShell>
      </DemoProvider>
    );
  }

  const staff = await getCurrentStaff();

  /* Supabase 接続済みなのに staff が取れない = 未招待 or DB未構築
     middleware のリダイレクトループを避けるため、ここでは redirect せず
     エラー画面 + サインアウトボタンを表示する */
  if (SUPABASE_CONFIGURED && !DEV_SKIP_AUTH && !staff) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--bg)' }}
      >
        <div
          className="max-w-md w-full text-center p-8"
          style={{
            background: 'var(--white)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          }}
        >
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-lg font-bold mb-3" style={{ color: 'var(--ink)' }}>
            アクセスできません
          </h1>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            このメールアドレスに紐づく職員アカウントが見つかりませんでした。
          </p>

          <div
            className="text-left text-xs mb-6 p-4"
            style={{ background: 'var(--bg)', borderRadius: '8px', color: 'var(--ink-2)' }}
          >
            <p className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>
              対処方法
            </p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>既存事業所に参加する場合は、管理者から招待を受けてください</li>
              <li>事業所の新規登録については運営にお問い合わせください</li>
            </ul>
          </div>

          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full font-semibold transition-all"
              style={{
                background: 'var(--ink)',
                color: '#fff',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '0.9rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              サインアウトして別のアカウントでログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <AppShell staff={staff}>{children}</AppShell>;
}
