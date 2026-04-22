'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { isDemoClient } from '@/lib/demo/flag';

/**
 * 契約管理ページ（admin専用）
 * - 現在のプラン表示
 * - Stripe Customer Portalへのリンク
 *
 * TODO: Stripe連携後に実データに切り替え
 */

export default function BillingPage() {
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => {
    setIsDemo(isDemoClient());
  }, []);

  if (isDemo) {
    return (
      <>
        <Header title="契約管理" />
        <div className="p-6 max-w-2xl">
          <div
            className="p-8 flex flex-col items-center gap-4 text-center"
            style={{
              background: 'var(--gold-pale)',
              borderRadius: '12px',
              border: '1px solid var(--gold)',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>🔒</div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              契約管理はデモでは利用できません
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              実際の Stripe 契約情報を扱う画面のため、デモモードでは無効化されています。
              <br />
              有料版にアップグレードすると、プラン変更や支払い情報の管理が可能になります。
            </p>
            <a
              href="https://diletto-s.com/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center font-semibold transition-all mt-2"
              style={{
                background: 'var(--ink)',
                color: '#fff',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '0.9rem',
                textDecoration: 'none',
              }}
            >
              お問い合わせ
            </a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="契約管理" />

      <div className="p-6 max-w-2xl">
        <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--ink)' }}>契約管理</h2>

        <div
          className="p-6"
          style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>現在のプラン</p>
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>ShiftPuzzle スタンダード</p>
            </div>
            <Badge variant="success">有効</Badge>
          </div>

          <div className="flex flex-col gap-2 mb-6" style={{ color: 'var(--ink-2)', fontSize: '0.9rem' }}>
            <p>次回請求日: 2026年5月1日</p>
            <p>月額: ¥--,---（税込）</p>
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              // TODO: Stripe Customer Portal URLに遷移
              alert('Stripe連携後にCustomer Portalに遷移します');
            }}
          >
            支払い情報・プラン変更（Stripe Portal）
          </Button>
        </div>
      </div>
    </>
  );
}
