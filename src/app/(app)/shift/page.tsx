'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/layout/Header';
import ShiftGrid from '@/components/shift/ShiftGrid';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { generateShiftAssignments } from '@/lib/logic/generateShift';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { StaffRow, ShiftAssignmentType } from '@/types';

/**
 * シフト表ページ
 * - シフト生成ボタン → ロジック実行 → グリッド表示
 * - セルクリック → 出勤種別を切り替え
 * - 警告表示（赤: 人員不足、黄: 有資格者不足）
 * - 確定ボタン
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

/* 仮データ */
const MOCK_STAFF: StaffRow[] = [
  { id: 's1', tenant_id: 't1', user_id: null, name: '金田', email: null, role: 'admin', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🍇', '🌳'], is_qualified: true, created_at: '' },
  { id: 's2', tenant_id: 't1', user_id: null, name: '加藤', email: null, role: 'editor', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🍇', '🏭'], is_qualified: true, created_at: '' },
  { id: 's3', tenant_id: 't1', user_id: null, name: '鈴木', email: null, role: 'editor', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🌳', '✈'], is_qualified: false, created_at: '' },
  { id: 's4', tenant_id: 't1', user_id: null, name: '田中', email: null, role: 'editor', employment_type: 'full_time', default_start_time: '09:30', default_end_time: '17:30', transport_areas: ['🍇'], is_qualified: false, created_at: '' },
  { id: 's5', tenant_id: 't1', user_id: null, name: '佐藤', email: null, role: 'viewer', employment_type: 'part_time', default_start_time: '10:00', default_end_time: '16:00', transport_areas: ['🌳'], is_qualified: false, created_at: '' },
  { id: 's6', tenant_id: 't1', user_id: null, name: '山本', email: null, role: 'editor', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🏭', '✈'], is_qualified: true, created_at: '' },
];

/* 利用予定の仮データ（4月平日に5〜8名） */
function generateMockSchedule() {
  const entries = [];
  for (let d = 1; d <= 30; d++) {
    const dow = new Date(2026, 3, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const count = 5 + Math.floor(Math.random() * 4);
    for (let c = 0; c < count; c++) {
      entries.push({
        id: `se-${d}-${c}`,
        tenant_id: 't1',
        child_id: `c${c}`,
        date: `2026-04-${String(d).padStart(2, '0')}`,
        pickup_time: '13:00',
        dropoff_time: '16:00',
        pattern_id: null,
        is_confirmed: false,
        created_at: '',
      });
    }
  }
  return entries;
}

export default function ShiftPage() {
  const [generated, setGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [shiftCells, setShiftCells] = useState<
    { staff_id: string; date: string; start_time: string | null; end_time: string | null; assignment_type: ShiftAssignmentType }[]
  >([]);
  const [warnings, setWarnings] = useState<{ date: string; type: 'understaffed' | 'no_qualified' | 'overworked'; message: string }[]>([]);

  const [editingCell, setEditingCell] = useState<{ staffId: string; date: string } | null>(null);
  const [editType, setEditType] = useState<ShiftAssignmentType>('normal');
  const [startH, setStartH] = useState('09');
  const [startM, setStartM] = useState('00');
  const [endH, setEndH] = useState('17');
  const [endM, setEndM] = useState('00');

  /* シフト生成 */
  const handleGenerate = () => {
    const result = generateShiftAssignments({
      tenantId: 't1',
      year: 2026,
      month: 4,
      staff: MOCK_STAFF,
      shiftRequests: [], // 仮データでは休み希望なし
      scheduleEntries: generateMockSchedule(),
    });

    setShiftCells(
      result.assignments.map((a) => ({
        staff_id: a.staff_id,
        date: a.date,
        start_time: a.start_time,
        end_time: a.end_time,
        assignment_type: a.assignment_type,
      }))
    );
    setWarnings(result.warnings);
    setGenerated(true);
    setConfirmed(false);
  };

  /* セルクリック → 編集モーダル */
  const handleCellClick = (staffId: string, date: string) => {
    if (confirmed) return;
    const cell = shiftCells.find((c) => c.staff_id === staffId && c.date === date);
    const staff = MOCK_STAFF.find((s) => s.id === staffId);

    if (cell) {
      setEditType(cell.assignment_type);
      if (cell.start_time) {
        const [h, m] = cell.start_time.split(':');
        setStartH(h);
        setStartM(m);
      } else {
        setStartH(staff?.default_start_time?.split(':')[0] || '09');
        setStartM(staff?.default_start_time?.split(':')[1] || '00');
      }
      if (cell.end_time) {
        const [h, m] = cell.end_time.split(':');
        setEndH(h);
        setEndM(m);
      } else {
        setEndH(staff?.default_end_time?.split(':')[0] || '17');
        setEndM(staff?.default_end_time?.split(':')[1] || '00');
      }
    }
    setEditingCell({ staffId, date });
  };

  /* 保存実行 */
  const handleSave = () => {
    if (!editingCell) return;
    setShiftCells((prev) =>
      prev.map((c) =>
        c.staff_id === editingCell.staffId && c.date === editingCell.date
          ? {
              ...c,
              assignment_type: editType,
              start_time: editType === 'normal' ? `${startH}:${startM}` : null,
              end_time: editType === 'normal' ? `${endH}:${endM}` : null,
            }
          : c
      )
    );
    setEditingCell(null);
  };

  const editingStaff = editingCell ? MOCK_STAFF.find((s) => s.id === editingCell.staffId) : null;
  const editingCellData = editingCell
    ? shiftCells.find((c) => c.staff_id === editingCell.staffId && c.date === editingCell.date)
    : null;

  /* 集計 */
  const summary = useMemo(() => {
    if (!generated) return null;
    const understaffedDays = warnings.filter((w) => w.type === 'understaffed').length;
    const noQualifiedDays = warnings.filter((w) => w.type === 'no_qualified').length;
    return { understaffedDays, noQualifiedDays, totalWarnings: warnings.length };
  }, [generated, warnings]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="シフト表" />

      <div className="flex-1 overflow-auto p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              2026年4月
            </h2>
            {confirmed && <Badge variant="success">確定済み</Badge>}
            {generated && !confirmed && <Badge variant="warning">未確定</Badge>}
          </div>
          <div className="flex gap-2">
            {generated && !confirmed && (
              <Button
                variant="primary"
                onClick={() => {
                  // TODO: Supabase連携後にDB更新（is_confirmed: true）
                  setConfirmed(true);
                }}
              >
                シフト確定
              </Button>
            )}
            <Button
              variant={generated ? 'secondary' : 'app-card-cta'}
              onClick={handleGenerate}
              disabled={confirmed}
            >
              {generated ? '再生成' : 'シフト生成'}
            </Button>
          </div>
        </div>

        {/* 警告サマリー */}
        {summary && summary.totalWarnings > 0 && (
          <div
            className="flex gap-3 mb-4 px-4 py-3 flex-wrap"
            style={{
              background: 'var(--red-pale)',
              borderRadius: '8px',
              border: '1px solid rgba(155,51,51,0.15)',
            }}
          >
            {summary.understaffedDays > 0 && (
              <Badge variant="error">人員不足 {summary.understaffedDays}日</Badge>
            )}
            {summary.noQualifiedDays > 0 && (
              <Badge variant="warning">有資格者不足 {summary.noQualifiedDays}日</Badge>
            )}
            <span className="text-xs" style={{ color: 'var(--red)' }}>
              セルをクリックして調整してください
            </span>
          </div>
        )}

        {/* グリッド */}
        {generated ? (
          <div className="flex flex-col h-full min-h-[500px]">
            <ShiftGrid
              year={2026}
              month={4}
              staff={MOCK_STAFF.map((s) => ({
                id: s.id,
                name: s.name,
                employment_type: s.employment_type,
                is_qualified: s.is_qualified,
              }))}
              cells={shiftCells}
              warnings={warnings}
              onCellClick={handleCellClick}
            />
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{
              background: 'var(--white)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <p className="text-base font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
              シフトが未生成です
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
              利用予定と休み希望を元にシフトを自動生成します
            </p>
            <Button variant="app-card-cta" onClick={handleGenerate}>
              シフト生成
            </Button>
          </div>
        )}
      </div>

      {/* セル編集モーダル */}
      <Modal
        isOpen={!!editingCell}
        onClose={() => setEditingCell(null)}
        title={
          editingCell && editingStaff
            ? `${editingStaff.name} — ${format(new Date(editingCell.date), 'M/d（E）', { locale: ja })}`
            : ''
        }
      >
        {editingCell && editingStaff && (
          <div className="flex flex-col gap-4">
            <div
              className="px-3 py-2"
              style={{ background: 'var(--bg)', borderRadius: '6px' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {editingStaff.name}
              </span>
              {editingStaff.is_qualified && (
                <Badge variant="success" >有資格</Badge>
              )}
            </div>

            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              現在: {editingCellData ? ({'normal': '出勤', 'public_holiday': '公休', 'paid_leave': '有給', 'off': '休み'} as Record<string, string>)[editingCellData.assignment_type] : '-'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(['normal', 'public_holiday', 'paid_leave', 'off'] as const).map((type) => {
                const labels: Record<ShiftAssignmentType, string> = {
                  normal: '出勤',
                  public_holiday: '公休',
                  paid_leave: '有給',
                  off: '休み',
                };
                const colors: Record<ShiftAssignmentType, string> = {
                  normal: 'var(--ink)',
                  public_holiday: 'var(--accent)',
                  paid_leave: 'var(--green)',
                  off: 'var(--ink-3)',
                };
                const isActive = editType === type;

                return (
                  <button
                    key={type}
                    onClick={() => setEditType(type)}
                    className="px-4 py-3 text-sm font-semibold rounded-md transition-all"
                    style={{
                      background: isActive ? colors[type] : 'var(--bg)',
                      color: isActive ? '#fff' : colors[type],
                      border: `1.5px solid ${colors[type]}`,
                    }}
                  >
                    {labels[type]}
                  </button>
                );
              })}
            </div>

            {editType === 'normal' && (
              <div className="flex flex-col gap-4 mt-2 p-4 rounded-lg" style={{ background: 'var(--bg)' }}>
                <div>
                  <label className="text-xs font-bold mb-2 block" style={{ color: 'var(--ink-2)' }}>勤務時間</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={startH}
                      onChange={(e) => setStartH(e.target.value.slice(0,2))}
                      className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none"
                    />
                    <span className="font-bold">:</span>
                    <input
                      type="text"
                      value={startM}
                      onChange={(e) => setStartM(e.target.value.slice(0,2))}
                      className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none"
                    />
                    <span className="mx-2 text-gray-400">〜</span>
                    <input
                      type="text"
                      value={endH}
                      onChange={(e) => setEndH(e.target.value.slice(0,2))}
                      className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none"
                    />
                    <span className="font-bold">:</span>
                    <input
                      type="text"
                      value={endM}
                      onChange={(e) => setEndM(e.target.value.slice(0,2))}
                      className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingCell(null)}>
                キャンセル
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>
                保存する
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
