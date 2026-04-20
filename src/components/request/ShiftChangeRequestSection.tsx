'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type {
  ShiftAssignmentType,
  ShiftChangeRequestRow,
  ShiftChangeRequestStatus,
  ShiftChangeRequestType,
} from '@/types';

const TYPE_LABELS: Record<ShiftChangeRequestType, string> = {
  time: '時刻変更',
  leave: '休暇申請',
  type_change: '種別変更',
};

const STATUS_LABELS: Record<ShiftChangeRequestStatus, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
  cancelled: '取下げ',
};

const STATUS_VARIANT: Record<
  ShiftChangeRequestStatus,
  'info' | 'success' | 'error' | 'neutral'
> = {
  pending: 'info',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral',
};

const ASSIGNMENT_TYPE_LABELS: Record<ShiftAssignmentType, string> = {
  normal: '出勤',
  public_holiday: '公休',
  paid_leave: '有給',
  off: '休み',
};

type Props = {
  myStaffId: string;
};

export default function ShiftChangeRequestSection({ myStaffId }: Props) {
  const [requests, setRequests] = useState<ShiftChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* フォーム state */
  const [targetDate, setTargetDate] = useState('');
  const [changeType, setChangeType] = useState<ShiftChangeRequestType>('time');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [assignmentType, setAssignmentType] = useState<ShiftAssignmentType>('paid_leave');
  const [reason, setReason] = useState('');

  const fetchMine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-change-requests?staff_id=${myStaffId}`);
      if (!res.ok) throw new Error('取得失敗');
      const { requests: rs } = await res.json();
      setRequests(rs as ShiftChangeRequestRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [myStaffId]);

  useEffect(() => {
    void fetchMine();
  }, [fetchMine]);

  const handleSubmit = async () => {
    if (!targetDate) {
      alert('対象日を指定してください');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload =
        changeType === 'time'
          ? { start_time: startTime, end_time: endTime }
          : {
              assignment_type: assignmentType,
              start_time: changeType === 'type_change' ? startTime : null,
              end_time: changeType === 'type_change' ? endTime : null,
            };

      const res = await fetch('/api/shift-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_date: targetDate,
          change_type: changeType,
          requested_payload: payload,
          reason: reason || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '申請失敗');
      setTargetDate('');
      setReason('');
      await fetchMine();
    } catch (e) {
      setError(e instanceof Error ? e.message : '申請失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('この申請を取り下げますか？')) return;
    try {
      const res = await fetch(`/api/shift-change-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '取下げ失敗');
      await fetchMine();
    } catch (e) {
      alert(e instanceof Error ? e.message : '取下げ失敗');
    }
  };

  return (
    <div
      className="p-4 rounded"
      style={{ background: 'var(--white)', border: '1px solid var(--rule)' }}
    >
      <h3 className="text-md font-bold mb-3" style={{ color: 'var(--ink)' }}>
        シフト変更申請
      </h3>

      {/* 申請フォーム */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            対象日
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="px-2 py-1 rounded text-sm"
            style={{ border: '1px solid var(--rule)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            変更種類
          </label>
          <select
            value={changeType}
            onChange={(e) => setChangeType(e.target.value as ShiftChangeRequestType)}
            className="px-2 py-1 rounded text-sm"
            style={{ border: '1px solid var(--rule)' }}
          >
            <option value="time">時刻変更</option>
            <option value="leave">休暇申請</option>
            <option value="type_change">種別＋時刻変更</option>
          </select>
        </div>

        {changeType === 'time' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                希望開始時刻
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="px-2 py-1 rounded text-sm"
                style={{ border: '1px solid var(--rule)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                希望終了時刻
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="px-2 py-1 rounded text-sm"
                style={{ border: '1px solid var(--rule)' }}
              />
            </div>
          </>
        )}

        {(changeType === 'leave' || changeType === 'type_change') && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
              勤務種別
            </label>
            <select
              value={assignmentType}
              onChange={(e) => setAssignmentType(e.target.value as ShiftAssignmentType)}
              className="px-2 py-1 rounded text-sm"
              style={{ border: '1px solid var(--rule)' }}
            >
              <option value="normal">出勤</option>
              <option value="public_holiday">公休</option>
              <option value="paid_leave">有給</option>
              <option value="off">休み</option>
            </select>
          </div>
        )}

        {changeType === 'type_change' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                希望開始時刻
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="px-2 py-1 rounded text-sm"
                style={{ border: '1px solid var(--rule)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                希望終了時刻
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="px-2 py-1 rounded text-sm"
                style={{ border: '1px solid var(--rule)' }}
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            理由（任意）
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 家族の通院付き添いのため"
            className="px-2 py-1 rounded text-sm"
            style={{ border: '1px solid var(--rule)' }}
          />
        </div>
      </div>

      {error && (
        <div
          className="mb-2 px-3 py-2 rounded text-sm"
          style={{ background: 'var(--red-pale)', color: 'var(--red)' }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '送信中...' : '申請を送信'}
        </Button>
      </div>

      {/* 自分の申請一覧 */}
      <div>
        <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--ink-2)' }}>
          あなたの申請
        </h4>
        {loading ? (
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
        ) : requests.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            申請はまだありません
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="p-2 rounded text-sm flex items-center justify-between gap-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--rule)' }}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">
                      {format(new Date(r.target_date), 'M月d日(E)', { locale: ja })}
                    </span>
                    <Badge variant="neutral">{TYPE_LABELS[r.change_type]}</Badge>
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    {r.change_type === 'time' && 'start_time' in r.requested_payload && (
                      <>
                        {r.requested_payload.start_time}〜{r.requested_payload.end_time}
                      </>
                    )}
                    {r.change_type !== 'time' && 'assignment_type' in r.requested_payload && (
                      <>
                        {ASSIGNMENT_TYPE_LABELS[r.requested_payload.assignment_type]}
                        {r.requested_payload.start_time &&
                          ` / ${r.requested_payload.start_time}〜${r.requested_payload.end_time}`}
                      </>
                    )}
                    {r.reason && <> — {r.reason}</>}
                  </div>
                  {r.admin_note && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      管理者メモ: {r.admin_note}
                    </div>
                  )}
                </div>
                {r.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleCancel(r.id)}
                    className="text-xs underline"
                    style={{ color: 'var(--red)' }}
                  >
                    取下げ
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
