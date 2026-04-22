'use client';

/**
 * デモモード Provider。
 *
 * レイアウト側（(app)/layout.tsx）でサーバー判定したデモ Cookie をもとにマウントする。
 * 役割:
 *   1. sessionStorage を hydrate（無ければ seed）
 *   2. window.fetch をモンキーパッチし、/api/* を demoBackend にルーティング
 *   3. アンマウント時に fetch を復元
 *
 * 注意:
 *   - 本番ユーザーでは Layout 側で mount されないため、patch は発生しない
 *   - React StrictMode / Fast Refresh で effect が 2 回走る対策として
 *     window.fetch に __demo_patched フラグを立てて多重適用を防ぐ
 *   - 絶対 URL（同一 origin の localhost:5000/api/...）と相対 URL（/api/...）の
 *     両方をサポート。/_next/ は触らない
 */

import { useEffect, type ReactNode } from 'react';
import { handleDemoRequest } from './demoBackend';
import { loadDemoState } from './store';

type PatchedFetch = typeof window.fetch & { __demo_patched?: boolean; __demo_real?: typeof window.fetch };

export default function DemoProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    /* sessionStorage の seed を確実に作る。loadDemoState() は無ければ buildSeedState → save する */
    try {
      loadDemoState();
    } catch {
      /* hydrate 失敗時は無視。以後 fetch patch 側で毎回 loadDemoState するので自己回復する */
    }

    const current = window.fetch as PatchedFetch;
    if (current.__demo_patched) {
      /* StrictMode で 2 回目の effect。既に patch 済みなら何もしない */
      return;
    }

    const realFetch = current.bind(window);

    const patched: PatchedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      /* URL を抽出し、同一 origin の /api/* だけを demoBackend に委譲 */
      try {
        const base = window.location?.origin ?? 'http://localhost';
        const raw =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        const url = new URL(raw, base);
        const sameOrigin = url.origin === base;
        const isApi = sameOrigin && url.pathname.startsWith('/api/');
        const isNextRsc = url.pathname.includes('/_next/');
        if (isApi && !isNextRsc) {
          const res = await handleDemoRequest(input, init);
          if (res) return res;
        }
      } catch {
        /* URL parse 失敗は本物 fetch に委譲 */
      }
      return realFetch(input, init);
    }) as PatchedFetch;

    patched.__demo_patched = true;
    patched.__demo_real = realFetch;
    window.fetch = patched;

    return () => {
      /* Hot reload 時のクリーンアップ。real fetch に戻す */
      const f = window.fetch as PatchedFetch;
      if (f.__demo_patched && f.__demo_real) {
        window.fetch = f.__demo_real;
      }
    };
  }, []);

  return <>{children}</>;
}
