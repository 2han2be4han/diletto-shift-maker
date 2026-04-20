'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { format, getDay, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { ShiftRequestRow, ShiftRequestType, ShiftRequestCommentRow } from '@/types';
import { isJpHoliday, jpHolidayName } from '@/lib/date/holidays';

/**
 * 自分の休み希望カレンダー（Phase 36 拡張）
 * - 各日に status を設定: none / public_holiday / paid_leave / full_day_available / am_off / pm_off / comment
 * - コメントは他選択肢と排他、shift_request_comments テーブルに per-date で保存
 * - ポップオーバーは画面端を超える場合は上向きに反転
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

const SELECTABLE_STATUSES: Exclude<DayStatus, 'none' | 'comment'>[] = [
  'public_holiday',
  'paid_leave',
  'full_day_available',
  'am_off',
  'pm_off',
];

const STATUS_CONFIG: Record<
  Exclude<DayStatus, 'none'>,
  { label: string; color: string; bg: string }
> = {
  public_holiday: { label: '公休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  paid_leave: { label: '有給', color: 'var(--green)', bg: 'var(--green-pale)' },
  full_day_available: { label: '1日出勤可', color: 'var(--gold)', bg: 'var(--gold-pale)' },
  am_off: { label: 'AM休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  pm_off: { label: 'PM休', color: 'var(--accent)', bg: 'var(--accent-pale)' },
  comment: { label: 'コメント', color: 'var(--red)', bg: 'var(--red-pale)' },
};

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function MyRequestCalendar({
  myStaffId,
  myStaffName,
  targetMonth,
  initialRequests,
  onSubmitted,
}: Props) {
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
    const all = initialRequests
      .map((r) => r.notes)
      .filter(Boolean)
      .join(' / ');
    return all;
  }, [initialRequests]);

  const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus>>(initialStatuses);
  /* 日付ごとのコメント本文。status='comment' の日のみ意味を持つ。 */
  const [dayComments, setDayComments] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(initialNotes);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /* Phase 36: 既存コメントの初期 fetch（自分 or 代理対象の月分） */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/shift-request-comments?month=${targetMonth}`);
        if (!res.ok) return;
        const { comments } = (await res.json()) as { comments: ShiftRequestCommentRow[] };
        if (cancelled) return;
        const map: Record<string, string> = {};
        const statusMap: Record<string, DayStatus> = {};
        for (const c of comments ?? []) {
          if (c.staff_id !== myStaffId) continue;
          map[c.date] = c.comment_text;
          statusMap[c.date] = 'comment';
        }
        setDayComments(map);
        /* コメントがある日付は status='comment' で上書き（DB の shift_requests 側に
           誤って 'public_holiday' 等が残っていてもコメント優先にする） */
        if (Object.keys(statusMap).length > 0) {
          setDayStatuses((prev) => ({ ...prev, ...statusMap }));
        }
      } catch {
        /* サイレント */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetMonth, myStaffId]);

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
    const c = {
      public_holiday: 0,
      paid_leave: 0,
      full_day_available: 0,
      am_off: 0,
      pm_off: 0,
      comment: 0,
    } as Record<Exclude<DayStatus, 'none'>, number>;
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
    /* 'comment' 以外を選んだらコメント本文をクリア（排他制約） */
    if (status !== 'comment') {
      setDayComments((prev) => {
        if (!(date in prev)) return prev;
        const next = { ...prev };
        delete next[date];
        return next;
      });
    }
  };

  const setComment = (date: string, text: string) => {
    setDayComments((prev) => ({ ...prev, [date]: text }));
    setDayStatuses((prev) => ({ ...prev, [date]: 'comment' }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      /* shift_requests: 5 種類の request_type ごとに dates 配列を構築して個別に upsert */
      const byType: Record<Exclude<DayStatus, 'none' | 'comment'>, string[]> = {
        public_holiday: [],
        paid_leave: [],
        full_day_available: [],
        am_off: [],
        pm_off: [],
      };
      const commentDates: string[] = [];
      for (const [date, status] of Object.entries(dayStatuses)) {
        if (status === 'none') continue;
        if (status === 'comment') commentDates.push(date);
        else byType[status].push(date);
      }

      for (const type of SELECTABLE_STATUSES) {
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

      /* shift_request_comments: 個別 upsert / 解除 */
      for (const date of commentDates) {
        const text = dayComments[date] ?? '';
        await fetch('/api/shift-request-comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: myStaffId,
            month: targetMonth,
            date,
            comment_text: text,
          }),
        });
      }

      /* dayStatuses から外れた日（=指定なし）かつ DB にコメントが残っている可能性があるものは
         明示的に空文字 POST で削除しておく。 */
      const allDatesWithStatus = new Set(Object.keys(dayStatuses));
      for (const date of Object.keys(dayComments)) {
        if (!allDatesWithStatus.has(date) || dayStatuses[date] !== 'comment') {
          await fetch('/api/shift-request-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              staff_id: myStaffId,
              month: targetMonth,
              date,
              comment_text: '',
            }),
          });
        }
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
    <div className="w-full">
      <p className="text-sm mb-3" style={{ color: 'var(--ink-2)' }}>
        {myStaffName}さん、日付をタップして希望を選択してください。
      </p>

      <div className="flex gap-3 mb-4 flex-wrap">
        {(['public_holiday', 'paid_leave', 'full_day_available', 'am_off', 'pm_off', 'comment'] as const).map(
          (status) => (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded"
                style={{ background: STATUS_CONFIG[status].bg, border: `1px solid ${STATUS_CONFIG[status].color}` }}
              />
              <span className="text-xs font-medium" style={{ color: STATUS_CONFIG[status].color }}>
                {STATUS_CONFIG[status].label}
              </span>
            </div>
          ),
        )}
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
            /* Phase 58: 祝日も赤扱い */
            const holiday = isJpHoliday(d.dateStr);
            const holidayName = holiday ? jpHolidayName(d.dateStr) : null;
            const numberColor =
              holiday || d.dow === 0 ? 'var(--red)' : d.dow === 6 ? 'var(--accent)' : 'var(--ink)';

            /* AM休/PM休 は半月色塗りで視覚区別 */
            let cellBg: string | undefined;
            if (status === 'am_off') {
              cellBg = `linear-gradient(to bottom, ${STATUS_CONFIG.am_off.bg} 0 50%, transparent 50% 100%)`;
            } else if (status === 'pm_off') {
              cellBg = `linear-gradient(to bottom, transparent 0 50%, ${STATUS_CONFIG.pm_off.bg} 50% 100%)`;
            } else if (config) {
              cellBg = config.bg;
            } else if (holiday || isWeekend) {
              cellBg = 'rgba(0,0,0,0.02)';
            }

            return (
              <div key={d.dateStr} className="relative">
                <button
                  onClick={() => setEditingDay(isEditing ? null : d.dateStr)}
                  className="w-full flex flex-col items-center justify-center py-2 rounded-md transition-all active:scale-95"
                  style={{
                    background: cellBg,
                    border: config ? `1.5px solid ${config.color}` : '1.5px solid transparent',
                    minHeight: '52px',
                  }}
                  title={holidayName ?? undefined}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: numberColor }}
                  >
                    {d.day}
                  </span>
                  {config && (
                    <span className="text-xs font-bold mt-0.5" style={{ color: config.color, fontSize: '0.6rem' }}>
                      {status === 'comment' ? '⚠コメント' : config.label}
                    </span>
                  )}
                </button>

                {isEditing && (
                  <DayPopover
                    dateStr={d.dateStr}
                    currentStatus={status}
                    currentComment={dayComments[d.dateStr] ?? ''}
                    onPickStatus={(s) => {
                      setStatus(d.dateStr, s);
                      setEditingDay(null);
                    }}
                    onSaveComment={(text) => {
                      const trimmed = text.trim();
                      if (trimmed === '') {
                        /* 空のコメント = 解除（指定なしへ） */
                        setStatus(d.dateStr, 'none');
                      } else {
                        setComment(d.dateStr, trimmed);
                      }
                      setEditingDay(null);
                    }}
                    onClose={() => setEditingDay(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <Badge variant="info">公休 {counts.public_holiday}日</Badge>
        <Badge variant="success">有給 {counts.paid_leave}日</Badge>
        <Badge variant="warning">1日出勤可 {counts.full_day_available}日</Badge>
        <Badge variant="info">AM休 {counts.am_off}日</Badge>
        <Badge variant="info">PM休 {counts.pm_off}日</Badge>
        <Badge variant="error">コメント {counts.comment}日</Badge>
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

/* ===== Phase 36: 日付ポップオーバー（位置を viewport 端で反転） ===== */
function DayPopover({
  dateStr,
  currentStatus,
  currentComment,
  onPickStatus,
  onSaveComment,
  onClose,
}: {
  dateStr: string;
  currentStatus: DayStatus;
  currentComment: string;
  onPickStatus: (s: DayStatus) => void;
  onSaveComment: (text: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [horizontalShift, setHorizontalShift] = useState(0);
  const [commentText, setCommentText] = useState(currentComment);

  /* マウント後 / リサイズ時に viewport を計算して上下反転・横ずらしを決める */
  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    /* 下に出して画面下からはみ出るなら上向きに反転 */
    if (rect.bottom > vh - 8 && rect.top - rect.height > 8) {
      setPlacement('above');
    } else {
      setPlacement('below');
    }

    /* 横方向: viewport 右端/左端を超えたら shift */
    let shift = 0;
    if (rect.right > vw - 8) shift = vw - 8 - rect.right;
    else if (rect.left < 8) shift = 8 - rect.left;
    setHorizontalShift(shift);
  }, []);

  useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [recompute]);

  /* クリック外しで close */
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    };
    /* setTimeout で当該ターンのトリガークリックを除外 */
    const t = setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 30,
    left: '50%',
    transform: `translateX(calc(-50% + ${horizontalShift}px))`,
    background: 'var(--white)',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    border: '1px solid var(--rule)',
    padding: '12px',
    width: '200px',
    ...(placement === 'below' ? { top: '100%', marginTop: '4px' } : { bottom: '100%', marginBottom: '4px' }),
  };

  const isCommentMode = currentStatus === 'comment' || commentText.trim() !== '';

  return (
    <div ref={ref} style={positionStyle} className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
        {format(new Date(dateStr), 'M/d（E）', { locale: ja })}
      </div>

      {/* 6 種ステータスボタン（コメント有り時はグレーアウト） */}
      <div className="flex flex-col gap-1">
        {(['none', ...SELECTABLE_STATUSES] as const).map((s) => {
          const cfg = s === 'none' ? null : STATUS_CONFIG[s];
          const isSelected = currentStatus === s;
          const disabled = isCommentMode && s !== 'none';
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (s === 'none') setCommentText('');
                onPickStatus(s);
              }}
              className="text-left px-2 py-1 text-xs font-medium rounded"
              style={{
                background: isSelected ? (cfg ? cfg.bg : 'var(--bg)') : 'transparent',
                color: cfg ? cfg.color : 'var(--ink-3)',
                border: isSelected
                  ? `1px solid ${cfg ? cfg.color : 'var(--rule)'}`
                  : '1px solid transparent',
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              title={disabled ? 'コメント入力中は他の選択肢を選べません' : undefined}
            >
              {s === 'none' ? '指定なし' : cfg!.label}
            </button>
          );
        })}
      </div>

      {/* 区切り */}
      <div style={{ borderTop: '1px dashed var(--rule)', margin: '4px 0' }} />

      {/* コメント入力 */}
      <label className="text-xs font-semibold" style={{ color: 'var(--red)' }}>
        ⚠ コメント（他選択肢と排他）
      </label>
      <textarea
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="例: パステル応援、管理者会議、研修"
        rows={2}
        className="w-full px-2 py-1 text-xs outline-none resize-none"
        style={{ border: '1px solid var(--rule)', borderRadius: '4px' }}
      />
      <button
        type="button"
        onClick={() => onSaveComment(commentText)}
        className="text-xs font-semibold px-2 py-1 rounded"
        style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        保存して閉じる
      </button>
    </div>
  );
}
