import type { StaffRole } from '@/types';

export type TourStep = {
  /** ターゲット要素のセレクタ（`[data-tour="..."]` など）。未指定ならモーダル風（画面中央）表示 */
  element?: string;
  title: string;
  description: string;
  /** このステップを表示するロール。未指定なら全ロール */
  roles?: StaffRole[];
};

export type TourDefinition = {
  desktop: TourStep[];
  mobile: TourStep[];
};

/** 11 ページ + global（ダッシュボード初回オンボーディング） */
export type TourKey =
  | 'global'
  | 'dashboard'
  | 'schedule'
  | 'shift'
  | 'transport'
  | 'request'
  | 'output-daily'
  | 'output-weekly-transport'
  | 'comments'
  | 'settings-tenant'
  | 'settings-staff'
  | 'settings-children';
