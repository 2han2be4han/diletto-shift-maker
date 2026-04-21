'use client';

import { useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCurrentStaff } from '@/components/layout/AppShell';
import { tours } from './tours';
import { markGlobalSeen, markTourCompleted } from './storage';
import type { TourKey, TourStep } from './types';

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

/**
 * ツアーを起動するフック。
 * - デバイス判定で PC/モバイル のステップを出し分け
 * - ロールで該当ステップをフィルタ
 * - 終了/スキップ時に完了フラグを保存
 */
export function useTour() {
  const { staff } = useCurrentStaff();
  const role = staff?.role ?? 'viewer';

  const start = useCallback(
    (key: TourKey) => {
      const def = tours[key];
      if (!def) return;
      const baseSteps: TourStep[] = isMobile() ? def.mobile : def.desktop;
      const visibleSteps = baseSteps.filter(
        (s) => !s.roles || s.roles.includes(role),
      );
      if (visibleSteps.length === 0) return;

      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: '次へ →',
        prevBtnText: '← 戻る',
        doneBtnText: '完了',
        progressText: '{{current}} / {{total}}',
        overlayOpacity: 0.55,
        smoothScroll: true,
        steps: visibleSteps.map((s) => ({
          element: s.element,
          popover: {
            title: s.title,
            description: s.description,
          },
          /* ターゲット要素が内側スクロールコンテナ内にあると driver.js の自動スクロールが
             効かない（window スクロール前提）ため、ハイライト時に明示的に scrollIntoView する。
             カンマ区切りセレクタの場合、最初にマッチしたものを対象にする。 */
          onHighlightStarted: (el) => {
            if (!el) return;
            try {
              (el as HTMLElement).scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
              });
            } catch {
              /* scroll できなくても致命的ではないので握りつぶす */
            }
          },
        })),
        onDestroyed: () => {
          if (key === 'global') markGlobalSeen();
          else markTourCompleted(key);
        },
      });
      d.drive();
    },
    [role],
  );

  return { start };
}
