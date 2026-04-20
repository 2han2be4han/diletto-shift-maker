'use client';

import Button from '@/components/ui/Button';

/** Phase 58-fix: 休み希望ページの Header に置く印刷ボタン（client 境界を切るため別コンポーネント） */
export default function RequestPrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print-hide">
      🖨 印刷
    </Button>
  );
}
