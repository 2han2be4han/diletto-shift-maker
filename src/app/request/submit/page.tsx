'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { getDaysInMonth, getDay, format } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * 休み希望提出ページ（職員向け・ログイン不要）
 *
 * URL: /request/submit?staff=xxx
 * - staffパラメータで職員を識別
 * - ログイン不要の公開URL（LINEやメールで共有）
 * - カレンダーUIで希望休・有給・出勤可能日を選択→提出
 *
 * TODO: Supabase連携後にDB保存・staff IDバリデーション
 */

type DayStatus = 'none' | 'public_holiday' | 'paid_leave' | 'available_day';

const STATUS_CONFIG: Record<DayStatus, { label: string; color: string; bg: string }> = {
  none: { label: '', color: 'var(--ink-3)', bg: 'transparent' },
  public_holiday: { label: '公休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  paid_leave: { label: '有給', color: 'var(--green)', bg: 'var(--green-pale)' },
  available_day: { label: '出勤可', color: 'var(--gold)', bg: 'var(--gold-pale)' },
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/* 仮の職員名マップ（Supabase連携後はDBから取得） */
const STAFF_NAMES: Record<string, string> = {
  s1: '金田', s2: '加藤', s3: '鈴木', s4: '田中', s5: '佐藤', s6: '山本',
};

export default function SubmitRequestPage() {
  const searchParams = useSearchParams();
  const staffId = searchParams.get('staff');
  const staffName = staffId ? STAFF_NAMES[staffId] || '不明な職員' : null;

  const now = new Date();
  const targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const targetMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;

  const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus>>({});
  const [dayComments, setDayComments] = useState<Record<string, string>>({});
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const calendarData = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(targetYear, targetMonth - 1));
    const firstDow = getDay(new Date(targetYear, targetMonth - 1, 1));
    const days: { day: number; dateStr: string; dow: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(targetYear, targetMonth - 1, d);
      days.push({ day: d, dateStr: format(dateObj, 'yyyy-MM-dd'), dow: getDay(dateObj) });
    }
    return { firstDow, days };
  }, [targetYear, targetMonth]);

  const handleDayClick = (dateStr: string) => {
    if (submitted) return;
    setEditingDay(editingDay === dateStr ? null : dateStr);
  };

  const handleStatusChange = (dateStr: string, status: DayStatus) => {
    setDayStatuses((prev) => ({ ...prev, [dateStr]: status }));
  };

  const handleCommentChange = (dateStr: string, comment: string) => {
    setDayComments((prev) => ({ ...prev, [dateStr]: comment }));
  };

  const counts = useMemo(() => {
    const c = { public_holiday: 0, paid_leave: 0, available_day: 0 };
    Object.values(dayStatuses).forEach((s) => { if (s !== 'none') c[s]++; });
    return c;
  }, [dayStatuses]);

  const handleSubmit = () => {
    // TODO: Supabase連携後にDB保存
    setSubmitted(true);
  };

  /* staffパラメータが無い場合 */
  if (!staffId || !staffName) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center p-8" style={{ background: 'var(--white)', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <p className="text-lg font-bold mb-2" style={{ color: 'var(--red)' }}>無効なリンクです</p>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>管理者から正しい提出用URLを受け取ってください。</p>
        </div>
      </div>
    );
  }

  /* 提出完了画面 */
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center p-8 max-w-sm" style={{ background: 'var(--white)', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div className="text-4xl mb-4">✅</div>
          <p className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>提出完了！</p>
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
            {staffName}さんの{targetYear}年{targetMonth}月の休み希望を受け付けました。
          </p>
          <div className="flex gap-3 justify-center mb-4">
            <Badge variant="info">公休 {counts.public_holiday}日</Badge>
            <Badge variant="success">有給 {counts.paid_leave}日</Badge>
            <Badge variant="warning">出勤可 {counts.available_day}日</Badge>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            締切日までは何度でも再提出できます。
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => setSubmitted(false)}
          >
            修正する
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ヘッダー（dilettoブランド） */}
      <header
        className="flex items-center justify-between px-6 py-3"
        style={{ background: 'var(--white)', borderBottom: '1px solid var(--rule)' }}
      >
        <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ink)' }}>
          di<em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>letto</em>
          {' '}
          <span style={{ fontSize: '0.6em', fontWeight: 600 }}>ShiftPuzzle</span>
        </span>
        <Badge variant="info">{staffName}</Badge>
      </header>

      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>
          {targetYear}年{targetMonth}月の休み希望
        </h1>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
          {staffName}さん、日付をタップして希望を選択してください。
        </p>

        {/* 凡例 */}
        <div className="flex gap-3 mb-4 flex-wrap">
          {(['public_holiday', 'paid_leave', 'available_day'] as const).map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: STATUS_CONFIG[status].bg, border: `1px solid ${STATUS_CONFIG[status].color}` }} />
              <span className="text-xs font-medium" style={{ color: STATUS_CONFIG[status].color }}>{STATUS_CONFIG[status].label}</span>
            </div>
          ))}
        </div>

        {/* カレンダー */}
        <div className="p-4 mb-4" style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DOW_LABELS.map((dow, i) => (
              <div key={dow} className="text-center text-xs font-semibold py-1" style={{ color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--accent)' : 'var(--ink-3)' }}>
                {dow}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarData.firstDow }).map((_, i) => <div key={`e-${i}`} />)}
            {calendarData.days.map((d) => {
              const status = dayStatuses[d.dateStr] || 'none';
              const config = STATUS_CONFIG[status];
              const comment = dayComments[d.dateStr] || '';
              const isEditing = editingDay === d.dateStr;
              const isWeekend = d.dow === 0 || d.dow === 6;

              return (
                <div key={d.dateStr} className="relative">
                  <button
                    onClick={() => handleDayClick(d.dateStr)}
                    className="w-full flex flex-col items-center justify-center py-2 rounded-md transition-all active:scale-95"
                    style={{
                      background: status !== 'none' ? config.bg : isWeekend ? 'rgba(0,0,0,0.02)' : 'transparent',
                      border: status !== 'none' ? `1.5px solid ${config.color}` : '1.5px solid transparent',
                      minHeight: '52px',
                    }}
                  >
                    <span className="text-sm font-semibold" style={{ color: d.dow === 0 ? 'var(--red)' : d.dow === 6 ? 'var(--accent)' : 'var(--ink)' }}>
                      {d.day}
                    </span>
                    {status !== 'none' && (
                      <span className="text-xs font-bold mt-0.5" style={{ color: config.color, fontSize: '0.6rem' }}>{config.label}</span>
                    )}
                    {comment && <span style={{ fontSize: '0.55rem' }}>💬</span>}
                  </button>

                  {isEditing && (
                    <div
                      className="absolute z-20 left-1/2 -translate-x-1/2 mt-1 p-3 flex flex-col gap-2 w-44"
                      style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--rule)' }}
                    >
                      <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                        {format(new Date(d.dateStr), 'M/d（E）', { locale: ja })}
                      </div>
                      <div className="flex flex-col gap-1">
                        {(['none', 'public_holiday', 'paid_leave', 'available_day'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(d.dateStr, s); }}
                            className="text-left px-2 py-1 text-xs font-medium rounded"
                            style={{
                              background: status === s ? (s === 'none' ? 'var(--bg)' : STATUS_CONFIG[s].bg) : 'transparent',
                              color: s === 'none' ? 'var(--ink-3)' : STATUS_CONFIG[s].color,
                              border: status === s ? `1px solid ${s === 'none' ? 'var(--rule)' : STATUS_CONFIG[s].color}` : '1px solid transparent',
                            }}
                          >
                            {s === 'none' ? '指定なし' : STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={comment}
                        onChange={(e) => handleCommentChange(d.dateStr, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="メモ（任意）"
                        className="w-full px-2 py-1 text-xs outline-none"
                        style={{ border: '1px solid var(--rule)', borderRadius: '4px', color: 'var(--ink)' }}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingDay(null); }}
                        className="text-xs font-semibold py-1 rounded"
                        style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px' }}
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 集計 */}
        <div className="flex gap-3 mb-4">
          <Badge variant="info">公休 {counts.public_holiday}日</Badge>
          <Badge variant="success">有給 {counts.paid_leave}日</Badge>
          <Badge variant="warning">出勤可 {counts.available_day}日</Badge>
        </div>

        {/* 特記事項 */}
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

        <Button
          variant="primary"
          className="w-full"
          onClick={handleSubmit}
          disabled={Object.values(dayStatuses).filter((s) => s !== 'none').length === 0}
        >
          提出する
        </Button>
      </div>
    </div>
  );
}
