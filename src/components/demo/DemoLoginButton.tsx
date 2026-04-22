'use client';

/**
 * デモプレイ起動ボタン。
 *
 * ログインカード内のログインボタンの下に Secondary バリアントで並ぶ。
 * クリック時:
 *   1. sessionStorage を強制 reseed（前回のデモ残りを捨てる）
 *   2. sp_demo Cookie をセット（middleware と layout が検知する）
 *   3. hard navigation で /dashboard へ。middleware を必ず通すため location.href 代入
 *
 * 注意: ここでは Supabase に一切触らない。本物のログイン経路とは完全に独立。
 */

import { useState } from 'react';
import { enableDemoCookie } from '@/lib/demo/flag';
import { reseedDemoState } from '@/lib/demo/store';

export default function DemoLoginButton() {
  const [starting, setStarting] = useState(false);

  const handleStart = () => {
    if (starting) return;
    setStarting(true);
    try {
      reseedDemoState();
      enableDemoCookie();
    } catch {
      /* storage アクセス不可でも Cookie だけセットされていれば middleware で /dashboard へ行ける。
         その先 DemoProvider が loadDemoState() で再 seed するので事実上リカバリされる */
    }
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex flex-col gap-2 mt-4">
      <button
        type="button"
        onClick={handleStart}
        disabled={starting}
        className="w-full font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none"
        style={{
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--rule)',
          borderRadius: '10px',
          padding: '14px',
          fontSize: '0.95rem',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!starting) {
            e.currentTarget.style.background = 'var(--bg)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--surface)';
          e.currentTarget.style.borderColor = 'var(--rule)';
        }}
      >
        {starting ? '起動中...' : '🎮 デモプレイしてみる'}
      </button>
      <p
        className="text-center"
        style={{ color: 'var(--ink-3)', fontSize: '0.72rem', lineHeight: 1.5 }}
      >
        登録不要・ブラウザを閉じるとデータは消えます
      </p>
    </div>
  );
}
