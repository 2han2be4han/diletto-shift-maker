'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * dilettoブランド準拠のログインページ
 * - 左パネル: diletto本体サイト(diletto-s.com)と同一ブランド表現
 * - 右パネル: admin.htmlと同一スタイルのログインカード
 */

/* dilettoロゴ（common.jsと同一マークアップ再現） */
function DilettoLogo({ size = 'default' }: { size?: 'default' | 'small' }) {
  const fontSize = size === 'small' ? '1.05rem' : '1.3rem';
  const subSize = size === 'small' ? '0.58em' : '0.62em';

  return (
    <span
      style={{
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.12em',
        color: 'var(--ink)',
      }}
    >
      di
      <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>letto</em>
      {' '}
      <span style={{ fontSize: subSize, fontWeight: 600, opacity: 1 }}>
        by <span style={{ color: '#2e9e46' }}>AI Skill</span> Exchange
      </span>
    </span>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError('メールアドレスまたはパスワードが正しくありません');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('ログイン中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--white)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '10px',
    padding: '14px 18px',
    fontSize: '1rem',
  };

  return (
    <div className="flex min-h-screen">
      {/* === 左パネル: dilettoブランディング（lg以上）DocMerge準拠・黒背景 === */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between px-12 py-10"
        style={{ background: '#111111' }}
      >
        {/* 上部: dilettoロゴ（白テキスト版） */}
        <div>
          <span
            style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#ffffff',
            }}
          >
            di
            <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>letto</em>
            {' '}
            <span style={{ fontSize: '0.58em', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
              by <span style={{ color: '#2e9e46' }}>AI Skill</span> Exchange
            </span>
          </span>
        </div>

        {/* 中央: プロダクト紹介 */}
        <div className="flex flex-col gap-6 max-w-lg">
          <h1
            className="font-bold leading-tight"
            style={{
              color: '#ffffff',
              fontSize: 'clamp(2rem, 3.4vw, 2.8rem)',
              fontWeight: 900,
            }}
          >
            送迎・シフト管理を、
            <br />
            もっとシンプルに。
          </h1>
          <p
            className="leading-relaxed"
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: '1rem',
              lineHeight: '1.85',
            }}
          >
            放課後等デイサービス向け送迎・シフト半自動生成SaaS。
            <br />
            PDFから利用予定を読み取り、シフトと送迎担当を
            <br />
            ワンクリックで仮割り当て。
          </p>
          <div className="flex flex-col gap-4 mt-2">
            {[
              'PDFから利用予定を自動読み取り',
              '休み希望を反映したシフト生成',
              'ワンクリックで送迎担当を仮割り当て',
            ].map((text) => (
              <div key={text} className="flex items-center gap-3">
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>•</span>
                <span
                  className="text-sm"
                  style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}
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
          © 2026 diletto by AI Skill Exchange. All rights reserved.
        </p>
      </div>

      {/* === 右パネル: ログインフォーム === */}
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{ background: 'var(--bg)' }}
      >
        <div className="w-full" style={{ maxWidth: '400px' }}>
          {/* モバイル用ロゴ（lg未満で表示） */}
          <div className="lg:hidden text-center mb-8">
            <DilettoLogo size="small" />
            <h2
              className="text-xl font-bold mt-3"
              style={{ color: 'var(--ink)' }}
            >
              ShiftPuzzle
            </h2>
          </div>

          {/* ログインカード（admin.html準拠） */}
          <div
            style={{
              background: 'var(--white)',
              borderRadius: '20px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
              padding: '48px',
            }}
          >
            {/* ロゴ（admin.htmlと同一スタイル） */}
            <div className="mb-8">
              <span
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  color: 'var(--ink)',
                }}
              >
                di
                <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>letto</em>
                {' '}
                <span style={{ fontWeight: 600, fontSize: '0.7em' }}>
                  ShiftPuzzle
                </span>
              </span>
            </div>

            <h2
              className="font-bold mb-1"
              style={{ color: 'var(--ink)', fontSize: '1.2rem' }}
            >
              ログイン
            </h2>
            <p
              className="mb-6"
              style={{ color: 'var(--ink-3)', fontSize: '0.9rem' }}
            >
              アカウント情報を入力してください
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              {/* メールアドレス */}
              <div className="flex flex-col gap-2">
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
                  className="w-full outline-none transition-all"
                  style={inputStyle}
                />
              </div>

              {/* パスワード */}
              <div className="flex flex-col gap-2">
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
                  className="w-full outline-none transition-all"
                  style={inputStyle}
                />
              </div>

              {/* エラーメッセージ */}
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

              {/* ログインボタン（admin.html準拠: ink背景→hover時accent） */}
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
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ink)';
                }}
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
