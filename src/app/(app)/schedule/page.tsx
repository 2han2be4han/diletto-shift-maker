'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import ScheduleGrid from '@/components/schedule/ScheduleGrid';
import PdfImportModal from '@/components/schedule/PdfImportModal';
import ExcelPasteModal from '@/components/schedule/ExcelPasteModal';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { format, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import type {
  ParsedScheduleEntry,
  ChildRow,
  ChildTransportPatternRow,
  ScheduleEntryRow,
  AttendanceStatus,
  AttendanceAuditLogRow,
} from '@/types';
import { GRADE_LABELS } from '@/lib/utils/parseChildName';

/* Phase 25: 出欠ラベル */
const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  planned: '予定',
  present: '出席',
  absent: '欠席',
  late: '遅刻',
  early_leave: '早退',
};
const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  planned: 'var(--ink-3)',
  present: 'var(--green)',
  absent: 'var(--red)',
  late: 'var(--gold)',
  early_leave: 'var(--accent)',
};

/**
 * 利用予定ページ（Supabase接続版）
 * - children と schedule_entries を DB から取得
 * - セル編集でリアルタイム upsert
 * - PDF / Excel インポートで bulk upsert
 */

/* GRADE_LABELS は @/lib/utils/parseChildName で一元管理 */

type CellData = {
  entry_id: string | null;
  child_id: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  pickup_method: 'self' | 'pickup';
  dropoff_method: 'self' | 'dropoff';
  attendance_status: AttendanceStatus;
  note: string | null;
};

function ToggleGroup({
  options,
  value,
  onChange,
  accentColor = 'var(--accent)',
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  accentColor?: string;
}) {
  return (
    <div className="flex gap-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-4 py-2 text-sm font-semibold transition-all first:rounded-l-md last:rounded-r-md"
          style={{
            background: value === opt.value ? accentColor : 'var(--bg)',
            color: value === opt.value ? '#ffffff' : 'var(--ink-2)',
            border: `1px solid ${value === opt.value ? accentColor : 'var(--rule-strong)'}`,
            marginLeft: opt.value === options[0].value ? '0' : '-1px',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Phase 25: URL ?month=YYYY-MM を正。未指定時は来月 */
function defaultNextMonthStr(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export default function SchedulePage() {
  const searchParams = useSearchParams();
  const urlMonth = searchParams.get('month');
  const { year, month } = useMemo(() => {
    const source = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : defaultNextMonthStr();
    const [y, m] = source.split('-').map(Number);
    return { year: y, month: m };
  }, [urlMonth]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [patterns, setPatterns] = useState<ChildTransportPatternRow[]>([]);
  /* Phase 27-A-1: 過去の schedule_entries 全件から child_id→pattern_id 使用頻度を集計（最頻パターン初期選択用） */
  const [patternUsage, setPatternUsage] = useState<Map<string, string>>(new Map());
  const [cells, setCells] = useState<CellData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCell, setSelectedCell] = useState<{ childId: string; date: string } | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  const [attendance, setAttendance] = useState<'attend' | 'absent' | 'off'>('attend');
  /* Phase 25: 当日の出欠記録（DB永続） */
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('planned');
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceAuditLogRow[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [pickupHour, setPickupHour] = useState('13');
  const [pickupMin, setPickupMin] = useState('20');
  const [pickupMethod, setPickupMethod] = useState<'self' | 'pickup'>('pickup');
  const [dropoffHour, setDropoffHour] = useState('16');
  const [dropoffMin, setDropoffMin] = useState('00');
  const [dropoffMethod, setDropoffMethod] = useState<'self' | 'dropoff'>('dropoff');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = getDaysInMonth(new Date(year, month - 1));
      const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      /* Phase 27-A-1: patternUsage 計算用に過去12ヶ月分の entries も別途取得（表示には使わない） */
      const usageFrom = `${year - 1}-${String(month).padStart(2, '0')}-01`;
      const usageTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const [cRes, eRes, uRes] = await Promise.all([
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${from}&to=${to}`),
        fetch(`/api/schedule-entries?from=${usageFrom}&to=${usageTo}`),
      ]);

      if (!cRes.ok) throw new Error('児童の取得に失敗しました');
      if (!eRes.ok) throw new Error('利用予定の取得に失敗しました');

      const { children: ch, patterns: pt } = await cRes.json();
      const { entries } = await eRes.json();
      const uJson = uRes.ok ? await uRes.json() : { entries: [] };

      setChildren((ch as ChildRow[]).filter((c) => c.is_active));
      setPatterns((pt as ChildTransportPatternRow[]) ?? []);

      /* child_id ごとに pattern_id 使用回数を数え、最頻（同数なら最新）を初期候補に */
      const countByChild = new Map<string, Map<string, { count: number; latest: string }>>();
      for (const e of (uJson.entries as ScheduleEntryRow[] | undefined) ?? []) {
        if (!e.pattern_id) continue;
        const inner = countByChild.get(e.child_id) ?? new Map();
        const cur = inner.get(e.pattern_id) ?? { count: 0, latest: '' };
        inner.set(e.pattern_id, {
          count: cur.count + 1,
          latest: e.date > cur.latest ? e.date : cur.latest,
        });
        countByChild.set(e.child_id, inner);
      }
      const usage = new Map<string, string>();
      for (const [childId, inner] of countByChild) {
        let best: { patternId: string; count: number; latest: string } | null = null;
        for (const [pid, v] of inner) {
          if (!best || v.count > best.count || (v.count === best.count && v.latest > best.latest)) {
            best = { patternId: pid, count: v.count, latest: v.latest };
          }
        }
        if (best) usage.set(childId, best.patternId);
      }
      setPatternUsage(usage);
      setCells(
        (entries as ScheduleEntryRow[]).map<CellData>((e) => ({
          entry_id: e.id,
          child_id: e.child_id,
          date: e.date,
          pickup_time: e.pickup_time,
          dropoff_time: e.dropoff_time,
          /* Phase 24: DB に保存された method を尊重。旧データ(デフォルト) は pickup/dropoff になる */
          pickup_method: e.pickup_method === 'self' ? 'self' : 'pickup',
          dropoff_method: e.dropoff_method === 'self' ? 'self' : 'dropoff',
          attendance_status: e.attendance_status ?? 'planned',
          note: null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const childrenForGrid = children.map((c) => ({
    id: c.id,
    name: c.name,
    grade_label: GRADE_LABELS[c.grade_type],
  }));

  const handleCellClick = (childId: string, date: string) => {
    const cellData = cells.find((c) => c.child_id === childId && c.date === date);
    if (cellData?.pickup_time) {
      const [h, m] = cellData.pickup_time.split(':');
      setPickupHour(h); setPickupMin(m);
    } else {
      setPickupHour('13'); setPickupMin('00');
    }
    if (cellData?.dropoff_time) {
      const [h, m] = cellData.dropoff_time.split(':');
      setDropoffHour(h); setDropoffMin(m);
    } else {
      setDropoffHour('16'); setDropoffMin('00');
    }
    if (cellData && !cellData.pickup_time && !cellData.dropoff_time) {
      setAttendance('off');
    } else if (cellData?.pickup_time) {
      setAttendance('attend');
    } else {
      setAttendance('absent');
    }
    setPickupMethod(cellData?.pickup_method || 'pickup');
    setDropoffMethod(cellData?.dropoff_method || 'dropoff');
    setAttendanceStatus(cellData?.attendance_status ?? 'planned');
    setAttendanceLogs([]);
    setLogsOpen(false);
    setSelectedCell({ childId, date });
  };

  /* Phase 25: 出欠ステータス変更（RPC 経由）。全ロール可。 */
  const handleAttendanceChange = async (next: AttendanceStatus) => {
    const cell = cells.find(
      (c) => c.child_id === selectedCell?.childId && c.date === selectedCell?.date,
    );
    if (!cell?.entry_id) {
      alert('この日の利用予定がまだ登録されていないため、出欠記録できません。先に時間などを保存してください。');
      return;
    }
    setAttendanceBusy(true);
    try {
      const res = await fetch(
        `/api/schedule-entries/${cell.entry_id}/attendance`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? '更新失敗');
      setAttendanceStatus(next);
      setCells((prev) =>
        prev.map((c) =>
          c.entry_id === cell.entry_id ? { ...c, attendance_status: next } : c,
        ),
      );
      /* 履歴を開いてたら再取得 */
      if (logsOpen) void loadAttendanceLogs(cell.entry_id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const loadAttendanceLogs = async (entryId: string) => {
    try {
      const res = await fetch(`/api/attendance-logs?entry_id=${entryId}`);
      if (!res.ok) throw new Error('履歴取得失敗');
      const { logs } = await res.json();
      setAttendanceLogs(logs as AttendanceAuditLogRow[]);
    } catch (e) {
      alert(e instanceof Error ? e.message : '履歴取得失敗');
    }
  };

  const handleSave = async () => {
    if (!selectedCell) return;
    /* Phase 24: method に関わらず出席なら時刻を保存（self のときも時刻は記録する） */
    const pickup =
      attendance === 'attend'
        ? `${pickupHour.padStart(2, '0')}:${pickupMin.padStart(2, '0')}`
        : null;
    const dropoff =
      attendance === 'attend'
        ? `${dropoffHour.padStart(2, '0')}:${dropoffMin.padStart(2, '0')}`
        : null;

    try {
      const res = await fetch('/api/schedule-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{
            child_id: selectedCell.childId,
            date: selectedCell.date,
            pickup_time: pickup,
            dropoff_time: dropoff,
            pickup_method: pickupMethod,
            dropoff_method: dropoffMethod,
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失敗');
      setSelectedCell(null);
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失敗');
    }
  };

  const handleBulkImport = async (entries: ParsedScheduleEntry[]) => {
    /* 名前 → child_id 解決 */
    const nameToId = new Map(children.map((c) => [c.name, c.id]));
    const rows = entries
      .filter((e) => nameToId.has(e.child_name))
      .map((e) => ({
        child_id: nameToId.get(e.child_name)!,
        date: e.date,
        pickup_time: e.pickup_time,
        dropoff_time: e.dropoff_time,
        pickup_method: e.pickup_method ?? 'pickup',
        dropoff_method: e.dropoff_method ?? 'dropoff',
        /* Phase 27-A-1: 確認画面で選択された pattern_id を送信（null=該当なし） */
        pattern_id: e.pattern_id ?? null,
      }));
    if (rows.length === 0) {
      alert('児童名が一致しませんでした。児童管理で名前を登録してください。');
      return;
    }
    const res = await fetch('/api/schedule-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: rows }),
    });
    if (!res.ok) {
      alert('インポートに失敗しました: ' + ((await res.json()).error ?? ''));
      return;
    }
    alert(`${rows.length}件の利用予定を登録しました`);
    await fetchAll();
  };

  const selectedChild = selectedCell ? children.find((c) => c.id === selectedCell.childId) : null;
  const formatDateLabel = (dateStr: string) => format(new Date(dateStr), 'M月d日（E）', { locale: ja });

  const timeInputStyle: React.CSSProperties = {
    width: '60px', padding: '8px 4px', fontSize: '1.1rem', fontWeight: 600,
    textAlign: 'center', color: 'var(--ink)', background: 'transparent',
    border: 'none', borderBottom: '2px solid var(--accent)', outline: 'none',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={`${year}年${month}月利用予定`}
        showMonthSelector
        actions={
          <>
            <Button variant="secondary" onClick={() => setExcelModalOpen(true)}>Excel貼付</Button>
            <Button variant="primary" onClick={() => setPdfModalOpen(true)}>PDFインポート</Button>
          </>
        }
      />

      <div className="px-6 flex-1 overflow-hidden flex flex-col mt-2">
        {error && (
          <div className="mb-2 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {loading ? (
          <div className="h-96 flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)' }}>
            読み込み中...
          </div>
        ) : children.length === 0 ? (
          <div className="h-96 flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)' }}>
            児童が登録されていません。児童管理から追加してください。
          </div>
        ) : (
          <ScheduleGrid
            year={year}
            month={month}
            children={childrenForGrid}
            cells={cells}
            onCellClick={handleCellClick}
          />
        )}
      </div>

      <ExcelPasteModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onConfirm={handleBulkImport}
        year={year}
        month={month}
        existingChildNames={children.map((c) => c.name)}
        onChildrenRegistered={fetchAll}
      />

      <PdfImportModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        onConfirm={handleBulkImport}
        childList={children}
        patterns={patterns}
        patternUsage={patternUsage}
      />

      <Modal
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        title={selectedCell && selectedChild ? `${selectedChild.name} — ${formatDateLabel(selectedCell.date)}` : ''}
      >
        {selectedCell && selectedChild && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>出欠種類</label>
              <ToggleGroup
                options={[
                  { label: '出席', value: 'attend' },
                  { label: '欠席', value: 'absent' },
                  { label: 'お休み', value: 'off' },
                ]}
                value={attendance}
                onChange={(v) => setAttendance(v as 'attend' | 'absent' | 'off')}
                accentColor="#4dbfbf"
              />
            </div>

            {attendance === 'attend' && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                    来所予定時間
                    {pickupMethod === 'self' && (
                      <span className="text-xs font-normal" style={{ color: 'var(--ink-3)' }}>（送迎なし）</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={23} value={pickupHour} onChange={(e) => setPickupHour(e.target.value)} style={timeInputStyle} />
                    <span className="text-lg font-bold" style={{ color: 'var(--ink-3)' }}>:</span>
                    <input type="number" min={0} max={59} step={5} value={pickupMin} onChange={(e) => setPickupMin(e.target.value)} style={timeInputStyle} />
                  </div>
                  <ToggleGroup
                    options={[{ label: '自分で来る', value: 'self' }, { label: 'お迎え', value: 'pickup' }]}
                    value={pickupMethod}
                    onChange={(v) => setPickupMethod(v as 'self' | 'pickup')}
                    accentColor="#4dbfbf"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                    退所予定時間
                    {dropoffMethod === 'self' && (
                      <span className="text-xs font-normal" style={{ color: 'var(--ink-3)' }}>（送迎なし）</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={23} value={dropoffHour} onChange={(e) => setDropoffHour(e.target.value)} style={timeInputStyle} />
                    <span className="text-lg font-bold" style={{ color: 'var(--ink-3)' }}>:</span>
                    <input type="number" min={0} max={59} step={5} value={dropoffMin} onChange={(e) => setDropoffMin(e.target.value)} style={timeInputStyle} />
                  </div>
                  <ToggleGroup
                    options={[{ label: '自分で帰る', value: 'self' }, { label: '送り', value: 'dropoff' }]}
                    value={dropoffMethod}
                    onChange={(v) => setDropoffMethod(v as 'self' | 'dropoff')}
                    accentColor="#4dbfbf"
                  />
                </div>
              </>
            )}

            {/* Phase 25: 当日の出欠記録（全ロール編集可・履歴付き） */}
            <div className="flex flex-col gap-2 pt-3 mt-1" style={{ borderTop: '1px solid var(--rule)' }}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                  当日の出欠記録
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const cell = cells.find(
                      (c) =>
                        c.child_id === selectedCell.childId && c.date === selectedCell.date,
                    );
                    if (!cell?.entry_id) return;
                    if (!logsOpen) void loadAttendanceLogs(cell.entry_id);
                    setLogsOpen(!logsOpen);
                  }}
                  className="text-xs underline"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {logsOpen ? '履歴を閉じる' : '履歴を見る'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {(['planned', 'present', 'absent', 'late', 'early_leave'] as AttendanceStatus[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => handleAttendanceChange(s)}
                      className="px-3 py-1 text-xs font-semibold rounded transition-all"
                      style={{
                        background: attendanceStatus === s ? ATTENDANCE_COLORS[s] : 'var(--bg)',
                        color: attendanceStatus === s ? '#fff' : 'var(--ink-2)',
                        border: `1px solid ${
                          attendanceStatus === s ? ATTENDANCE_COLORS[s] : 'var(--rule-strong)'
                        }`,
                        opacity: attendanceBusy ? 0.6 : 1,
                        cursor: attendanceBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {ATTENDANCE_LABELS[s]}
                    </button>
                  ),
                )}
              </div>
              {logsOpen && (
                <div
                  className="mt-1 p-2 rounded text-xs"
                  style={{ background: 'var(--bg)', maxHeight: '160px', overflowY: 'auto' }}
                >
                  {attendanceLogs.length === 0 ? (
                    <span style={{ color: 'var(--ink-3)' }}>履歴なし</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {attendanceLogs.map((l) => (
                        <li key={l.id} style={{ color: 'var(--ink-2)' }}>
                          <span style={{ color: 'var(--ink-3)' }}>
                            {format(new Date(l.changed_at), 'M/d HH:mm', { locale: ja })}
                          </span>{' '}
                          {l.changed_by_name}: {l.old_status ? ATTENDANCE_LABELS[l.old_status] : '(新規)'} →{' '}
                          <strong style={{ color: ATTENDANCE_COLORS[l.new_status] }}>
                            {ATTENDANCE_LABELS[l.new_status]}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <Button variant="secondary" onClick={() => setSelectedCell(null)}>キャンセル</Button>
              <Button variant="primary" onClick={handleSave}>保存</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
