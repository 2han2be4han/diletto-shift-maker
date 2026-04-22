'use client';

/**
 * デモモード用ダッシュボードシェル。
 *
 * (app)/dashboard/page.tsx が Supabase SSR で組み立てている UI を、
 * demo 時は /api/* (= demoBackend) から fetch して再構築する。
 * DemoProvider 配下で mount されるため、/api/* はモックに到達する。
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import MonthStatusBadge from '@/components/ui/MonthStatusBadge';

type Status = 'empty' | 'incomplete' | 'complete';
type CardKey = 'schedule' | 'shift' | 'transport' | 'request';

const ADMIN_CARDS: { href: string; title: string; desc: string; icon: string; key?: CardKey }[] = [
  { href: '/schedule', title: '利用予定', desc: 'PDFインポート・カレンダー確認', icon: '📅' },
  { href: '/shift', title: 'シフト表', desc: 'シフト生成・調整・確定', icon: '📋', key: 'shift' },
  { href: '/transport', title: '送迎表', desc: '担当割り当て・確定', icon: '🚗', key: 'transport' },
  { href: '/output/daily', title: '日次出力', desc: '当日の送迎・出勤をホワイトボード風に表示', icon: '📄' },
  { href: '/request', title: '休み希望一覧', desc: '全職員の提出状況を確認', icon: '✋', key: 'request' },
  { href: '/settings/tenant', title: '設定', desc: 'テナント・職員・児童の管理', icon: '⚙️' },
];

export default function DemoDashboardShell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [cardStatus, setCardStatus] = useState<Record<CardKey, Status>>({
    schedule: 'empty',
    shift: 'empty',
    transport: 'empty',
    request: 'empty',
  });
  const [targetMonthStr] = useState(() => {
    const now = new Date();
    const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nRes, sRes] = await Promise.all([
          fetch('/api/notifications?unread=1'),
          fetch(`/api/status/month?month=${targetMonthStr}`),
        ]);
        const nJson = (await nRes.json()) as { notifications?: Array<{ id: string }> };
        const sJson = (await sRes.json()) as { schedule?: Status; shift?: Status; transport?: Status; request?: Status };
        if (cancelled) return;
        setUnreadCount(nJson.notifications?.length ?? 0);
        setCardStatus({
          schedule: sJson.schedule ?? 'empty',
          shift: sJson.shift ?? 'empty',
          transport: sJson.transport ?? 'empty',
          request: sJson.request ?? 'empty',
        });
      } catch {
        /* demoBackend 側が握りつぶすはずなので基本ここには来ない */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetMonthStr]);

  return (
    <>
      <Header title="ダッシュボード" />

      <div className="p-6 overflow-y-auto">
        <div
          className="p-6 mb-6 flex items-center justify-between flex-wrap gap-4"
          style={{
            background: 'var(--white)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>
              こんにちは、デモ太郎 さん
            </h2>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
              管理者モード（デモ）: すべての機能を体験できます
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {unreadCount > 0 && (
              <span
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--accent-pale)', color: 'var(--accent)' }}
              >
                🔔 未読の通知 {unreadCount} 件
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ADMIN_CARDS.map((c) => {
            const status = c.key ? cardStatus[c.key] : null;
            return (
              <Link
                key={c.href}
                href={c.href}
                className="p-5 transition-shadow hover:shadow-lg relative"
                style={{
                  background: 'var(--white)',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  border: '1px solid var(--rule)',
                }}
              >
                {status && (
                  <div className="absolute top-3 right-3">
                    <MonthStatusBadge status={status} month={targetMonthStr} compact />
                  </div>
                )}
                <div className="text-3xl mb-3">{c.icon}</div>
                <div className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>
                  {c.title}
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {c.desc}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
