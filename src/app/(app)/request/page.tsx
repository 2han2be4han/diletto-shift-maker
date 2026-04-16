'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

/**
 * 休み希望管理ページ（管理者向け）
 * - 全職員の提出状況を一覧表示
 * - 提出済み: 内容プレビュー
 * - 未提出: リマインド or 代理入力
 * - 各職員の共有URL（ログイン不要）をコピー可
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

type StaffRequest = {
  staffId: string;
  staffName: string;
  employmentType: 'full_time' | 'part_time';
  status: 'submitted' | 'not_submitted';
  submittedAt: string | null;
  publicHolidays: number;
  paidLeaves: number;
  availableDays: number;
  notes: string;
};

const MOCK_REQUESTS: StaffRequest[] = [
  { staffId: 's1', staffName: '金田', employmentType: 'full_time', status: 'submitted', submittedAt: '2026-04-10', publicHolidays: 8, paidLeaves: 1, availableDays: 0, notes: '月末に連休希望' },
  { staffId: 's2', staffName: '加藤', employmentType: 'full_time', status: 'submitted', submittedAt: '2026-04-12', publicHolidays: 8, paidLeaves: 0, availableDays: 0, notes: '' },
  { staffId: 's3', staffName: '鈴木', employmentType: 'full_time', status: 'not_submitted', submittedAt: null, publicHolidays: 0, paidLeaves: 0, availableDays: 0, notes: '' },
  { staffId: 's4', staffName: '田中', employmentType: 'full_time', status: 'submitted', submittedAt: '2026-04-08', publicHolidays: 9, paidLeaves: 2, availableDays: 0, notes: '15日は午前のみ出勤希望' },
  { staffId: 's5', staffName: '佐藤', employmentType: 'part_time', status: 'submitted', submittedAt: '2026-04-11', publicHolidays: 0, paidLeaves: 0, availableDays: 12, notes: '' },
  { staffId: 's6', staffName: '山本', employmentType: 'full_time', status: 'not_submitted', submittedAt: null, publicHolidays: 0, paidLeaves: 0, availableDays: 0, notes: '' },
];

export default function RequestPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailStaff, setDetailStaff] = useState<StaffRequest | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const submitted = MOCK_REQUESTS.filter((r) => r.status === 'submitted');
  const notSubmitted = MOCK_REQUESTS.filter((r) => r.status === 'not_submitted');

  const targetMonth = '2026年5月';

  const handleCopyLink = (staffId: string) => {
    const url = `${window.location.origin}/request/submit?staff=${staffId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(staffId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <>
      <Header title="休み希望" onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              {targetMonth}の休み希望
            </h2>
            <Badge variant="success">提出 {submitted.length}名</Badge>
            <Badge variant="error">未提出 {notSubmitted.length}名</Badge>
          </div>
          <Badge variant="info">締切: 前月20日</Badge>
        </div>

        {/* 提出状況テーブル */}
        <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['職員名', '雇用', 'ステータス', '公休', '有給', '出勤可', '特記', '提出日', '操作'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_REQUESTS.map((r) => (
                <tr
                  key={r.staffId}
                  className="hover:bg-[var(--accent-pale)] transition-colors"
                  style={{
                    background: r.status === 'not_submitted' ? 'var(--red-pale)' : 'transparent',
                  }}
                >
                  <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>
                    {r.staffName}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {r.employmentType === 'full_time' ? '常勤' : 'パート'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant={r.status === 'submitted' ? 'success' : 'error'}>
                      {r.status === 'submitted' ? '提出済み' : '未提出'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--accent)' }}>
                    {r.publicHolidays > 0 ? `${r.publicHolidays}日` : '-'}
                  </td>
                  <td className="px-3 py-2 text-center" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--green)' }}>
                    {r.paidLeaves > 0 ? `${r.paidLeaves}日` : '-'}
                  </td>
                  <td className="px-3 py-2 text-center" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--gold)' }}>
                    {r.availableDays > 0 ? `${r.availableDays}日` : '-'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', maxWidth: '150px' }}>
                    <span className="truncate block">{r.notes || '-'}</span>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)' }}>
                    {r.submittedAt || '-'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    {r.status === 'submitted' && (
                      <button
                        onClick={() => setDetailStaff(r)}
                        className="text-xs font-semibold px-2 py-1 rounded hover:bg-[var(--accent-pale)]"
                        style={{ color: 'var(--accent)' }}
                      >
                        詳細
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 共有URLエリア */}
        <div
          className="mt-6 p-4"
          style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        >
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>
            提出用リンク（ログイン不要）
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
            このURLを職員に共有してください。開くと名前を選んで休み希望を提出できます。
          </p>
          <div className="flex items-center gap-2">
            <code
              className="text-sm flex-1 px-3 py-2 rounded truncate"
              style={{ background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
            >
              {typeof window !== 'undefined' ? `${window.location.origin}/request/submit` : '/request/submit'}
            </code>
            <button
              onClick={() => {
                const url = `${window.location.origin}/request/submit`;
                navigator.clipboard.writeText(url).then(() => {
                  setCopiedId('shared');
                  setTimeout(() => setCopiedId(null), 2000);
                });
              }}
              className="text-sm font-semibold px-4 py-2 rounded shrink-0 transition-colors"
              style={{
                background: copiedId === 'shared' ? 'var(--green)' : 'var(--accent)',
                color: '#fff',
                borderRadius: '6px',
              }}
            >
              {copiedId === 'shared' ? 'コピー済み ✓' : 'URLをコピー'}
            </button>
          </div>
        </div>
      </div>

      {/* 詳細モーダル */}
      <Modal
        isOpen={!!detailStaff}
        onClose={() => setDetailStaff(null)}
        title={detailStaff ? `${detailStaff.staffName}の休み希望` : ''}
      >
        {detailStaff && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Badge variant="info">公休 {detailStaff.publicHolidays}日</Badge>
              <Badge variant="success">有給 {detailStaff.paidLeaves}日</Badge>
              <Badge variant="warning">出勤可 {detailStaff.availableDays}日</Badge>
            </div>
            {detailStaff.notes && (
              <div className="px-3 py-2" style={{ background: 'var(--bg)', borderRadius: '6px' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>特記事項</p>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>{detailStaff.notes}</p>
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              提出日: {detailStaff.submittedAt}
            </p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              ※ 日付ごとの詳細はSupabase連携後に表示
            </p>
            <Button variant="secondary" onClick={() => setDetailStaff(null)}>閉じる</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
