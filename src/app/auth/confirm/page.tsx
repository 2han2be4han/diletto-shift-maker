'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Phase 26: Supabase invite / recovery などの implicit flow（hash fragment）を受ける中継ページ。
 *
 * 背景:
 *   - `supabase.auth.admin.generateLink({ type: 'invite' })` が返すリンクは
 *     デフォルトで hash fragment に access_token / refresh_token を載せる。
 *   - hash はサーバーへ送信されないため、サーバーの /auth/callback (route.ts) では拾えない。
 *   - そこで本クライアントコンポーネントで `window.location.hash` を parse し、
 *     `supabase.auth.setSession` でセッションを確立する。
 *
 * PKCE（`?code=...` 形式）は従来通り /auth/callback で処理するため、このページと共存する。
 */
function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('認証情報を確認しています...');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = createClient();

      /* URL hash を parse（Supabase は #access_token=...&refresh_token=...&type=invite 形式で返す） */
      const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      const nextParam = searchParams.get('next');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (error) {
          setHasError(true);
          setMessage('セッションの確立に失敗しました。リンクが期限切れの可能性があります。');
          return;
        }

        /* hash を URL から消して履歴を汚さない */
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }

        /* invite の場合は初回パスワード設定へ、それ以外は next を優先 */
        let destination = nextParam || '/dashboard';
        if (type === 'invite') destination = nextParam || '/auth/set-password';
        else if (type === 'recovery') destination = '/auth/set-password?recovery=1';

        router.replace(destination);
        return;
      }

      /* hash に tokens が無い（PKCE / 直接アクセスなど）→ ログインへ */
      if (cancelled) return;
      setHasError(true);
      setMessage('認証情報が見つかりませんでした。ログインページからやり直してください。');
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-md text-center"
        style={{
          background: 'var(--white)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          padding: '40px',
        }}
      >
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>
          認証処理
        </h1>
        <p className="text-sm" style={{ color: hasError ? 'var(--red)' : 'var(--ink-2)' }}>
          {message}
        </p>
        {hasError && (
          <a
            href="/login"
            className="inline-block mt-6 font-semibold px-5 py-2.5 rounded-lg"
            style={{ background: 'var(--ink)', color: '#fff' }}
          >
            ログインに戻る
          </a>
        )}
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <AuthConfirmInner />
    </Suspense>
  );
}
