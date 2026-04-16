'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // TODO: Supabase Auth 実装後に接続
      // const { error } = await supabase.auth.signInWithPassword({ email, password });
      // if (error) throw error;
      // router.push('/dashboard');

      // 仮実装: 2秒後にダッシュボードへ
      await new Promise((resolve) => setTimeout(resolve, 1000));
      window.location.href = '/dashboard';
    } catch {
      setError('メールアドレスまたはパスワードが正しくありません');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* === 左パネル: ブランディング（lg以上で表示） === */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'var(--ink)' }}
      >
        {/* 上部: dilettoロゴ */}
        <div>
          <span
            className="text-sm font-semibold tracking-widest uppercase"
            style={{ color: 'var(--ink-3)' }}
          >
            diletto
          </span>
        </div>

        {/* 中央: プロダクト紹介 */}
        <div className="flex flex-col gap-6 max-w-md">
          <h1
            className="text-4xl font-bold leading-tight"
            style={{ color: 'var(--white)' }}
          >
            ShiftPuzzle
          </h1>
          <p
            className="text-base leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            放課後等デイサービス向け
            <br />
            送迎・シフト半自動生成SaaS
          </p>
          <div className="flex flex-col gap-3 mt-4">
            {[
              'PDFから利用予定を自動読み取り',
              '休み希望を反映したシフト生成',
              'ワンクリックで送迎担当を仮割り当て',
            ].map((text) => (
              <div key={text} className="flex items-center gap-3">
                <span
                  className="flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full shrink-0"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  ✓
                </span>
                <span
                  className="text-sm"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 下部: コピーライト */}
        <p
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          © 2026 diletto Inc.
        </p>
      </div>

      {/* === 右パネル: ログインフォーム === */}
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{ background: 'var(--bg)' }}
      >
        <div className="w-full max-w-sm">
          {/* モバイル用ロゴ（lg未満で表示） */}
          <div className="lg:hidden text-center mb-8">
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-1"
              style={{ color: 'var(--ink-3)' }}
            >
              diletto
            </p>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--ink)' }}
            >
              ShiftPuzzle
            </h1>
          </div>

          {/* ログインカード */}
          <div
            className="p-8"
            style={{
              background: 'var(--white)',
              borderRadius: '8px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <h2
              className="text-lg font-bold mb-1"
              style={{ color: 'var(--ink)' }}
            >
              ログイン
            </h2>
            <p
              className="text-sm mb-6"
              style={{ color: 'var(--ink-3)' }}
            >
              アカウント情報を入力してください
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {/* メールアドレス */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-semibold"
                  style={{ color: 'var(--ink-2)' }}
                >
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3 py-2.5 text-sm outline-none transition-all focus:ring-2"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    border: '1px solid var(--rule)',
                    borderRadius: '4px',
                    // @ts-expect-error -- CSS変数をfocusリングに使用
                    '--tw-ring-color': 'var(--accent-mid)',
                  }}
                />
              </div>

              {/* パスワード */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-semibold"
                  style={{ color: 'var(--ink-2)' }}
                >
                  パスワード
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  required
                  className="w-full px-3 py-2.5 text-sm outline-none transition-all focus:ring-2"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    border: '1px solid var(--rule)',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* エラーメッセージ */}
              {error && (
                <p
                  className="text-xs font-medium px-3 py-2"
                  style={{
                    color: 'var(--red)',
                    background: 'var(--red-pale)',
                    borderRadius: '4px',
                  }}
                >
                  {error}
                </p>
              )}

              {/* ログインボタン */}
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full mt-1"
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
