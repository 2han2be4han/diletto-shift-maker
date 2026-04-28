'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import MonthStepper from '@/components/ui/MonthStepper';
import ScheduleGrid from '@/components/schedule/ScheduleGrid';
import PdfImportModal from '@/components/schedule/PdfImportModal';
import ExcelPasteModal from '@/components/schedule/ExcelPasteModal';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { format, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useCurrentStaff } from '@/components/layout/AppShell';
import type {
  ParsedScheduleEntry,
  ChildRow,
  ScheduleEntryRow,
  AttendanceStatus,
  AttendanceAuditLogRow,
  AreaLabel,
  TenantSettings,
} from '@/types';
import { GRADE_LABELS } from '@/lib/utils/parseChildName';

/* Phase 25/64: 出欠ラベル */
const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  planned: '予定',
  present: '出席',
  absent: '欠席',
  late: '遅刻',
  early_leave: '早退',
  leave: 'お休み',
  waitlist: 'キャンセル待ち',
};
const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  planned: 'var(--ink-3)',
  present: 'var(--green)',
  absent: 'var(--red)',
  late: 'var(--gold)',
  early_leave: 'var(--accent)',
  leave: 'var(--ink-3)',
  waitlist: 'var(--ink-3)',  /* Phase 64: グレー寄せ */
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
  /** Phase 64: キャンセル待ちの順番 (1〜10)。waitlist 以外は null。 */
  waitlist_order: number | null;
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
function defaultCurrentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SchedulePage() {
  const searchParams = useSearchParams();
  const urlMonth = searchParams.get('month');
  const { year, month } = useMemo(() => {
    const source = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : defaultCurrentMonthStr();
    const [y, m] = source.split('-').map(Number);
    return { year: y, month: m };
  }, [urlMonth]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  /* Phase 28: テナントエリア（PDF/Excel インポートのマーク自動推論用） */
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);
  const [cells, setCells] = useState<CellData[]>([]);
  /* Phase 61-3: 差分インポート用に「確定済み送迎が紐づく entry_id」を保持 */
  const [confirmedTransportEntryIds, setConfirmedTransportEntryIds] = useState<Set<string>>(new Set());
  /* Phase 61-3: 生エントリも保持して handleBulkImport の diff 算出に使う */
  const [rawEntries, setRawEntries] = useState<ScheduleEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCell, setSelectedCell] = useState<{ childId: string; date: string } | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  /* Phase 41: 旧 attendance state (attend/absent/off) を撤廃。
     時間/送迎 UI の表示・保存可否はすべて attendanceStatus に統一する。
     ルール: 「欠席 (absent) 以外は時間入力可能」 */
  /* Phase 25: 当日の出欠記録（DB永続） */
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('planned');
  /* Phase 64: キャンセル待ちの順番 (1〜10)。waitlist 以外は null。 */
  const [waitlistOrder, setWaitlistOrder] = useState<number | null>(null);
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

      /* Phase 61-5: batch API で一括取得。失敗時は旧 3 fetch フォールバック。 */
      let ch: ChildRow[] = [];
      let entries: ScheduleEntryRow[] = [];
      let settings: TenantSettings = {};
      let confirmedIds: string[] = [];

      const batchRes = await fetch(`/api/schedule-page-data?from=${from}&to=${to}`);
      if (batchRes.ok) {
        const j = await batchRes.json();
        ch = (j.children ?? []) as ChildRow[];
        entries = (j.entries ?? []) as ScheduleEntryRow[];
        settings = (j.tenant?.settings ?? {}) as TenantSettings;
        confirmedIds = (j.confirmedTransportEntryIds ?? []) as string[];
      } else {
        const [cRes, eRes, tRes] = await Promise.all([
          fetch('/api/children'),
          fetch(`/api/schedule-entries?from=${from}&to=${to}`),
          fetch('/api/tenant'),
        ]);
        if (!cRes.ok) throw new Error('児童の取得に失敗しました');
        if (!eRes.ok) throw new Error('利用予定の取得に失敗しました');
        ch = (await cRes.json()).children ?? [];
        entries = (await eRes.json()).entries ?? [];
        if (tRes.ok) settings = ((await tRes.json()).tenant?.settings ?? {}) as TenantSettings;
      }

      /* Phase 28: tenant エリアを取得してマーク推論に使う */
      setPickupAreas(settings.pickup_areas ?? settings.transport_areas ?? []);
      setDropoffAreas(settings.dropoff_areas ?? []);

      setChildren(ch.filter((c) => c.is_active));
      setRawEntries(entries);
      setConfirmedTransportEntryIds(new Set(confirmedIds));
      setCells(
        entries.map<CellData>((e) => ({
          entry_id: e.id,
          child_id: e.child_id,
          date: e.date,
          pickup_time: e.pickup_time,
          dropoff_time: e.dropoff_time,
          /* Phase 24: DB に保存された method を尊重。旧データ(デフォルト) は pickup/dropoff になる */
          pickup_method: e.pickup_method === 'self' ? 'self' : 'pickup',
          dropoff_method: e.dropoff_method === 'self' ? 'self' : 'dropoff',
          attendance_status: e.attendance_status ?? 'planned',
          waitlist_order: e.waitlist_order ?? null,
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
    setPickupMethod(cellData?.pickup_method || 'pickup');
    setDropoffMethod(cellData?.dropoff_method || 'dropoff');
    setAttendanceStatus(cellData?.attendance_status ?? 'planned');
    setWaitlistOrder(cellData?.waitlist_order ?? null);
    setAttendanceLogs([]);
    setLogsOpen(false);
    setSelectedCell({ childId, date });
  };

  /* Phase 25: 出欠ステータス変更（RPC 経由）。全ロール可。
     Phase 40: entry が存在しない（空セル）日に出欠ボタンを押した場合、
     先に空 entry (times=null) を auto-create してから attendance を更新する。
     旧仕様の「先に時間を保存してください」アラートを撤廃し、1 操作で完結させる。 */
  const handleAttendanceChange = async (
    next: AttendanceStatus,
    nextOrder: number | null = null,
  ) => {
    if (!selectedCell) return;
    const cell = cells.find(
      (c) => c.child_id === selectedCell.childId && c.date === selectedCell.date,
    );
    setAttendanceBusy(true);
    try {
      let entryId = cell?.entry_id ?? null;

      /* 空セルなら entry を空で作成（pickup_time/dropoff_time=null）。
         API は upsert (onConflict: tenant_id+child_id+date) なので二重作成は起きない。 */
      if (!entryId) {
        const createRes = await fetch('/api/schedule-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: [{
              child_id: selectedCell.childId,
              date: selectedCell.date,
              pickup_time: null,
              dropoff_time: null,
              pickup_method: 'pickup',
              dropoff_method: 'dropoff',
            }],
          }),
        });
        if (!createRes.ok) {
          throw new Error((await createRes.json()).error ?? '利用予定の作成に失敗しました');
        }
        const created = await createRes.json();
        entryId = (created.entries?.[0]?.id ?? created.entry?.id ?? null) as string | null;
        if (!entryId) {
          /* レスポンス形式が想定外 → fetchAll で取り直す */
          await fetchAll();
          const refreshed = cells.find(
            (c) => c.child_id === selectedCell.childId && c.date === selectedCell.date,
          );
          entryId = refreshed?.entry_id ?? null;
        }
        if (!entryId) throw new Error('作成した利用予定の id を取得できませんでした');
      }

      /* Phase 64: waitlist 以外では order を強制 NULL（RPC でも同様にガードしているがクライアント側でも揃える）。 */
      const orderToSend = next === 'waitlist' ? nextOrder : null;

      const res = await fetch(
        `/api/schedule-entries/${entryId}/attendance`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next, waitlist_order: orderToSend }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? '更新失敗');
      setAttendanceStatus(next);
      setWaitlistOrder(orderToSend);
      const finalEntryId = entryId;
      const finalOrder = orderToSend;
      setCells((prev) => {
        /* 既存セル更新、または新規作成された entry を反映 */
        const exists = prev.some((c) => c.entry_id === finalEntryId);
        if (exists) {
          return prev.map((c) =>
            c.entry_id === finalEntryId
              ? { ...c, attendance_status: next, waitlist_order: finalOrder }
              : c,
          );
        }
        /* fetchAll で確実に同期 */
        void fetchAll();
        return prev;
      });
      if (logsOpen) void loadAttendanceLogs(finalEntryId);
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
    /* 「出席以外なら時刻は null」に統一。
       absent（欠席）と leave（お休み）はどちらも送迎対象外なので pickup/dropoff を null にする。 */
    const isPresent = attendanceStatus !== 'absent' && attendanceStatus !== 'leave';
    const pickup = isPresent
      ? `${pickupHour.padStart(2, '0')}:${pickupMin.padStart(2, '0')}`
      : null;
    const dropoff = isPresent
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

  const childNameToIdMap = useMemo(
    () => new Map(children.map((c) => [c.name, c.id])),
    [children]
  );

  const handleBulkImport = async (entries: ParsedScheduleEntry[]) => {
    /* Phase 61-3: 差分インポート。
       - 既存 entries と突合して adds/updates と removes を算出
       - 確定済み送迎が紐づく entry は API 側で自動スキップされる（is_confirmed 保護） */
    const nameToId = childNameToIdMap;
    const rows = entries
      .filter((e) => nameToId.has(e.child_name))
      .map((e) => ({
        child_id: nameToId.get(e.child_name)!,
        date: e.date,
        pickup_time: e.pickup_time,
        dropoff_time: e.dropoff_time,
        pickup_method: e.pickup_method ?? 'pickup',
        dropoff_method: e.dropoff_method ?? 'dropoff',
        /* Phase 28: マーク（emoji+name）を送信。null=該当なし */
        pickup_mark: e.pickup_mark ?? null,
        dropoff_mark: e.dropoff_mark ?? null,
      }));
    if (rows.length === 0) {
      alert('児童名が一致しませんでした。児童管理で名前を登録してください。');
      return;
    }

    const dates = rows.map((r) => r.date).filter((d): d is string => !!d).sort();
    if (dates.length === 0) {
      alert('有効な日付を含む行がありませんでした');
      return;
    }
    const rangeFrom = dates[0];
    const rangeTo = dates[dates.length - 1];

    /* 削除対象: 既存の planned で、インポート範囲内 かつ 貼付に現れない entry */
    const importedKeys = new Set(rows.map((r) => `${r.child_id}_${r.date}`));
    const removes = rawEntries
      .filter(
        (e) =>
          e.date >= rangeFrom &&
          e.date <= rangeTo &&
          !importedKeys.has(`${e.child_id}_${e.date}`) &&
          (e.attendance_status == null || e.attendance_status === 'planned')
      )
      .map((e) => e.id);

    const res = await fetch('/api/schedule-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'diff', entries: rows, removes }),
    });
    if (!res.ok) {
      alert('インポートに失敗しました: ' + ((await res.json()).error ?? ''));
      return;
    }
    const j = await res.json();
    const skipped = Array.isArray(j.skippedIds) ? j.skippedIds.length : 0;
    alert(
      skipped > 0
        ? `${rows.length}件を反映しました（${skipped}件は送迎確定済みのため保護）`
        : `${rows.length}件の利用予定を登録しました`
    );
    await fetchAll();
  };

  const selectedChild = selectedCell ? children.find((c) => c.id === selectedCell.childId) : null;
  const formatDateLabel = (dateStr: string) => format(new Date(dateStr), 'M月d日（E）', { locale: ja });

  const timeInputStyle: React.CSSProperties = {
    width: '60px', padding: '8px 4px', fontSize: '1.1rem', fontWeight: 600,
    textAlign: 'center', color: 'var(--ink)', background: 'transparent',
    border: 'none', borderBottom: '2px solid var(--accent)', outline: 'none',
  };

  const { staff: currentStaff } = useCurrentStaff();
  const myRole = currentStaff?.role ?? 'viewer';

  return (
    <div className="flex flex-col h-full overflow-hidden schedule-print-root">
      {/* 利用予定印刷 CSS。A3 横、見やすさ優先（縦に伸びて複数ページになって良い）。
         - Phase 66: シフト表サイズ感に揃えるため、列幅 80→56px に圧縮、フォントも一段小さく。
           印刷時の 迎14:30 などが見切れていた問題対策で、cell 内 span は 6.5pt まで縮小。
         - 日付ヘッダは営/休 + M/d + 曜日 の 3 段を維持（曜日色も保持）
         - セル内の 迎/送 は画面と同じく縦 2 段表示
         - thead は各ページに繰り返し表示（display: table-header-group）
         - 行は途中で改ページしない、ただし tbody 全体は改ページ可
         - 利用数行の sticky は印刷時に解除して通常の最終行として描画 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A3 landscape; margin: 8mm; }
              .schedule-print-root { overflow: visible !important; height: auto !important; }
              .schedule-print-root .flex-1 { overflow: visible !important; padding: 0 !important; }
              .schedule-print-root .px-6 { padding-left: 0 !important; padding-right: 0 !important; }
              .schedule-print-root table {
                font-size: 8pt !important;
                width: 100% !important;
                min-width: 0 !important;
                table-layout: fixed !important;
                border-collapse: collapse !important;
              }
              /* thead は全ページに繰り返し表示（行が複数ページに渡っても日付が見える） */
              .schedule-print-root thead { display: table-header-group !important; }
              .schedule-print-root tfoot { display: table-footer-group !important; }
              /* 行（tr）は途中で改ページしない。tbody/table 全体は分割可。 */
              .schedule-print-root tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .schedule-print-root th,
              .schedule-print-root td {
                min-width: 0 !important;
                padding: 2px 1px !important;
                font-size: 8pt !important;
                line-height: 1.2 !important;
                overflow: hidden;
              }
              /* 児童名は 1 段目（名前）を太字、2 段目（学年）はやや小さく */
              .schedule-print-root tbody td:first-child {
                font-size: 7.5pt !important;
              }
              .schedule-print-root tbody td:first-child > div:nth-child(2) {
                font-size: 6pt !important;
                margin-top: 0 !important;
              }
              /* セル内の 迎/送 は画面同様の縦 2 段表示を維持（横並び圧縮を解除） */
              .schedule-print-root tbody td .flex.flex-col {
                flex-direction: column !important;
                gap: 0 !important;
                line-height: 1.15 !important;
              }
              /* Phase 66: 印刷時 迎14:30 が列幅に収まるよう 6.5pt まで圧縮（見切れ対策） */
              .schedule-print-root tbody td .flex.flex-col > span {
                white-space: nowrap !important;
                font-size: 6.5pt !important;
              }
              /* 氏名列。シフト表幅感に揃えるため 90→70px に圧縮 */
              .schedule-print-root thead th:first-child,
              .schedule-print-root tbody td:first-child {
                width: 70px !important;
                min-width: 70px !important;
                padding: 3px 4px !important;
              }
              /* 日付ヘッダのフォント */
              .schedule-print-root thead th {
                padding: 3px 1px !important;
              }
              .schedule-print-root thead th > div:nth-child(1) { font-size: 5.5pt !important; }
              .schedule-print-root thead th > div:nth-child(2) { font-size: 7.5pt !important; font-weight: 700 !important; }
              .schedule-print-root thead th > div:nth-child(3) { font-size: 5.5pt !important; }
              /* sticky は印刷時に解除しないと位置がずれる
                 (利用数行・キャンセル待ち行ともに bottom-0 で sticky になっているため) */
              .schedule-print-root thead th,
              .schedule-print-root tbody td,
              .schedule-print-root tbody tr:last-child td,
              .schedule-print-root tbody tr:nth-last-child(2) td {
                position: static !important;
                box-shadow: none !important;
              }
              .schedule-print-root tr:hover { background: inherit !important; }
              .schedule-print-root .group-hover\\:\\!bg-\\[var\\(--accent-pale-solid\\)\\]:hover,
              .schedule-print-root .group-hover\\:\\!bg-\\[var\\(--accent-pale\\)\\]:hover {
                background: inherit !important;
              }
              .schedule-print-title { display: block !important; font-size: 13pt; font-weight: 700; margin-bottom: 3mm; }
            }
            @media screen { .schedule-print-title { display: none; } }
          `,
        }}
      />
      <h1 className="schedule-print-title print-only">{year}年{month}月 利用予定</h1>
      <Header
        title="利用予定"
        actions={
          <>
            <Button data-tour="schedule-print" variant="secondary" onClick={() => window.print()} title="A3 横で印刷">🖨 印刷</Button>
            {myRole !== 'viewer' && (
              <>
                <Button data-tour="schedule-excel" variant="secondary" onClick={() => setExcelModalOpen(true)}>Excel貼付</Button>
                <Button data-tour="schedule-pdf" variant="primary" onClick={() => setPdfModalOpen(true)}>PDFインポート</Button>
              </>
            )}
          </>
        }
      />
      <div className="px-6 pt-3 print-hide" data-tour="month-stepper">
        <MonthStepper defaultMonth={defaultCurrentMonthStr()} />
      </div>

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
          <div data-tour="schedule-grid" className="flex-1 min-h-0 flex flex-col">
            <ScheduleGrid
              year={year}
              month={month}
              children={childrenForGrid}
              cells={cells}
              onCellClick={handleCellClick}
              myRole={myRole}
            />
          </div>
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
        existingEntries={rawEntries.map((e) => ({
          id: e.id,
          child_id: e.child_id,
          date: e.date,
          pickup_time: e.pickup_time,
          dropoff_time: e.dropoff_time,
          pickup_method: e.pickup_method === 'self' ? 'self' : 'pickup',
          dropoff_method: e.dropoff_method === 'self' ? 'self' : 'dropoff',
          pickup_mark: e.pickup_mark ?? null,
          dropoff_mark: e.dropoff_mark ?? null,
        }))}
        confirmedTransportEntryIds={confirmedTransportEntryIds}
        childNameToId={childNameToIdMap}
      />

      <PdfImportModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        onConfirm={handleBulkImport}
        childList={children}
        pickupAreas={pickupAreas}
        dropoffAreas={dropoffAreas}
      />

      <Modal
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        title={selectedCell && selectedChild ? `${selectedChild.name} — ${formatDateLabel(selectedCell.date)}` : ''}
      >
        {selectedCell && selectedChild && (
          <div className="flex flex-col gap-5">
            {/* 時間/送迎 UI は「欠席／お休み以外」で表示。
                Phase 64: キャンセル待ちでも時刻入力可（利用に切替時に時刻が引き継がれる）。 */}
            {attendanceStatus !== 'absent' && attendanceStatus !== 'leave' && (
              <>
                {/* Phase 64: キャンセル待ち時の注意書き。職員が時刻を見て「来所済み？」と混乱しないように
                    「この時間でキャンセル待ち」を明示する。 */}
                {attendanceStatus === 'waitlist' && (
                  <div
                    className="px-3 py-2 rounded text-xs font-semibold"
                    style={{
                      background: 'rgba(0,0,0,0.05)',
                      color: 'var(--ink-2)',
                      border: '1px dashed var(--rule-strong)',
                    }}
                  >
                    この利用時間でキャンセル待ちです{waitlistOrder ? `（順番: ${waitlistOrder} 番）` : ''}
                  </div>
                )}
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

            {/* 出欠ボタンは 4 種類。
                Phase 64: キャンセル待ち (waitlist) を追加。grey 寄せの色で出席系と差別化。 */}
            <div className="flex flex-col gap-2 pt-3 mt-1" style={{ borderTop: '1px solid var(--rule)' }}>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { label: '出席', value: 'present' as AttendanceStatus, color: 'var(--green)' },
                  { label: 'お休み', value: 'leave' as AttendanceStatus, color: 'var(--ink-3)' },
                  { label: '欠席', value: 'absent' as AttendanceStatus, color: 'var(--red)' },
                  { label: 'キャンセル待ち', value: 'waitlist' as AttendanceStatus, color: '#6b7280' },
                ]).map((opt) => {
                  const on = attendanceStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => {
                        /* Phase 64: キャンセル待ちに切り替えた時は既存の order を維持。
                           それ以外に切り替えた時は order=null を送る（RPC でも強制 NULL）。 */
                        const carryOrder = opt.value === 'waitlist' ? waitlistOrder : null;
                        handleAttendanceChange(opt.value, carryOrder);
                      }}
                      className="py-3 text-sm font-bold rounded transition-all"
                      style={{
                        background: on ? opt.color : 'var(--bg)',
                        color: on ? '#fff' : 'var(--ink-2)',
                        border: `2px solid ${on ? opt.color : 'var(--rule-strong)'}`,
                        opacity: attendanceBusy ? 0.6 : 1,
                        cursor: attendanceBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Phase 64: キャンセル待ちの順番ピッカー (1〜10、5×2 グリッド)。
                  status='waitlist' の時のみ表示。タップで即時保存（出欠ボタンと同じ UX）。 */}
              {attendanceStatus === 'waitlist' && (
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                    順番（同じ番号が複数いてもOK：兄弟など）
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                      const on = waitlistOrder === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          disabled={attendanceBusy}
                          onClick={() => handleAttendanceChange('waitlist', n)}
                          className="py-2 text-base font-bold rounded transition-all"
                          style={{
                            background: on ? '#6b7280' : 'var(--bg)',
                            color: on ? '#fff' : 'var(--ink-2)',
                            border: `2px solid ${on ? '#6b7280' : 'var(--rule-strong)'}`,
                            opacity: attendanceBusy ? 0.6 : 1,
                            cursor: attendanceBusy ? 'wait' : 'pointer',
                          }}
                        >
                          {'①②③④⑤⑥⑦⑧⑨⑩'.charAt(n - 1)}
                        </button>
                      );
                    })}
                  </div>
                  {waitlistOrder != null && (
                    <button
                      type="button"
                      disabled={attendanceBusy}
                      onClick={() => handleAttendanceChange('waitlist', null)}
                      className="text-xs font-semibold py-1.5 rounded"
                      style={{
                        background: 'transparent',
                        color: 'var(--ink-3)',
                        border: '1px dashed var(--rule-strong)',
                      }}
                    >
                      順番をクリア
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <Button variant="secondary" onClick={() => setSelectedCell(null)}>
                {myRole === 'viewer' ? '閉じる' : 'キャンセル'}
              </Button>
              {myRole !== 'viewer' && (
                <Button variant="primary" onClick={handleSave}>保存</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
