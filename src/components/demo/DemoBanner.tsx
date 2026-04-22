'use client';

/**
 * デモモード中に画面左下に常時フロートする小型バナー。
 * - 折りたたみ可能（既定は展開）。アイコンのみ表示にもできる
 * - リセット = sessionStorage を reseed して reload
 * - 終了 = Cookie + sessionStorage を削除して /login へ
 */

import { useState } from 'react';
import { disableDemoClient } from '@/lib/demo/flag';
import { reseedDemoState } from '@/lib/demo/store';

export default function DemoBanner() {
  const [busy, setBusy] = useState<'reset' | 'exit' | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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

  /* 折りたたみ時: 丸アイコンだけ */
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="デモモード案内を開く"
        className="transition-all"
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 1000,
          width: 44,
          height: 44,
          borderRadius: 9999,
          background: 'var(--gold-pale-solid)',
          border: '1px solid var(--gold)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          fontSize: '1.1rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="デモモード中"
      >
        🎮
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="デモモード案内"
      className="flex items-center gap-2"
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 'calc(100vw - 32px)',
        padding: '8px 10px',
        background: 'var(--gold-pale)',
        border: '1px solid var(--gold)',
        borderRadius: 9999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        color: 'var(--ink)',
        fontSize: '0.8rem',
      }}
    >
      <span style={{ fontSize: '1rem', lineHeight: 1 }}>🎮</span>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>デモモード</span>

      <button
        type="button"
        onClick={handleReset}
        disabled={busy !== null}
        title="デモデータを初期状態に戻す"
        className="transition-all disabled:opacity-50 disabled:pointer-events-none"
        style={{
          background: 'var(--white)',
          color: 'var(--ink)',
          border: '1px solid var(--rule)',
          borderRadius: 9999,
          padding: '3px 10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {busy === 'reset' ? '...' : '↻ リセット'}
      </button>
      <button
        type="button"
        onClick={handleExit}
        disabled={busy !== null}
        title="デモを終了してログイン画面に戻る"
        className="transition-all disabled:opacity-50 disabled:pointer-events-none"
        style={{
          background: 'var(--ink)',
          color: '#ffffff',
          border: 'none',
          borderRadius: 9999,
          padding: '3px 10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {busy === 'exit' ? '...' : '終了'}
      </button>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="デモモード案内を折りたたむ"
        title="折りたたむ"
        className="transition-all"
        style={{
          background: 'transparent',
          color: 'var(--ink-3)',
          border: 'none',
          padding: '0 4px',
          fontSize: '0.85rem',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
