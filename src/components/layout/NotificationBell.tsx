'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { NotificationRow } from '@/types';

/**
 * ベル通知（ヘッダー右に常駐）
 * - 未読件数バッジ
 * - クリックでポップオーバー → 最新50件
 * - 個別クリックで該当ターゲットへ遷移（可能な範囲）
 * - 「全て既読」ボタン
 */

const POLL_INTERVAL_MS = 60 * 1000;

const TARGET_HREF: Record<string, string> = {
  shift_request: '/request',
  shift_assignment: '/shift',
  transport_assignment: '/transport',
  child_dropoff_location: '/locations',
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const { notifications: list } = await res.json();
        setNotifications(list ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAll = async () => {
    await fetch('/api/notifications', { method: 'POST', body: JSON.stringify({}) });
    fetchNotifications();
  };

  const handleOne = async (id: string) => {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    fetchNotifications();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--accent-pale)] transition-colors"
        aria-label="通知"
      >
        <span style={{ fontSize: '1.1rem' }}>🔔</span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold rounded-full px-1"
            style={{ background: 'var(--red)', color: '#fff', fontSize: '0.65rem' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 max-h-96 overflow-y-auto z-50"
          style={{
            background: 'var(--white)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '1px solid var(--rule)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{ borderBottom: '1px solid var(--rule)' }}
          >
            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>通知</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                全て既読
              </button>
            )}
          </div>

          {loading && notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--ink-3)' }}>
              読み込み中...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--ink-3)' }}>
              通知はありません
            </div>
          ) : (
            notifications.map((n) => {
              const href = n.target_type ? TARGET_HREF[n.target_type] ?? '/dashboard' : '/dashboard';
              return (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => handleOne(n.id)}
                  className="block px-4 py-3 hover:bg-[var(--accent-pale)] transition-colors"
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    background: n.is_read ? 'transparent' : 'var(--accent-pale)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>
                      {n.body}
                    </span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--accent)' }} />
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    {new Date(n.created_at).toLocaleString('ja-JP', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
