'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useTour } from '@/lib/tour/useTour';
import { resolveTourKey } from '@/lib/tour/tours';
import { isGlobalSeen, isTourCompleted } from '@/lib/tour/storage';
import { useCurrentStaff } from '@/components/layout/AppShell';

/**
 * 初回自動起動を監視する Provider。
 * - ログイン済み（staff あり）が前提
 * - ダッシュボードマウント時: global 未完了なら global ツアー起動
 * - 各ページマウント時: そのページツアー未完了なら起動
 * - 1度表示したら localStorage に保存されるので二重起動しない
 *
 * 注意:
 *  - ターゲット要素が DOM に出るまで少し待ってから起動（短い遅延）
 *  - React 厳密モード対策として同じ key では 1 セッション 1 回に抑制
 */
export default function TourProvider() {
  const pathname = usePathname();
  const { start } = useTour();
  const { staff } = useCurrentStaff();
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!staff) return;
    if (!pathname) return;

    const fire = (key: string, runner: () => void) => {
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      /* DOM 描画完了を待ってから起動（ターゲット要素の取りこぼし防止） */
      const t = window.setTimeout(runner, 600);
      return () => window.clearTimeout(t);
    };

    /* ダッシュボードでは global を優先（未見の場合）。
       global を見たら、それ以降はページ別ツアーが自動起動する。 */
    if (pathname.startsWith('/dashboard')) {
      if (!isGlobalSeen()) {
        fire('global', () => start('global'));
        return;
      }
      if (!isTourCompleted('dashboard')) {
        fire('dashboard', () => start('dashboard'));
        return;
      }
      return;
    }

    /* global 未完了のときは他ページではツアーを出さない（順序重視） */
    if (!isGlobalSeen()) return;

    const key = resolveTourKey(pathname);
    if (!key) return;
    if (isTourCompleted(key)) return;

    fire(key, () => start(key));
  }, [pathname, staff, start]);

  return null;
}
