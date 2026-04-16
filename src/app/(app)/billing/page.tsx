'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

/**
 * 契約管理ページ（admin専用）
 * - 現在のプラン表示
 * - Stripe Customer Portalへのリンク
 *
 * TODO: Stripe連携後に実データに切り替え
 */

export default function BillingPage() {
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
