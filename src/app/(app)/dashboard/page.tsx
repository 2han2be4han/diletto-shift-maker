import Link from 'next/link';
import Header from '@/components/layout/Header';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';
import { createClient } from '@/lib/supabase/server';

/**
 * ダッシュボード
 * - admin: 全テナントサマリー + 管理リンク
 * - editor / viewer: 自分向けタスク（休み希望・シフト・送迎・送り場所）
 */
export default async function DashboardPage() {
  const staff = await getCurrentStaff();
  const supabase = await createClient();

  /* 未読通知数（自分宛） */
  let unreadCount = 0;
  if (staff) {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_staff_id', staff.id)
      .eq('is_read', false);
    unreadCount = count ?? 0;
  }

  /* 管理者向け: 承認待ちコメント数 */
  let pendingCommentsCount = 0;
  if (staff?.role === 'admin') {
    const { count } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    pendingCommentsCount = count ?? 0;
  }

  const STAFF_CARDS: { href: string; title: string; desc: string; icon: string }[] = [
    { href: '/request', title: '休み希望を出す', desc: '今月・来月の休み希望をカレンダーから登録', icon: '✋' },
    { href: '/shift', title: 'シフト表を見る', desc: '自分の出勤予定と全体のシフトを確認', icon: '📋' },
    { href: '/transport', title: '送迎表を見る', desc: '今日・明日の送迎担当を確認', icon: '🚗' },
    { href: '/locations', title: '送り場所を確認', desc: '児童ごとの送り場所と目印写真を見る', icon: '📍' },
  ];

  const ADMIN_CARDS: { href: string; title: string; desc: string; icon: string }[] = [
    { href: '/schedule', title: '利用予定', desc: 'PDFインポート・カレンダー確認', icon: '📅' },
    { href: '/shift', title: 'シフト表', desc: 'シフト生成・調整・確定', icon: '📋' },
    { href: '/transport', title: '送迎表', desc: '担当割り当て・確定', icon: '🚗' },
    { href: '/request', title: '休み希望一覧', desc: '全職員の提出状況を確認', icon: '✋' },
    { href: '/locations', title: '送り場所', desc: '児童ごとの住所・写真を管理', icon: '📍' },
    { href: '/settings/tenant', title: '設定', desc: 'テナント・職員・児童の管理', icon: '⚙️' },
  ];

  const cards = staff?.role === 'admin' ? ADMIN_CARDS : STAFF_CARDS;
  const welcomeName = staff?.name ?? 'ゲスト';

  return (
    <>
      <Header title="ダッシュボード" />

      <div className="p-6 overflow-y-auto">
        {/* ウェルカム */}
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
              こんにちは、{welcomeName} さん
            </h2>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
              {staff?.role === 'admin'
                ? '管理者モード: すべての機能にアクセスできます'
                : staff?.role === 'editor'
                ? '編集者モード: シフト・送迎・休み希望の編集ができます'
                : '閲覧者モード: 閲覧 + 自分の休み希望・コメントが出せます'}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {unreadCount > 0 && (
              <Link
                href="/dashboard#notifications"
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--accent-pale)', color: 'var(--accent)' }}
              >
                🔔 未読の通知 {unreadCount} 件
              </Link>
            )}
            {staff?.role === 'admin' && pendingCommentsCount > 0 && (
              <Link
                href="/dashboard#pending"
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--gold-pale)', color: 'var(--gold)' }}
              >
                ⏳ 承認待ち {pendingCommentsCount} 件
              </Link>
            )}
          </div>
        </div>

        {/* カードグリッド */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="p-5 transition-shadow hover:shadow-lg"
              style={{
                background: 'var(--white)',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                border: '1px solid var(--rule)',
              }}
            >
              <div className="text-3xl mb-3">{c.icon}</div>
              <div className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>
                {c.title}
              </div>
              <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {c.desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
