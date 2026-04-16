'use client';

import { type ReactNode, useEffect } from 'react';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  /* ESCキーで閉じる */
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        style={{
          background: 'var(--white)',
          borderRadius: '8px',
          boxShadow: '0 20px 48px rgba(0,0,0,0.12)',
        }}
        /* 背景クリックで閉じないようにする */
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          <h2
            className="text-lg font-bold"
            style={{ color: 'var(--ink)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none hover:opacity-60 transition-opacity"
            style={{ color: 'var(--ink-3)' }}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
