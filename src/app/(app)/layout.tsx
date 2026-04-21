import type { ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
const DEV_SKIP_AUTH = process.env.DEV_SKIP_AUTH === 'true';

export default async function AppLayout({ children }: { children: ReactNode }) {
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
