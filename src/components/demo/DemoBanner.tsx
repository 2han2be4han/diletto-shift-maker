'use client';

/**
 * デモモード中に main エリア最上部に常時表示するバナー。
 * リセット = sessionStorage を reseed して reload、
 * 終了   = Cookie + sessionStorage を削除して /login へ。
 */

import { useState } from 'react';
import { disableDemoClient } from '@/lib/demo/flag';
import { reseedDemoState } from '@/lib/demo/store';

export default function DemoBanner() {
  const [busy, setBusy] = useState<'reset' | 'exit' | null>(null);

  const handleReset = () => {
    if (busy) return;
    setBusy('reset');
    try {
      reseedDemoState();
    } catch {
      /* storage 不可でも reload 後に DemoProvider が再 seed する */
    }
    window.location.reload();
  };

  const handleExit = () => {
    if (busy) return;
    setBusy('exit');
    disableDemoClient();
    window.location.href = '/login';
  };

  return (
    <div
      role="region"
      aria-label="デモモード案内"
      className="flex items-center justify-between gap-3 px-4 py-2 flex-wrap"
      style={{
        background: 'var(--gold-pale)',
        borderBottom: '1px solid var(--gold)',
        color: 'var(--ink)',
        fontSize: '0.85rem',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ fontSize: '1rem' }}>🎮</span>
        <span style={{ fontWeight: 600 }}>デモモード中</span>
        <span style={{ color: 'var(--ink-3)', fontSize: '0.78rem' }}>
          データは保存されません・ブラウザを閉じると消えます
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={busy !== null}
          className="transition-all disabled:opacity-50 disabled:pointer-events-none"
          style={{
            background: 'var(--white)',
            color: 'var(--ink)',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {busy === 'reset' ? 'リセット中...' : 'データをリセット'}
        </button>
        <button
          type="button"
          onClick={handleExit}
          disabled={busy !== null}
          className="transition-all disabled:opacity-50 disabled:pointer-events-none"
          style={{
            background: 'var(--ink)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {busy === 'exit' ? '終了中...' : 'デモを終了'}
        </button>
      </div>
    </div>
  );
}
