'use client';

import { useState, useMemo } from 'react';
import { format, getDay, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { ShiftRequestRow, ShiftRequestType } from '@/types';

/**
 * 自分の休み希望カレンダー
 * - ユーザーが自分の shift_requests を編集・提出
 * - 各日に status (none/public_holiday/paid_leave/available_day) を設定
 * - 提出すると3種類の shift_requests (request_type別) を upsert
 */

type Props = {
  myStaffId: string;
  myStaffName: string;
  targetMonth: string; // 'YYYY-MM'
  initialRequests: ShiftRequestRow[];
  /** Phase 25: 提出成功時に呼ばれる（AdminRequestList の代理入力後の再取得に使う） */
  onSubmitted?: () => void;
};

type DayStatus = 'none' | ShiftRequestType;

const STATUS_CONFIG: Record<Exclude<DayStatus, 'none'>, { label: string; color: string; bg: string }> = {
  public_holiday: { label: '公休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  paid_leave: { label: '有給', color: 'var(--green)', bg: 'var(--green-pale)' },
  available_day: { label: '出勤可', color: 'var(--gold)', bg: 'var(--gold-pale)' },
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function MyRequestCalendar({ myStaffId, myStaffName, targetMonth, initialRequests, onSubmitted }: Props) {
  const [year, monthNum] = targetMonth.split('-').map(Number);

  /* initialRequests から dayStatuses を構築 */
  const initialStatuses = useMemo(() => {
    const map: Record<string, DayStatus> = {};
    for (const r of initialRequests) {
      for (const d of r.dates) map[d] = r.request_type;
    }
    return map;
  }, [initialRequests]);

  const initialNotes = useMemo(() => {
    const all = initialRequests.map((r) => r.notes).filter(Boolean).join(' / ');
    return all;
  }, [initialRequests]);

  const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus>>(initialStatuses);
  const [notes, setNotes] = useState(initialNotes);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const days = useMemo(() => {
    const total = getDaysInMonth(new Date(year, monthNum - 1));
    const firstDow = getDay(new Date(year, monthNum - 1, 1));
    const list = Array.from({ length: total }, (_, i) => {
      const d = i + 1;
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { day: d, dow: getDay(new Date(year, monthNum - 1, d)), dateStr };
    });
    return { days: list, firstDow };
  }, [year, monthNum]);

  const counts = useMemo(() => {
    const c = { public_holiday: 0, paid_leave: 0, available_day: 0 } as Record<Exclude<DayStatus, 'none'>, number>;
    for (const v of Object.values(dayStatuses)) if (v !== 'none') c[v]++;
    return c;
  }, [dayStatuses]);

  const setStatus = (date: string, status: DayStatus) => {
    setDayStatuses((prev) => {
      const next = { ...prev };
      if (status === 'none') delete next[date];
      else next[date] = status;
      return next;
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      /* 3種類の request_type ごとに dates 配列を構築して個別に upsert */
      const byType: Record<Exclude<DayStatus, 'none'>, string[]> = {
        public_holiday: [],
        paid_leave: [],
        available_day: [],
      };
      for (const [date, status] of Object.entries(dayStatuses)) {
        if (status !== 'none') byType[status].push(date);
      }

      for (const type of ['public_holiday', 'paid_leave', 'available_day'] as const) {
        const res = await fetch('/api/shift-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: myStaffId,
            month: targetMonth,
            request_type: type,
            dates: byType[type],
            notes: type === 'public_holiday' ? notes : null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '提出失敗');
      }
      setSavedAt(new Date().toLocaleTimeString('ja-JP'));
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提出に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <p className="text-sm mb-3" style={{ color: 'var(--ink-2)' }}>
        {myStaffName}さん、日付をタップして希望を選択してください。
      </p>

      <div className="flex gap-3 mb-4 flex-wrap">
        {(['public_holiday', 'paid_leave', 'available_day'] as const).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded"
              style={{ background: STATUS_CONFIG[status].bg, border: `1px solid ${STATUS_CONFIG[status].color}` }}
            />
            <span className="text-xs font-medium" style={{ color: STATUS_CONFIG[status].color }}>
              {STATUS_CONFIG[status].label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="p-4 mb-4"
        style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DOW_LABELS.map((dow, i) => (
            <div
              key={dow}
              className="text-center text-xs font-semibold py-1"
              style={{ color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--accent)' : 'var(--ink-3)' }}
            >
              {dow}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: days.firstDow }).map((_, i) => <div key={`e-${i}`} />)}
          {days.days.map((d) => {
            const status = dayStatuses[d.dateStr] ?? 'none';
            const config = status !== 'none' ? STATUS_CONFIG[status] : null;
            const isWeekend = d.dow === 0 || d.dow === 6;
            const isEditing = editingDay === d.dateStr;

            return (
              <div key={d.dateStr} className="relative">
                <button
                  onClick={() => setEditingDay(isEditing ? null : d.dateStr)}
                  className="w-full flex flex-col items-center justify-center py-2 rounded-md transition-all active:scale-95"
                  style={{
                    background: config ? config.bg : isWeekend ? 'rgba(0,0,0,0.02)' : 'transparent',
                    border: config ? `1.5px solid ${config.color}` : '1.5px solid transparent',
                    minHeight: '52px',
                  }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: d.dow === 0 ? 'var(--red)' : d.dow === 6 ? 'var(--accent)' : 'var(--ink)' }}
                  >
                    {d.day}
                  </span>
                  {config && (
                    <span className="text-xs font-bold mt-0.5" style={{ color: config.color, fontSize: '0.6rem' }}>
                      {config.label}
                    </span>
                  )}
                </button>

                {isEditing && (
                  <div
                    className="absolute z-20 left-1/2 -translate-x-1/2 mt-1 p-3 flex flex-col gap-2 w-40"
                    style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--rule)' }}
                  >
                    <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                      {format(new Date(d.dateStr), 'M/d（E）', { locale: ja })}
                    </div>
                    <div className="flex flex-col gap-1">
                      {(['none', 'public_holiday', 'paid_leave', 'available_day'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatus(d.dateStr, s);
                            setEditingDay(null);
                          }}
                          className="text-left px-2 py-1 text-xs font-medium rounded"
                          style={{
                            background:
                              status === s
                                ? s === 'none'
                                  ? 'var(--bg)'
                                  : STATUS_CONFIG[s].bg
                                : 'transparent',
                            color: s === 'none' ? 'var(--ink-3)' : STATUS_CONFIG[s].color,
                            border:
                              status === s
                                ? `1px solid ${s === 'none' ? 'var(--rule)' : STATUS_CONFIG[s].color}`
                                : '1px solid transparent',
                          }}
                        >
                          {s === 'none' ? '指定なし' : STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Badge variant="info">公休 {counts.public_holiday}日</Badge>
        <Badge variant="success">有給 {counts.paid_leave}日</Badge>
        <Badge variant="warning">出勤可 {counts.available_day}日</Badge>
      </div>

      <div className="flex flex-col gap-2 mb-6">
        <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>特記事項</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="連続休みの希望、特定の曜日の希望など"
          rows={3}
          className="w-full px-3 py-2 text-sm outline-none resize-none"
          style={{ background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--rule)', borderRadius: '6px' }}
        />
      </div>

      {error && (
        <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <Button variant="primary" className="w-full" onClick={handleSubmit} disabled={saving}>
        {saving ? '送信中...' : '提出する'}
      </Button>

      {savedAt && (
        <p className="text-center text-xs mt-3" style={{ color: 'var(--green)' }}>
          ✅ {savedAt} に保存しました。締切までは何度でも再提出できます。
        </p>
      )}
    </div>
  );
}
