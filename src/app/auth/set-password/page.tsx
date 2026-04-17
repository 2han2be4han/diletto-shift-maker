'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Phase 26: 初回パスワード設定 / パスワード再設定画面。
 * - 招待リンク経由の場合: /auth/confirm でセッション確立済みの想定
 * - 未ログイン状態でこのページが開かれた場合: /login へリダイレクト
 * - パスワード 2 回入力 → 一致確認 → supabase.auth.updateUser({ password })
 */
function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRecovery = searchParams.get('recovery') === '1';

  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  /* セッションが無ければログインに戻す */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace('/login');
        return;
      }
      setHasSession(true);
      setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('パスワードは 8 文字以上で入力してください');
      return;
    }
    if (password !== confirmPw) {
      setError('パスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(`パスワード設定に失敗しました: ${updateError.message}`);
        setLoading(false);
        return;
      }
      /* 設定完了 → ダッシュボードへ */
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスワード設定中にエラーが発生しました');
      setLoading(false);
    }
  };

  if (!sessionChecked || !hasSession) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-6"
        style={{ background: 'var(--bg)', color: 'var(--ink-3)' }}
      >
        読み込み中...
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--white)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '10px',
    padding: '14px 18px',
    fontSize: '1rem',
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: '420px',
          background: 'var(--white)',
          borderRadius: '20px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
          padding: '48px',
        }}
      >
        <h1 className="font-bold mb-1" style={{ color: 'var(--ink)', fontSize: '1.2rem' }}>
          {isRecovery ? 'パスワードを再設定' : '初回パスワードを設定'}
        </h1>
        <p className="mb-6" style={{ color: 'var(--ink-3)', fontSize: '0.85rem' }}>
          8 文字以上のパスワードを 2 回入力してください。
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
              新しいパスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full outline-none"
              style={inputStyle}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full outline-none"
              style={inputStyle}
            />
          </div>

          {error && (
            <p
              className="text-xs font-medium px-4 py-3"
              style={{
                color: 'var(--red)',
                background: 'var(--red-pale)',
                borderRadius: '10px',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none"
            style={{
              background: 'var(--ink)',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '14px',
              fontSize: '1rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {loading ? '設定中...' : 'パスワードを保存してログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordInner />
    </Suspense>
  );
}
