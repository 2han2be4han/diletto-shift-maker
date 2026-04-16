'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { getDaysInMonth, getDay, format } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * 休み希望フォーム
 * - 職員が翌月の休み希望・有給・出勤可能日を提出
 * - カレンダーUIで日付をクリックしてステータスを切り替え
 * - 申請種別: 公休希望 / 有給希望 / 出勤可能日
 * - 特記事項テキスト入力
 *
 * TODO: Supabase連携後にDB保存・ログインユーザー紐付け
 */

type DayStatus = 'none' | 'public_holiday' | 'paid_leave' | 'available_day';

const STATUS_CONFIG: Record<DayStatus, { label: string; color: string; bg: string }> = {
  none: { label: '', color: 'var(--ink-3)', bg: 'transparent' },
  public_holiday: { label: '公休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  paid_leave: { label: '有給', color: 'var(--green)', bg: 'var(--green-pale)' },
  available_day: { label: '出勤可', color: 'var(--gold)', bg: 'var(--gold-pale)' },
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function RequestPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* 対象月（翌月） */
  const now = new Date();
  const targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const targetMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;

  const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus>>({});
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  /* カレンダーのデータ生成 */
  const calendarData = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(targetYear, targetMonth - 1));
    const firstDow = getDay(new Date(targetYear, targetMonth - 1, 1));
    const days: { day: number; dateStr: string; dow: number }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(targetYear, targetMonth - 1, d);
      days.push({
        day: d,
        dateStr: format(dateObj, 'yyyy-MM-dd'),
        dow: getDay(dateObj),
      });
    }

    return { daysInMonth, firstDow, days };
  }, [targetYear, targetMonth]);

  /* 日付クリック → ステータスを順にトグル */
  const handleDayClick = (dateStr: string) => {
    if (submitted) return;
    const current = dayStatuses[dateStr] || 'none';
    const cycle: DayStatus[] = ['none', 'public_holiday', 'paid_leave', 'available_day'];
    const nextIndex = (cycle.indexOf(current) + 1) % cycle.length;
    setDayStatuses((prev) => ({ ...prev, [dateStr]: cycle[nextIndex] }));
  };

  /* 集計 */
  const counts = useMemo(() => {
    const c = { public_holiday: 0, paid_leave: 0, available_day: 0 };
    Object.values(dayStatuses).forEach((s) => {
      if (s !== 'none') c[s]++;
    });
    return c;
  }, [dayStatuses]);

  const handleSubmit = () => {
    // TODO: Supabase連携後にDB保存
    setSubmitted(true);
  };

  const handleReset = () => {
    setDayStatuses({});
    setNotes('');
    setSubmitted(false);
  };

  return (
    <>
      <Header
        title="休み希望"
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="p-6 max-w-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            {targetYear}年{targetMonth}月の休み希望
          </h2>
          {submitted && <Badge variant="success">提出済み</Badge>}
        </div>

        {/* 凡例 */}
        <div className="flex gap-4 mb-4 flex-wrap">
          {(['public_holiday', 'paid_leave', 'available_day'] as const).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded"
                style={{ background: STATUS_CONFIG[status].bg, border: `1px solid ${STATUS_CONFIG[status].color}` }}
              />
              <span className="text-xs font-medium" style={{ color: STATUS_CONFIG[status].color }}>
                {STATUS_CONFIG[status].label}
              </span>
            </div>
          ))}
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            日付をクリックで切り替え
          </span>
        </div>

        {/* カレンダー */}
        <div
          className="p-4 mb-4"
          style={{
            background: 'var(--white)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DOW_LABELS.map((dow, i) => (
              <div
                key={dow}
                className="text-center text-xs font-semibold py-1"
                style={{
                  color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--accent)' : 'var(--ink-3)',
                }}
              >
                {dow}
              </div>
            ))}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-1">
            {/* 月初の空白 */}
            {Array.from({ length: calendarData.firstDow }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {calendarData.days.map((d) => {
              const status = dayStatuses[d.dateStr] || 'none';
              const config = STATUS_CONFIG[status];
              const isWeekend = d.dow === 0 || d.dow === 6;

              return (
                <button
                  key={d.dateStr}
                  onClick={() => handleDayClick(d.dateStr)}
                  disabled={submitted}
                  className="flex flex-col items-center justify-center py-2 rounded-md transition-all hover:scale-105 disabled:hover:scale-100 disabled:cursor-default"
                  style={{
                    background: status !== 'none' ? config.bg : isWeekend ? 'rgba(0,0,0,0.02)' : 'transparent',
                    border: status !== 'none' ? `1.5px solid ${config.color}` : '1.5px solid transparent',
                    minHeight: '56px',
                  }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: d.dow === 0 ? 'var(--red)' : d.dow === 6 ? 'var(--accent)' : 'var(--ink)',
                    }}
                  >
                    {d.day}
                  </span>
                  {status !== 'none' && (
                    <span
                      className="text-xs font-bold mt-0.5"
                      style={{ color: config.color, fontSize: '0.65rem' }}
                    >
                      {config.label}
                    </span>
                  )}
                </button>
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
          <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            特記事項
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitted}
            placeholder="連続休みの希望、特定の曜日の希望など自由に記入してください"
            rows={3}
            className="w-full px-3 py-2 text-sm outline-none resize-none disabled:opacity-60"
            style={{
              background: 'var(--bg)',
              color: 'var(--ink)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
            }}
          />
        </div>

        {/* ボタン */}
        <div className="flex gap-2">
          {!submitted ? (
            <>
              <Button variant="secondary" onClick={handleReset}>
                リセット
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={Object.values(dayStatuses).filter((s) => s !== 'none').length === 0}
              >
                提出する
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={handleReset}>
              修正する
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
