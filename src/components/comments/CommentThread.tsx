'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SignedImage from '@/components/ui/SignedImage';
import { COMMENT_IMAGES_BUCKET } from '@/types';
import type { CommentTargetType, CommentStatus } from '@/types';

/**
 * 汎用コメントスレッド（4 機能共通）
 * - 画像添付は Supabase Storage の comment-images バケット
 * - 投稿直後は status=pending、admin が承認後に他職員にも公開
 * - role='admin' なら pending を承認/却下できる
 */

type CommentItem = {
  id: string;
  tenant_id: string;
  author_staff_id: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  staff?: { name: string } | null;
  comment_images?: { id: string; storage_path: string }[];
};

type Props = {
  targetType: CommentTargetType;
  targetId: string;
  currentRole: 'admin' | 'editor' | 'viewer';
  currentStaffId: string;
  title?: string;
};

export default function CommentThread({
  targetType,
  targetId,
  currentRole,
  currentStaffId,
  title,
}: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comments?target_type=${targetType}&target_id=${targetId}`
      );
      if (!res.ok) throw new Error('取得失敗');
      const { comments: cs } = await res.json();
      setComments(cs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', COMMENT_IMAGES_BUCKET);
      fd.append('subpath', 'comments');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? 'アップロード失敗');
      const { storage_path } = await res.json();
      setImagePaths((prev) => [...prev, storage_path]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'アップロード失敗');
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async () => {
    if (!body.trim() && imagePaths.length === 0) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          body: body.trim(),
          image_storage_paths: imagePaths,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '投稿失敗');
      setBody('');
      setImagePaths([]);
      await fetchComments();
    } catch (e) {
      setError(e instanceof Error ? e.message : '投稿失敗');
    } finally {
      setPosting(false);
    }
  };

  const handleApprove = async (id: string, action: 'approve' | 'reject') => {
    const url = `/api/comments/${id}/approve${action === 'reject' ? '?action=reject' : ''}`;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'エラー');
      await fetchComments();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'エラー');
    }
  };

  const statusBadge = (s: CommentStatus) => {
    if (s === 'approved') return <Badge variant="success">承認済</Badge>;
    if (s === 'rejected') return <Badge variant="error">却下</Badge>;
    return <Badge variant="warning">承認待ち</Badge>;
  };

  return (
    <div className="flex flex-col gap-3">
      {title && (
        <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          {title}
        </div>
      )}

      {loading ? (
        <div className="text-xs" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
      ) : comments.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--ink-3)' }}>まだコメントはありません</div>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((c) => {
            const isOwn = c.author_staff_id === currentStaffId;
            return (
              <div
                key={c.id}
                className="p-3"
                style={{
                  background: c.status === 'pending' ? 'var(--gold-pale)' : 'var(--bg)',
                  borderRadius: '6px',
                  border: `1px solid ${c.status === 'pending' ? 'rgba(199,145,38,0.3)' : 'var(--rule)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                    {c.staff?.name ?? '(退職職員)'}
                  </span>
                  {statusBadge(c.status)}
                  {isOwn && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>（自分）</span>}
                  <span className="text-xs ml-auto" style={{ color: 'var(--ink-3)' }}>
                    {new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {c.body && (
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>
                    {c.body}
                  </p>
                )}
                {c.comment_images && c.comment_images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {c.comment_images.map((img) => (
                      <SignedImage
                        key={img.id}
                        storagePath={img.storage_path}
                        alt=""
                        bucket={COMMENT_IMAGES_BUCKET}
                        className="w-20 h-20 object-cover rounded"
                      />
                    ))}
                  </div>
                )}
                {c.status === 'pending' && currentRole === 'admin' && !isOwn && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleApprove(c.id, 'approve')}
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{ background: 'var(--green)', color: '#fff' }}
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleApprove(c.id, 'reject')}
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{ background: 'var(--red)', color: '#fff' }}
                    >
                      却下
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 投稿フォーム */}
      <div
        className="p-3"
        style={{ background: 'var(--white)', borderRadius: '6px', border: '1px solid var(--rule)' }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="コメントを入力..."
          rows={2}
          className="w-full outline-none resize-none text-sm"
          style={{ color: 'var(--ink)' }}
        />
        {imagePaths.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {imagePaths.map((p) => (
              <div key={p} className="relative">
                <SignedImage
                  storagePath={p}
                  alt=""
                  bucket={COMMENT_IMAGES_BUCKET}
                  className="w-16 h-16 object-cover rounded"
                />
                <button
                  onClick={() => setImagePaths((prev) => prev.filter((x) => x !== p))}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold"
                  style={{ background: 'var(--red)', color: '#fff' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
            className="text-xs flex-1"
            disabled={uploading}
          />
          <Button variant="primary" onClick={handlePost} disabled={posting || uploading || (!body.trim() && imagePaths.length === 0)}>
            {posting ? '投稿中...' : '投稿'}
          </Button>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
          ※ 投稿後、管理者の承認を経て他のメンバーに公開されます
        </p>
        {error && (
          <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{error}</p>
        )}
      </div>
    </div>
  );
}
