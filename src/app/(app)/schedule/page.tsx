'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import ScheduleGrid from '@/components/schedule/ScheduleGrid';
import PdfImportModal from '@/components/schedule/PdfImportModal';
import ExcelPasteModal from '@/components/schedule/ExcelPasteModal';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { format, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ParsedScheduleEntry, ChildRow, ScheduleEntryRow } from '@/types';
import { GRADE_LABELS } from '@/lib/utils/parseChildName';

/**
 * 利用予定ページ（Supabase接続版）
 * - children と schedule_entries を DB から取得
 * - セル編集でリアルタイム upsert
 * - PDF / Excel インポートで bulk upsert
 */

/* GRADE_LABELS は @/lib/utils/parseChildName で一元管理 */

type CellData = {
  child_id: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  pickup_method: 'self' | 'pickup';
  dropoff_method: 'self' | 'dropoff';
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

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

export default function SchedulePage() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [cells, setCells] = useState<CellData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCell, setSelectedCell] = useState<{ childId: string; date: string } | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  const [attendance, setAttendance] = useState<'attend' | 'absent' | 'off'>('attend');
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

      const [cRes, eRes] = await Promise.all([
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${from}&to=${to}`),
      ]);

      if (!cRes.ok) throw new Error('児童の取得に失敗しました');
      if (!eRes.ok) throw new Error('利用予定の取得に失敗しました');

      const { children: ch } = await cRes.json();
      const { entries } = await eRes.json();

      setChildren((ch as ChildRow[]).filter((c) => c.is_active));
      setCells(
        (entries as ScheduleEntryRow[]).map<CellData>((e) => ({
          child_id: e.child_id,
          date: e.date,
          pickup_time: e.pickup_time,
          dropoff_time: e.dropoff_time,
          pickup_method: e.pickup_time ? 'pickup' : 'self',
          dropoff_method: e.dropoff_time ? 'dropoff' : 'self',
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
    setSelectedCell({ childId, date });
  };

  const handleSave = async () => {
    if (!selectedCell) return;
    const pickup =
      attendance === 'attend' && pickupMethod === 'pickup'
        ? `${pickupHour.padStart(2, '0')}:${pickupMin.padStart(2, '0')}`
        : null;
    const dropoff =
      attendance === 'attend' && dropoffMethod === 'dropoff'
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
        actions={
          <>
            <select
              value={`${year}-${month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y); setMonth(m);
              }}
              className="px-2 py-1 rounded text-sm"
              style={{ border: '1px solid var(--rule)' }}
            >
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(currentYear, currentMonth - 1 - 3 + i, 1);
                return (
                  <option key={`${d.getFullYear()}-${d.getMonth() + 1}`} value={`${d.getFullYear()}-${d.getMonth() + 1}`}>
                    {d.getFullYear()}年{d.getMonth() + 1}月
                  </option>
                );
              })}
            </select>
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
