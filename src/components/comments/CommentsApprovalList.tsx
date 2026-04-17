'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import LocationImage from '@/components/locations/LocationImage';
import { COMMENT_IMAGES_BUCKET } from '@/types';
import type { CommentStatus, CommentTargetType } from '@/types';

type CommentItem = {
  id: string;
  tenant_id: string;
  author_staff_id: string;
  target_type: CommentTargetType;
  target_id: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  staff?: { name: string } | null;
  comment_images?: { id: string; storage_path: string }[];
};

const TARGET_LABELS: Record<CommentTargetType, string> = {
  shift_request: '休み希望',
  shift_assignment: 'シフト',
  transport_assignment: '送迎',
  child_dropoff_location: '送り場所',
};

export default function CommentsApprovalList({
  initialComments,
  currentStaffId,
}: {
  initialComments: CommentItem[];
  currentStaffId: string;
}) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [filter, setFilter] = useState<CommentStatus | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = filter === 'all' ? comments : comments.filter((c) => c.status === filter);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const url = `/api/comments/${id}/approve${action === 'reject' ? '?action=reject' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'エラー');
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: action === 'approve' ? 'approved' : 'rejected' } : c))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'エラー');
    } finally {
      setBusy(null);
    }
  };

  const countByStatus: Record<CommentStatus | 'all', number> = {
    pending: comments.filter((c) => c.status === 'pending').length,
    approved: comments.filter((c) => c.status === 'approved').length,
    rejected: comments.filter((c) => c.status === 'rejected').length,
    all: comments.length,
  };

  const badge = (s: CommentStatus) =>
    s === 'approved' ? <Badge variant="success">承認済</Badge>
      : s === 'rejected' ? <Badge variant="error">却下</Badge>
      : <Badge variant="warning">承認待ち</Badge>;

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="px-3 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: filter === s ? 'var(--accent)' : 'var(--bg)',
              color: filter === s ? '#fff' : 'var(--ink-2)',
              border: '1px solid var(--rule)',
            }}
          >
            {s === 'pending' ? '承認待ち' : s === 'approved' ? '承認済' : s === 'rejected' ? '却下' : '全て'}
            <span className="ml-1 opacity-70">({countByStatus[s]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--ink-3)' }}>
          該当するコメントがありません
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="p-4"
              style={{
                background: 'var(--white)',
                borderRadius: '8px',
                border: `1px solid ${c.status === 'pending' ? 'rgba(199,145,38,0.3)' : 'var(--rule)'}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="info">{TARGET_LABELS[c.target_type]}</Badge>
                {badge(c.status)}
                <span className="text-xs font-bold ml-2" style={{ color: 'var(--ink)' }}>
                  {c.staff?.name ?? '(退職職員)'}
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--ink-3)' }}>
                  {new Date(c.created_at).toLocaleString('ja-JP')}
                </span>
              </div>
              {c.body && (
                <p className="text-sm whitespace-pre-wrap mb-2" style={{ color: 'var(--ink-2)' }}>
                  {c.body}
                </p>
              )}
              {c.comment_images && c.comment_images.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {c.comment_images.map((img) => (
                    <LocationImage
                      key={img.id}
                      storagePath={img.storage_path}
                      alt=""
                      bucket={COMMENT_IMAGES_BUCKET}
                      className="w-24 h-24 object-cover rounded"
                    />
                  ))}
                </div>
              )}
              {c.status === 'pending' && c.author_staff_id !== currentStaffId && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleAction(c.id, 'approve')}
                    disabled={busy === c.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded"
                    style={{ background: 'var(--green)', color: '#fff' }}
                  >
                    {busy === c.id ? '...' : '承認'}
                  </button>
                  <button
                    onClick={() => handleAction(c.id, 'reject')}
                    disabled={busy === c.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded"
                    style={{ background: 'var(--red)', color: '#fff' }}
                  >
                    却下
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
