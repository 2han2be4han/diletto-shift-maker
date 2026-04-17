'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import Header from '@/components/layout/Header';
import ShiftGrid from '@/components/shift/ShiftGrid';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { generateShiftAssignments } from '@/lib/logic/generateShift';
import ApprovalQueue from '@/components/shift/ApprovalQueue';
import type {
  ShiftAssignmentType,
  StaffRow,
  ShiftAssignmentRow,
  ShiftRequestRow,
  ScheduleEntryRow,
  StaffRole,
} from '@/types';

/**
 * シフト表ページ（Supabase 接続）
 * - staff, schedule_entries, shift_requests を DB から取得
 * - 生成 → DB に upsert
 * - セル編集 → DB 更新
 * - 確定 → is_confirmed: true
 */

/** Phase 25: URL ?month=YYYY-MM。デフォルトは来月 */
function defaultNextMonthStr(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

type ShiftCell = {
  staff_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  assignment_type: ShiftAssignmentType;
};

type Warning = { date: string; type: 'understaffed' | 'no_qualified' | 'overworked'; message: string };

export default function ShiftPage() {
  const searchParams = useSearchParams();
  const urlMonth = searchParams.get('month');
  const { year, month } = useMemo(() => {
    const source = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : defaultNextMonthStr();
    const [y, m] = source.split('-').map(Number);
    return { year: y, month: m };
  }, [urlMonth]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntryRow[]>([]);
  const [shiftRequests, setShiftRequests] = useState<ShiftRequestRow[]>([]);
  const [cells, setCells] = useState<ShiftCell[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const [editingCell, setEditingCell] = useState<{ staffId: string; date: string } | null>(null);
  /* Phase 26: 確定済シフトでも「編集モード」ON でセル編集可能にする */
  const [editMode, setEditMode] = useState(false);

  /* Phase 25: 自分の role と出勤中admin判定（承認UI表示用） */
  const [myRole, setMyRole] = useState<StaffRole | null>(null);
  const [onDutyAdmin, setOnDutyAdmin] = useState(false);

  useEffect(() => {
    void fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        setMyRole(d.staff?.role ?? null);
        setOnDutyAdmin(Boolean(d.on_duty_admin));
      })
      .catch(() => {});
  }, []);

  /* カバレッジ判定用: 日付 → 児童数（schedule_entries から日別カウント） */
  const childrenCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of scheduleEntries) {
      m.set(e.date, (m.get(e.date) ?? 0) + 1);
    }
    return m;
  }, [scheduleEntries]);
  const [editType, setEditType] = useState<ShiftAssignmentType>('normal');
  const [startH, setStartH] = useState('09');
  const [startM, setStartM] = useState('00');
  const [endH, setEndH] = useState('17');
  const [endM, setEndM] = useState('00');

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${monthStr}-01`;
      const lastDay = getDaysInMonth(new Date(year, month - 1));
      const to = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const [sRes, eRes, rRes, aRes] = await Promise.all([
        fetch('/api/staff'),
        fetch(`/api/schedule-entries?from=${from}&to=${to}`),
        fetch(`/api/shift-requests?month=${monthStr}`),
        fetch(`/api/shift-assignments?from=${from}&to=${to}`),
      ]);

      if (!sRes.ok) throw new Error('職員取得失敗');
      if (!eRes.ok) throw new Error('利用予定取得失敗');

      const { staff: sArr } = await sRes.json();
      const { entries } = await eRes.json();
      const rJson = rRes.ok ? await rRes.json() : { requests: [] };
      const aJson = aRes.ok ? await aRes.json() : { assignments: [] };

      setStaff(sArr ?? []);
      setScheduleEntries(entries ?? []);
      setShiftRequests(rJson.requests ?? []);
      const assigns: ShiftAssignmentRow[] = aJson.assignments ?? [];
      setCells(
        assigns.map<ShiftCell>((a) => ({
          staff_id: a.staff_id,
          date: a.date,
          start_time: a.start_time,
          end_time: a.end_time,
          assignment_type: a.assignment_type,
        }))
      );
      setConfirmed(assigns.some((a) => a.is_confirmed));
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [year, month, monthStr]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleGenerate = async () => {
    const result = generateShiftAssignments({
      tenantId: staff[0]?.tenant_id ?? '',
      year,
      month,
      staff,
      shiftRequests,
      scheduleEntries,
    });
    /* DB に upsert */
    try {
      const res = await fetch('/api/shift-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: result.assignments.map((a) => ({
            staff_id: a.staff_id,
            date: a.date,
            start_time: a.start_time,
            end_time: a.end_time,
            assignment_type: a.assignment_type,
            is_confirmed: false,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失敗');
      setWarnings(result.warnings);
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : '生成失敗');
    }
  };

  const handleConfirm = async () => {
    if (!confirm(`${year}年${month}月のシフトを確定しますか？（確定後も「編集モード」で個別修正できます）`)) return;
    try {
      const res = await fetch('/api/shift-assignments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, confirmed: true }),
      });
      if (!res.ok) throw new Error('確定失敗');
      setEditMode(false);
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : '確定失敗');
    }
  };

  /* Phase 26: 確定解除（確定済みシフトを未確定に戻す） */
  const handleUnconfirm = async () => {
    if (!confirm(`${year}年${month}月のシフトを未確定に戻しますか？`)) return;
    try {
      const res = await fetch('/api/shift-assignments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, confirmed: false }),
      });
      if (!res.ok) throw new Error('確定解除失敗');
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : '確定解除失敗');
    }
  };

  /* 再生成前ガード: 確定済みの場合は必ず確認 */
  const handleGenerateWithGuard = async () => {
    if (confirmed) {
      alert('確定済みシフトは再生成できません。先に「確定解除」してから再生成してください。');
      return;
    }
    if (cells.length > 0) {
      if (!confirm(`${year}年${month}月のシフトを再生成しますか？（未確定のセルは上書きされます）`)) return;
    }
    await handleGenerate();
  };

  const handleCellClick = (staffId: string, date: string) => {
    /* Phase 26: 確定済みは editMode=true のときだけ編集可能 */
    if (confirmed && !editMode) return;
    const cell = cells.find((c) => c.staff_id === staffId && c.date === date);
    const s = staff.find((x) => x.id === staffId);
    if (cell) {
      setEditType(cell.assignment_type);
      if (cell.start_time) {
        const [h, m] = cell.start_time.split(':');
        setStartH(h); setStartM(m);
      } else {
        setStartH(s?.default_start_time?.split(':')[0] ?? '09');
        setStartM(s?.default_start_time?.split(':')[1] ?? '00');
      }
      if (cell.end_time) {
        const [h, m] = cell.end_time.split(':');
        setEndH(h); setEndM(m);
      } else {
        setEndH(s?.default_end_time?.split(':')[0] ?? '17');
        setEndM(s?.default_end_time?.split(':')[1] ?? '00');
      }
    } else {
      setEditType('normal');
    }
    setEditingCell({ staffId, date });
  };

  const handleSave = async () => {
    if (!editingCell) return;
    try {
      const res = await fetch('/api/shift-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: [{
            staff_id: editingCell.staffId,
            date: editingCell.date,
            assignment_type: editType,
            start_time: editType === 'normal' ? `${startH}:${startM}` : null,
            end_time: editType === 'normal' ? `${endH}:${endM}` : null,
            is_confirmed: confirmed,
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失敗');
      setEditingCell(null);
      await fetchAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失敗');
    }
  };

  const editingStaff = editingCell ? staff.find((s) => s.id === editingCell.staffId) : null;
  const editingCellData = editingCell
    ? cells.find((c) => c.staff_id === editingCell.staffId && c.date === editingCell.date)
    : null;

  const summary = useMemo(() => {
    if (cells.length === 0) return null;
    const understaffedDays = warnings.filter((w) => w.type === 'understaffed').length;
    const noQualifiedDays = warnings.filter((w) => w.type === 'no_qualified').length;
    return { understaffedDays, noQualifiedDays, totalWarnings: warnings.length };
  }, [cells, warnings]);

  /* Phase 26: ヘッダー右側のアクション（再生成 / シフト確定 / 編集モード切替） */
  const headerActions = (
    <div className="flex items-center gap-2">
      {cells.length > 0 && !confirmed && (
        <Button variant="secondary" onClick={handleGenerateWithGuard}>再生成</Button>
      )}
      {cells.length > 0 && !confirmed && (
        <Button variant="primary" onClick={handleConfirm}>シフト確定</Button>
      )}
      {confirmed && (
        <>
          <Button
            variant={editMode ? 'primary' : 'secondary'}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '編集モード: ON' : '編集モード'}
          </Button>
          <Button variant="secondary" onClick={handleUnconfirm}>確定解除</Button>
        </>
      )}
      {cells.length === 0 && (
        <Button variant="app-card-cta" onClick={handleGenerate} disabled={staff.length === 0 || scheduleEntries.length === 0}>
          シフト生成
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="シフト表" showMonthSelector actions={headerActions} />

      <div className="flex-1 overflow-auto p-6">
        {/* Phase 25: admin のみ承認キュー表示。出勤中でないと承認ボタン非活性 */}
        {myRole === 'admin' && (
          <ApprovalQueue staff={staff} canApprove={onDutyAdmin} />
        )}

        {/* Phase 26: h2 年月 + 再生成/確定ボタンは Header actions に移設済。ここはバッジのみ。 */}
        <div className="flex items-center mb-4 flex-wrap gap-2">
          {confirmed && !editMode && <Badge variant="success">確定済み</Badge>}
          {confirmed && editMode && <Badge variant="warning">編集中（確定済みを変更しています）</Badge>}
          {cells.length > 0 && !confirmed && <Badge variant="warning">未確定</Badge>}
        </div>

        {error && (
          <div className="mb-2 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {summary && summary.totalWarnings > 0 && (
          <div
            className="flex gap-3 mb-4 px-4 py-3 flex-wrap"
            style={{ background: 'var(--red-pale)', borderRadius: '8px', border: '1px solid rgba(155,51,51,0.15)' }}
          >
            {summary.understaffedDays > 0 && <Badge variant="error">人員不足 {summary.understaffedDays}日</Badge>}
            {summary.noQualifiedDays > 0 && <Badge variant="warning">有資格者不足 {summary.noQualifiedDays}日</Badge>}
            <span className="text-xs" style={{ color: 'var(--red)' }}>セルをクリックして調整してください</span>
          </div>
        )}

        {loading ? (
          <div className="h-96 flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)' }}>
            読み込み中...
          </div>
        ) : cells.length > 0 ? (
          <div className="flex flex-col h-full min-h-[500px]">
            <ShiftGrid
              year={year}
              month={month}
              staff={staff.map((s) => ({
                id: s.id,
                name: s.name,
                employment_type: s.employment_type,
                is_qualified: s.is_qualified,
              }))}
              cells={cells}
              warnings={warnings}
              onCellClick={handleCellClick}
              childrenCountByDate={childrenCountByDate}
            />
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <p className="text-base font-medium mb-2" style={{ color: 'var(--ink-2)' }}>シフトが未生成です</p>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
              利用予定と休み希望を元にシフトを自動生成します
            </p>
            <Button variant="app-card-cta" onClick={handleGenerate} disabled={staff.length === 0 || scheduleEntries.length === 0}>
              シフト生成
            </Button>
            {(staff.length === 0 || scheduleEntries.length === 0) && (
              <p className="text-xs mt-3" style={{ color: 'var(--red)' }}>
                ※ 職員と利用予定が登録されている必要があります
              </p>
            )}
          </div>
        )}
      </div>

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
            <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'var(--bg)', borderRadius: '6px' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{editingStaff.name}</span>
              {editingStaff.is_qualified && <Badge variant="success">有資格</Badge>}
            </div>

            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              現在: {editingCellData ? ({ normal: '出勤', public_holiday: '公休', paid_leave: '有給', off: '休み' } as Record<string, string>)[editingCellData.assignment_type] : '-'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(['normal', 'public_holiday', 'paid_leave', 'off'] as const).map((type) => {
                const labels: Record<ShiftAssignmentType, string> = { normal: '出勤', public_holiday: '公休', paid_leave: '有給', off: '休み' };
                const colors: Record<ShiftAssignmentType, string> = { normal: 'var(--ink)', public_holiday: 'var(--accent)', paid_leave: 'var(--green)', off: 'var(--ink-3)' };
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
                    <input type="text" value={startH} onChange={(e) => setStartH(e.target.value.slice(0,2))} className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none" />
                    <span className="font-bold">:</span>
                    <input type="text" value={startM} onChange={(e) => setStartM(e.target.value.slice(0,2))} className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none" />
                    <span className="mx-2 text-gray-400">〜</span>
                    <input type="text" value={endH} onChange={(e) => setEndH(e.target.value.slice(0,2))} className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none" />
                    <span className="font-bold">:</span>
                    <input type="text" value={endM} onChange={(e) => setEndM(e.target.value.slice(0,2))} className="w-12 text-center font-bold text-lg bg-transparent border-b-2 border-[var(--accent)] outline-none" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingCell(null)}>キャンセル</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>保存する</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
