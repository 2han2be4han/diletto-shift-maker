'use client';

import { useMemo, useState, useCallback } from 'react';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import MyRequestCalendar from '@/components/request/MyRequestCalendar';
import type { ShiftRequestRow, StaffRow } from '@/types';

/**
 * 管理者向け: 全職員の休み希望提出状況
 * Phase 25: 代理入力時は submitted_by_staff_id で判定して「代理」バッジ表示
 */
type Props = {
  staff: StaffRow[];
  initialRequests: ShiftRequestRow[];
  targetMonth: string;
};

export default function AdminRequestList({ staff, initialRequests, targetMonth }: Props) {
  const [requests, setRequests] = useState<ShiftRequestRow[]>(initialRequests);
  const [detail, setDetail] = useState<{ staff: StaffRow; reqs: ShiftRequestRow[] } | null>(null);
  /* Phase 25: 管理者が代理で休み希望を入力するモーダル */
  const [proxyTarget, setProxyTarget] = useState<{ staff: StaffRow; reqs: ShiftRequestRow[] } | null>(null);

  /** 代理入力・再取得時に shift_requests を fetch し直す */
  const refetch = useCallback(async () => {
    const res = await fetch(`/api/shift-requests?month=${targetMonth}`);
    if (!res.ok) return;
    const { requests: next } = await res.json();
    setRequests((next ?? []) as ShiftRequestRow[]);
  }, [targetMonth]);

  const byStaff = useMemo(() => {
    const map = new Map<string, ShiftRequestRow[]>();
    for (const r of requests) {
      const arr = map.get(r.staff_id) ?? [];
      arr.push(r);
      map.set(r.staff_id, arr);
    }
    return map;
  }, [requests]);

  const submittedCount = staff.filter((s) => byStaff.has(s.id)).length;
  const notSubmittedCount = staff.length - submittedCount;

  const getCount = (reqs: ShiftRequestRow[] | undefined, type: string) =>
    reqs?.find((r) => r.request_type === type)?.dates.length ?? 0;

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Badge variant="success">提出 {submittedCount}名</Badge>
        <Badge variant="error">未提出 {notSubmittedCount}名</Badge>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>対象月 {targetMonth}</span>
      </div>

      <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
        <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {['職員名', '雇用', 'ステータス', '公休', '有給', '出勤可', '特記', '提出日', '代理入力'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                  style={{ background: 'var(--ink)', color: '#fff' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center" style={{ color: 'var(--ink-3)' }}>
                  職員が登録されていません
                </td>
              </tr>
            )}
            {staff.map((s) => {
              const reqs = byStaff.get(s.id);
              const isSubmitted = !!reqs && reqs.length > 0;
              const phRow = reqs?.find((r) => r.request_type === 'public_holiday');
              /* 代理入力判定: いずれかの request_type で submitted_by != staff_id */
              const proxyRow = reqs?.find(
                (r) => r.submitted_by_staff_id && r.submitted_by_staff_id !== s.id
              );
              const proxyStaff = proxyRow
                ? staff.find((x) => x.id === proxyRow.submitted_by_staff_id)
                : null;

              return (
                <tr
                  key={s.id}
                  className="hover:bg-[var(--accent-pale)] transition-colors cursor-pointer"
                  onClick={() => setDetail({ staff: s, reqs: reqs ?? [] })}
                  style={{
                    background: !isSubmitted ? 'var(--red-pale)' : 'transparent',
                  }}
                >
                  <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>
                    {s.name}
                    {proxyRow && (
                      <span
                        className="ml-2 text-xs font-semibold"
                        style={{
                          background: 'var(--gold-pale)',
                          color: 'var(--gold)',
                          border: '1px solid var(--gold)',
                          borderRadius: '4px',
                          padding: '1px 6px',
                        }}
                        title={proxyStaff ? `${proxyStaff.name} が代理入力` : '代理入力'}
                      >
                        代理
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {s.employment_type === 'full_time' ? '常勤' : 'パート'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant={isSubmitted ? 'success' : 'error'}>
                      {isSubmitted ? '提出済み' : '未提出'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--accent)' }}>
                    {getCount(reqs, 'public_holiday') || '-'}
                  </td>
                  <td className="px-3 py-2 text-center" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--green)' }}>
                    {getCount(reqs, 'paid_leave') || '-'}
                  </td>
                  <td className="px-3 py-2 text-center" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--gold)' }}>
                    {getCount(reqs, 'available_day') || '-'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', maxWidth: '150px' }}>
                    <span className="truncate block">{phRow?.notes ?? '-'}</span>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)' }}>
                    {phRow?.submitted_at ? new Date(phRow.submitted_at).toLocaleDateString('ja-JP') : '-'}
                  </td>
                  <td
                    className="px-3 py-2 text-center"
                    style={{ borderBottom: '1px solid var(--rule)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setProxyTarget({ staff: s, reqs: reqs ?? [] })}
                      className="text-xs font-medium transition-colors"
                      style={{
                        background: 'transparent',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        cursor: 'pointer',
                      }}
                      title="この職員の代理で希望を入力"
                    >
                      代理入力
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.staff.name} の休み希望` : ''}>
        {detail && (
          <div className="flex flex-col gap-4">
            {detail.reqs.length === 0 ? (
              <p style={{ color: 'var(--ink-3)' }}>提出されていません。</p>
            ) : (
              detail.reqs.map((r) => (
                <div
                  key={r.id}
                  className="p-3"
                  style={{ background: 'var(--bg)', borderRadius: '6px' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={r.request_type === 'public_holiday' ? 'info' : r.request_type === 'paid_leave' ? 'success' : 'warning'}>
                      {r.request_type === 'public_holiday' ? '公休' : r.request_type === 'paid_leave' ? '有給' : '出勤可'}
                    </Badge>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {r.dates.length} 日
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                    {r.dates.sort().join(', ')}
                  </p>
                  {r.notes && (
                    <p className="text-xs mt-2 p-2 rounded" style={{ background: 'var(--white)', color: 'var(--ink-2)' }}>
                      メモ: {r.notes}
                    </p>
                  )}
                </div>
              ))
            )}
            <Button variant="secondary" onClick={() => setDetail(null)}>閉じる</Button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!proxyTarget}
        onClose={() => {
          setProxyTarget(null);
          refetch();
        }}
        title={proxyTarget ? `${proxyTarget.staff.name} の休み希望（代理入力）` : ''}
        size="lg"
      >
        {proxyTarget && (
          <div className="flex flex-col gap-3">
            <MyRequestCalendar
              myStaffId={proxyTarget.staff.id}
              myStaffName={proxyTarget.staff.name}
              targetMonth={targetMonth}
              initialRequests={proxyTarget.reqs}
              onSubmitted={refetch}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setProxyTarget(null);
                refetch();
              }}
            >
              閉じる
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
