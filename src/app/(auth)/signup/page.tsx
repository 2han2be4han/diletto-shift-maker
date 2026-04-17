'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * 事業所＋管理者の新規登録ページ
 * - 誰でもアクセス可能（/signup）
 * - 登録完了後、自動的にサインインして /dashboard へ
 */

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      /* 1. /api/signup で user + tenant + staff を作成 */
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantName, userName }),
      });

      /* 非 JSON レスポンス（middleware リダイレクト等）の保険 */
      const text = await res.text();
      let json: { error?: string; ok?: boolean } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`サーバー応答が不正です (${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? `登録に失敗しました (${res.status})`);

      /* 2. サインインしてセッション取得 */
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw new Error('登録は完了しましたが、ログインに失敗しました。ログインページから再度ログインしてください');

      /* 3. ダッシュボードへ（Cookie を確実に乗せるため hard navigation） */
      window.location.href = '/dashboard';
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました');
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
      {/* === 左パネル: dilettoブランディング === */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between px-12 py-10"
        style={{ background: '#111111' }}
      >
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

        <div className="flex flex-col gap-6 max-w-lg">
          <h1
            className="font-bold leading-tight"
            style={{
              color: '#ffffff',
              fontSize: 'clamp(2rem, 3.4vw, 2.8rem)',
              fontWeight: 900,
            }}
          >
            ShiftPuzzle を
            <br />
            はじめましょう。
          </h1>
          <p
            className="leading-relaxed"
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: '1rem',
              lineHeight: '1.85',
            }}
          >
            事業所と管理者アカウントを登録して、
            <br />
            送迎・シフトの自動化をすぐに始められます。
            <br />
            登録後は職員の招待もアプリから行えます。
          </p>
        </div>

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © 2026 diletto by AI Skill Exchange. All rights reserved.
        </p>
      </div>

      {/* === 右パネル: 登録フォーム === */}
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{ background: 'var(--bg)' }}
      >
        <div className="w-full" style={{ maxWidth: '400px' }}>
          <div
            style={{
              background: 'var(--white)',
              borderRadius: '20px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
              padding: '40px',
            }}
          >
            <div className="mb-6">
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
                <span style={{ fontWeight: 600, fontSize: '0.7em' }}>ShiftPuzzle</span>
              </span>
            </div>

            <h2 className="font-bold mb-1" style={{ color: 'var(--ink)', fontSize: '1.2rem' }}>
              新規登録
            </h2>
            <p className="mb-5" style={{ color: 'var(--ink-3)', fontSize: '0.85rem' }}>
              事業所と管理者アカウントを作成します
            </p>

            <form onSubmit={handleSignup} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                  事業所名
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="○○デイサービス"
                  required
                  maxLength={80}
                  className="w-full outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                  あなたの氏名
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="山田 太郎"
                  required
                  maxLength={40}
                  className="w-full outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                  パスワード（8文字以上）
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上"
                  required
                  minLength={8}
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
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ink)';
                }}
              >
                {loading ? '登録中...' : '登録して始める'}
              </button>

              <p className="text-xs text-center mt-2" style={{ color: 'var(--ink-3)' }}>
                既にアカウントをお持ちの方は{' '}
                <Link
                  href="/login"
                  style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline' }}
                >
                  ログイン
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
