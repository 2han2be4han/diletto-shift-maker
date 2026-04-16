'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import ScheduleGrid from '@/components/schedule/ScheduleGrid';
import PdfImportModal from '@/components/schedule/PdfImportModal';
import ExcelPasteModal from '@/components/schedule/ExcelPasteModal';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ParsedScheduleEntry } from '@/types';

/**
 * 利用予定ページ
 * - デイロボ風グリッド表（児童×日付）
 * - セルクリック → デイロボ風編集モーダル（出欠種類・時間・迎え/送りトグル）
 * - PDFインポートモーダル
 *
 * TODO: Supabase連携後にDBからデータ取得に切り替え
 */

const MOCK_CHILDREN = [
  { id: 'c1', name: '川島舞桜', grade_label: '未就学' },
  { id: 'c2', name: '川島颯斗', grade_label: '小4' },
  { id: 'c3', name: '黒川蒼斗', grade_label: '小3' },
  { id: 'c4', name: '清水隼音', grade_label: '小4' },
  { id: 'c5', name: '滝川希', grade_label: '未就学' },
  { id: 'c6', name: '竹内碧子', grade_label: '小3' },
  { id: 'c7', name: '中村日菜美', grade_label: '未就学' },
  { id: 'c8', name: '中山結稀', grade_label: '小4' },
  { id: 'c9', name: '松本翔樹', grade_label: '小4' },
  { id: 'c10', name: '板倉千夏', grade_label: '小2' },
  { id: 'c11', name: '木下琉十', grade_label: '小5' },
];

type CellData = {
  child_id: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  pickup_method: 'self' | 'pickup';
  dropoff_method: 'self' | 'dropoff';
  note: string | null;
};

function generateMockCells(): CellData[] {
  const cells: CellData[] = [];
  const year = 2026;
  const month = 4;
  const pickupTimes = ['10:30', '11:00', '11:20', '11:30', '12:00', '12:30', '13:00', '13:50', '14:20'];
  const dropoffTimes = ['16:00', '16:30'];

  MOCK_CHILDREN.forEach((child) => {
    for (let d = 1; d <= 30; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow === 0 || dow === 6) continue;
      if (Math.random() > 0.7) continue;
      if (Math.random() < 0.05) {
        cells.push({
          child_id: child.id,
          date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          pickup_time: null, dropoff_time: null,
          pickup_method: 'pickup', dropoff_method: 'dropoff',
          note: '追・休',
        });
        continue;
      }
      /* 10%の確率で「自分で来る」にする */
      const isSelfPickup = Math.random() < 0.1;
      const isSelfDropoff = Math.random() < 0.1;
      cells.push({
        child_id: child.id,
        date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        pickup_time: pickupTimes[Math.floor(Math.random() * pickupTimes.length)],
        dropoff_time: dropoffTimes[Math.floor(Math.random() * dropoffTimes.length)],
        pickup_method: isSelfPickup ? 'self' : 'pickup',
        dropoff_method: isSelfDropoff ? 'self' : 'dropoff',
        note: null,
      });
    }
  });
  return cells;
}

/* デイロボ風トグルボタン */
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

export default function SchedulePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cells] = useState<CellData[]>(() => generateMockCells());
  const [selectedCell, setSelectedCell] = useState<{ childId: string; date: string } | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  /* 編集モーダルのstate */
  const [attendance, setAttendance] = useState<'attend' | 'absent' | 'off'>('attend');
  const [pickupHour, setPickupHour] = useState('13');
  const [pickupMin, setPickupMin] = useState('20');
  const [pickupMethod, setPickupMethod] = useState<'self' | 'pickup'>('pickup');
  const [dropoffHour, setDropoffHour] = useState('16');
  const [dropoffMin, setDropoffMin] = useState('00');
  const [dropoffMethod, setDropoffMethod] = useState<'self' | 'dropoff'>('dropoff');

  const handleCellClick = (childId: string, date: string) => {
    const cellData = cells.find((c) => c.child_id === childId && c.date === date);
    if (cellData?.pickup_time) {
      const [h, m] = cellData.pickup_time.split(':');
      setPickupHour(h);
      setPickupMin(m);
    } else {
      setPickupHour('13');
      setPickupMin('00');
    }
    if (cellData?.dropoff_time) {
      const [h, m] = cellData.dropoff_time.split(':');
      setDropoffHour(h);
      setDropoffMin(m);
    } else {
      setDropoffHour('16');
      setDropoffMin('00');
    }
    if (cellData?.note === '追・休' || cellData?.note === '定・休') {
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

  const selectedChild = selectedCell
    ? MOCK_CHILDREN.find((c) => c.id === selectedCell.childId)
    : null;

  const formatDateLabel = (dateStr: string) =>
    format(new Date(dateStr), 'M月d日（E）', { locale: ja });

  const handlePdfConfirm = (entries: ParsedScheduleEntry[]) => {
    // TODO: Supabase連携後にDB保存
    alert(`${entries.length}件の利用予定を登録しました（モック）`);
  };

  /* 時間入力のスタイル */
  const timeInputStyle: React.CSSProperties = {
    width: '60px',
    padding: '8px 4px',
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--ink)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid var(--accent)',
    outline: 'none',
  };

  return (
    <>
      <Header
        title="利用予定"
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              2026年4月
            </h2>
            <Badge variant="info">{MOCK_CHILDREN.length}名登録</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setExcelModalOpen(true)}>
              Excelから貼り付け
            </Button>
            <Button variant="primary" onClick={() => setPdfModalOpen(true)}>
              PDFインポート
            </Button>
          </div>
        </div>

        <ScheduleGrid
          year={2026}
          month={4}
          children={MOCK_CHILDREN}
          cells={cells}
          onCellClick={handleCellClick}
        />
      </div>

      {/* Excelコピペモーダル */}
      <ExcelPasteModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onConfirm={handlePdfConfirm}
        year={2026}
        month={4}
      />

      {/* PDFインポートモーダル */}
      <PdfImportModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        onConfirm={handlePdfConfirm}
      />

      {/* セル編集モーダル（デイロボ風） */}
      <Modal
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        title={
          selectedCell && selectedChild
            ? `${selectedChild.name} — ${formatDateLabel(selectedCell.date)}`
            : ''
        }
      >
        {selectedCell && selectedChild && (
          <div className="flex flex-col gap-5">
            {/* 出欠種類 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                出欠種類
              </label>
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
                {/* 来所予定時間 */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                    来所予定時間
                    {pickupMethod === 'self' && (
                      <span className="text-xs font-normal" style={{ color: 'var(--ink-3)' }}>（送迎なし）</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={pickupHour}
                      onChange={(e) => setPickupHour(e.target.value)}
                      style={timeInputStyle}
                    />
                    <span className="text-lg font-bold" style={{ color: 'var(--ink-3)' }}>:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={pickupMin}
                      onChange={(e) => setPickupMin(e.target.value)}
                      style={timeInputStyle}
                    />
                  </div>
                  <ToggleGroup
                    options={[
                      { label: '自分で来る', value: 'self' },
                      { label: 'お迎え', value: 'pickup' },
                    ]}
                    value={pickupMethod}
                    onChange={(v) => setPickupMethod(v as 'self' | 'pickup')}
                    accentColor="#4dbfbf"
                  />
                </div>

                {/* 退所予定時間 */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                    退所予定時間
                    {dropoffMethod === 'self' && (
                      <span className="text-xs font-normal" style={{ color: 'var(--ink-3)' }}>（送迎なし）</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={dropoffHour}
                      onChange={(e) => setDropoffHour(e.target.value)}
                      style={timeInputStyle}
                    />
                    <span className="text-lg font-bold" style={{ color: 'var(--ink-3)' }}>:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={dropoffMin}
                      onChange={(e) => setDropoffMin(e.target.value)}
                      style={timeInputStyle}
                    />
                  </div>
                  <ToggleGroup
                    options={[
                      { label: '自分で帰る', value: 'self' },
                      { label: '送り', value: 'dropoff' },
                    ]}
                    value={dropoffMethod}
                    onChange={(v) => setDropoffMethod(v as 'self' | 'dropoff')}
                    accentColor="#4dbfbf"
                  />
                </div>
              </>
            )}

            {/* ボタン */}
            <div className="flex gap-2 mt-2">
              <Button variant="secondary" onClick={() => setSelectedCell(null)}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  // TODO: Supabase連携後にDB更新
                  setSelectedCell(null);
                }}
              >
                保存
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
