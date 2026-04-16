'use client';

import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

export default function DashboardPage() {
  return (
    <>
      <Header title="ダッシュボード" />

      <div className="p-6">
        <div
          className="p-6"
          style={{
            background: 'var(--white)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <h2 className="text-base font-bold mb-4" style={{ color: 'var(--ink)' }}>
            今月のサマリー（仮）
          </h2>

          <div className="flex flex-wrap gap-3 mb-6">
            <Badge variant="success">確定済み</Badge>
            <Badge variant="warning">要確認</Badge>
            <Badge variant="error">人員不足</Badge>
            <Badge variant="info">生成済み</Badge>
            <Badge variant="neutral">未着手</Badge>
          </div>

          <div className="flex gap-3">
            <Button variant="primary">シフト生成</Button>
            <Button variant="secondary">キャンセル</Button>
            <Button variant="app-card-cta">割り当て生成</Button>
          </div>
        </div>
      </div>
    </>
  );
}
