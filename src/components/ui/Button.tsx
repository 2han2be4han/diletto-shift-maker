'use client';

import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * ボタン4バリアント（デザインルールブック準拠）
 * - primary: 確定・保存（accent背景・白文字）
 * - secondary: キャンセル・戻る（枠線のみ）
 * - cta-submit: フォーム送信用（白背景・ink文字・全幅）
 * - app-card-cta: カード内CTA（accent枠線・hover時accent塗り）
 *
 * btn-shimmerはLP系ページ以外では使用禁止のため、primaryはシンプルスタイル
 */

type ButtonVariant = 'primary' | 'secondary' | 'cta-submit' | 'app-card-cta';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '10px 24px',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--ink-2)',
    border: '1px solid var(--rule-strong)',
    borderRadius: '4px',
    padding: '10px 24px',
  },
  'cta-submit': {
    background: 'var(--white)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '4px',
    padding: '12px 24px',
    width: '100%',
  },
  'app-card-cta': {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1.5px solid var(--accent)',
    borderRadius: '5px',
    padding: '8px 20px',
  },
};

export default function Button({
  variant = 'primary',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`text-sm font-semibold whitespace-nowrap transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={variantStyles[variant]}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
