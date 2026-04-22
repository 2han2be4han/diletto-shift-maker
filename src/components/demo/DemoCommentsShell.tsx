'use client';

/**
 * デモモード用コメント承認センターシェル（admin 固定）。
 * demo seed ではコメントは初期 0 件。UI 動作確認用。
 */

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import CommentsApprovalList from '@/components/comments/CommentsApprovalList';
import { DEMO_STAFF_ID_ME } from '@/lib/demo/seedData';

type CommentItem = Parameters<typeof CommentsApprovalList>[0]['initialComments'][number];

export default function DemoCommentsShell() {
  const [comments, setComments] = useState<CommentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/comments');
        const json = (await res.json()) as { comments?: CommentItem[] };
        if (!cancelled) setComments(json.comments ?? []);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Header title="コメント承認" />
      <div className="p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            コメント管理
          </h2>
          <Badge variant="info">admin専用（デモ）</Badge>
        </div>
        <CommentsApprovalList initialComments={comments} currentStaffId={DEMO_STAFF_ID_ME} />
      </div>
    </>
  );
}
