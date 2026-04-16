'use client';

type HeaderProps = {
  title: string;
  onMenuToggle: () => void;
};

/**
 * ページヘッダー
 * - タブレット以下: ハンバーガーメニューボタン表示
 * - デスクトップ: ページタイトルのみ
 */
export default function Header({ title, onMenuToggle }: HeaderProps) {
  return (
    <header
      className="flex items-center gap-4 px-6 py-4 shrink-0"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      {/* ハンバーガー（タブレット以下のみ表示） */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
        aria-label="メニューを開く"
      >
        <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
        <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
        <span className="block w-5 h-0.5" style={{ background: 'var(--ink)' }} />
      </button>

      <h1
        className="text-lg font-bold"
        style={{ color: 'var(--ink)' }}
      >
        {title}
      </h1>
    </header>
  );
}
