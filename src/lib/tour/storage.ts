import type { TourKey } from './types';

/**
 * 使い方ツアーの完了状態を localStorage で管理。
 * - `tour:global:first_login_seen`: 初回オンボーディング（ダッシュボード全体ツアー）完了
 * - `tour:{key}:completed`: 各ページツアー完了
 *
 * SSR 中に呼ばれても壊れないよう window チェックを挟む。
 */

const KEY_PREFIX = 'tour:';
const GLOBAL_KEY = `${KEY_PREFIX}global:first_login_seen`;

const pageKey = (key: TourKey) => `${KEY_PREFIX}${key}:completed`;

export function isGlobalSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(GLOBAL_KEY) === '1';
  } catch {
    return true;
  }
}

export function markGlobalSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GLOBAL_KEY, '1');
  } catch {
    /* quota 超過など: 黙って無視（次回また出るだけ） */
  }
}

export function isTourCompleted(key: TourKey): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(pageKey(key)) === '1';
  } catch {
    return true;
  }
}

export function markTourCompleted(key: TourKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(pageKey(key), '1');
  } catch {
    /* 無視 */
  }
}

/** 設定ページからの「ツアーをもう一度見る」用 */
export function resetAllTours(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* 無視 */
  }
}
