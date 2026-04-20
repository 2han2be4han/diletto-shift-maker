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

/* Phase 36: 拡張された ShiftRequestType の表示ヘルパー */
function labelOf(t: ShiftRequestRow['request_type']): string {
  switch (t) {
    case 'public_holiday': return '公休';
    case 'paid_leave': return '有給';
    case 'full_day_available': return '1日出勤可';
    case 'am_off': return 'AM休';
    case 'pm_off': return 'PM休';
    case 'comment': return 'コメント';
  }
}
function badgeVariantOf(t: ShiftRequestRow['request_type']): 'info' | 'success' | 'warning' | 'error' {
  switch (t) {
    case 'public_holiday': return 'info';
    case 'paid_leave': return 'success';
    case 'full_day_available': return 'warning';
    case 'am_off': return 'info';
    case 'pm_off': return 'info';
    case 'comment': return 'error';
  }
}

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
      {/* Phase 47: 休み希望一覧の印刷 CSS。A4 縦、ヘッダー・代理入力ボタン非表示 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              .request-print-title { display: block !important; font-size: 14pt; font-weight: 700; margin-bottom: 6mm; }
              table { font-size: 9pt !important; }
              th, td { padding: 3px 4px !important; }
              tr:hover { background: inherit !important; }
            }
            @media screen { .request-print-title { display: none; } }
          `,
        }}
      />
      <h1 className="request-print-title print-only">{targetMonth} 休み希望一覧</h1>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Badge variant="success">提出 {submittedCount}名</Badge>
        <Badge variant="error">未提出 {notSubmittedCount}名</Badge>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>対象月 {targetMonth}</span>
        {/* Phase 58-fix: 印刷ボタンは Header に移動 */}
      </div>

      <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
        <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {['職員名', '雇用', 'ステータス', '公休', '有給', '出勤可', '特記', '提出日', '代理入力'].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-left font-semibold whitespace-nowrap${h === '代理入力' ? ' print-hide' : ''}`}
                  style={{ background: 'var(--ink)', color: '#fff' }}
                >
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
                    {getCount(reqs, 'full_day_available') || '-'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', maxWidth: '150px' }}>
                    <span className="truncate block">{phRow?.notes ?? '-'}</span>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)' }}>
                    {phRow?.submitted_at ? new Date(phRow.submitted_at).toLocaleDateString('ja-JP') : '-'}
                  </td>
                  <td
                    className="px-3 py-2 text-center print-hide"
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
                    <Badge variant={badgeVariantOf(r.request_type)}>
                      {labelOf(r.request_type)}
                    </Badge>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {r.dates.length} 日
                    </span>
                  </div>
                  <DateRangeChips dates={r.dates} />
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
        /* Phase 58-fix: MyRequestCalendar 内部の max-w-lg に合わせて size=md。
           以前は size=lg で枠だけ広く中身が左寄せの違和感が出ていた。 */
        size="md"
      >
        {proxyTarget && (
          /* Phase 58-fix: Modal size=md (max-w-lg) に合わせて w-full のみ。
             max-w-lg は冗長なので削除。「閉じる」もモーダル幅いっぱいで揃う。 */
          <div className="flex flex-col gap-3 w-full">
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

/* Phase 37: 日付配列を「連続範囲＋曜日付き chip」で見やすく整形
 *  例: ["2026-04-20","2026-04-21","2026-04-22","2026-04-23","2026-04-27","2026-04-28","2026-04-30"]
 *      → "4/20(月)-4/23(木)" "4/27(月)-4/28(火)" "4/30(木)" の 3 チップに
 */
function DateRangeChips({ dates }: { dates: string[] }) {
  if (!dates || dates.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--ink-3)' }}>(なし)</p>;
  }
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const fmt = (d: string) => {
    const [, m, day] = d.split('-').map(Number);
    const dt = new Date(d);
    return `${m}/${day}(${DOW[dt.getDay()]})`;
  };
  /* 連続日をグループ化 (前日 +1 でない場合に新グループ開始) */
  const sorted = [...dates].sort();
  const groups: string[][] = [];
  for (const d of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const prev = new Date(last[last.length - 1]);
      const cur = new Date(d);
      const diff = (cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);
      if (diff === 1) {
        last.push(d);
        continue;
      }
    }
    groups.push([d]);
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {groups.map((g) => {
        const text = g.length === 1 ? fmt(g[0]) : `${fmt(g[0])} 〜 ${fmt(g[g.length - 1])}`;
        return (
          <span
            key={g[0]}
            className="text-xs font-medium px-2 py-1 rounded"
            style={{
              background: 'var(--white)',
              border: '1px solid var(--rule)',
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
