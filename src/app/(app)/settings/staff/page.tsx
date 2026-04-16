'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { StaffRole, EmploymentType } from '@/types';

/**
 * 職員管理ページ（admin専用）
 * - 職員一覧テーブル
 * - 追加・編集モーダル
 * - 氏名・メール・ロール・雇用形態・勤務時間・対応エリア・有資格
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

type StaffItem = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  employment_type: EmploymentType;
  default_start_time: string;
  default_end_time: string;
  transport_areas: string[];
  qualifications: string[]; // 資格名の配列
  is_qualified: boolean; // カウント対象資格を1つ以上持つか（自動計算）
};

const QUALIFICATION_OPTIONS = [
  { name: '保育士', countable: true },
  { name: '幼稚園教諭', countable: true },
  { name: '児童指導員', countable: true },
  { name: '教師', countable: true },
  { name: '児童発達支援管理責任者', countable: false },
  { name: '専門職員', countable: false },
  { name: '加配加算', countable: false },
];

const COUNTABLE_QUALIFICATIONS = QUALIFICATION_OPTIONS.filter((q) => q.countable).map((q) => q.name);

const MOCK_AREAS = ['🍇 藤江', '🌳 豊明', '🏭 大府', '✈ 常滑', '🍶 学童'];

const INITIAL_STAFF: StaffItem[] = [
  { id: 's1', name: '金田', email: 'kaneda@example.com', role: 'admin', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🍇 藤江', '🌳 豊明'], qualifications: ['保育士'], is_qualified: true },
  { id: 's2', name: '加藤', email: 'kato@example.com', role: 'editor', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🍇 藤江', '🏭 大府'], qualifications: ['児童指導員'], is_qualified: true },
  { id: 's3', name: '鈴木', email: 'suzuki@example.com', role: 'editor', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🌳 豊明', '✈ 常滑'], qualifications: ['児童発達支援管理責任者'], is_qualified: false },
  { id: 's4', name: '田中', email: 'tanaka@example.com', role: 'editor', employment_type: 'full_time', default_start_time: '09:30', default_end_time: '17:30', transport_areas: ['🍇 藤江'], qualifications: [], is_qualified: false },
  { id: 's5', name: '佐藤', email: 'sato@example.com', role: 'viewer', employment_type: 'part_time', default_start_time: '10:00', default_end_time: '16:00', transport_areas: ['🌳 豊明'], qualifications: [], is_qualified: false },
  { id: 's6', name: '山本', email: 'yamamoto@example.com', role: 'editor', employment_type: 'full_time', default_start_time: '09:00', default_end_time: '17:00', transport_areas: ['🏭 大府', '✈ 常滑'], qualifications: ['保育士', '幼稚園教諭'], is_qualified: true },
];

const ROLE_LABELS: Record<StaffRole, string> = { admin: '管理者', editor: '編集者', viewer: '閲覧者' };
const EMPLOYMENT_LABELS: Record<EmploymentType, string> = { full_time: '常勤', part_time: 'パート' };

const emptyStaff = (): StaffItem => ({
  id: `s${Date.now()}`,
  name: '', email: '', role: 'editor', employment_type: 'full_time',
  default_start_time: '09:00', default_end_time: '17:00',
  transport_areas: [], qualifications: [], is_qualified: false,
});

export default function StaffSettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [staffList, setStaffList] = useState<StaffItem[]>(INITIAL_STAFF);
  const [editing, setEditing] = useState<StaffItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleAdd = () => {
    setEditing(emptyStaff());
    setIsNew(true);
  };

  const handleEdit = (staff: StaffItem) => {
    setEditing({ ...staff });
    setIsNew(false);
  };

  const handleSave = () => {
    if (!editing || !editing.name) return;
    if (isNew) {
      setStaffList([...staffList, editing]);
    } else {
      setStaffList(staffList.map((s) => (s.id === editing.id ? editing : s)));
    }
    setEditing(null);
  };

  const handleAreaToggle = (area: string) => {
    if (!editing) return;
    const has = editing.transport_areas.includes(area);
    setEditing({
      ...editing,
      transport_areas: has
        ? editing.transport_areas.filter((a) => a !== area)
        : [...editing.transport_areas, area],
    });
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', color: 'var(--ink)',
    border: '1px solid var(--rule)', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.9rem',
  };

  return (
    <>
      <Header title="職員管理" onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>職員一覧</h2>
            <Badge variant="info">{staffList.length}名</Badge>
          </div>
          <Button variant="primary" onClick={handleAdd}>+ 職員追加</Button>
        </div>

        {/* 職員テーブル */}
        <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['氏名', 'ロール', '雇用', '勤務時間', '対応エリア', '有資格', '操作'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--accent-pale)] transition-colors">
                  <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>
                    {s.name}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant={s.role === 'admin' ? 'error' : s.role === 'editor' ? 'info' : 'neutral'}>
                      {ROLE_LABELS[s.role]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {EMPLOYMENT_LABELS[s.employment_type]}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {s.default_start_time}〜{s.default_end_time}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {s.transport_areas.join('  ')}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', fontSize: '0.8rem' }}>
                    {s.qualifications.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.qualifications.map((q) => (
                          <span
                            key={q}
                            className="px-1.5 py-0.5 rounded text-xs"
                            style={{
                              background: COUNTABLE_QUALIFICATIONS.includes(q) ? 'var(--green-pale)' : 'var(--bg)',
                              color: COUNTABLE_QUALIFICATIONS.includes(q) ? 'var(--green)' : 'var(--ink-3)',
                              fontSize: '0.7rem',
                            }}
                          >
                            {q}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--ink-3)' }}>-</span>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <button
                      onClick={() => handleEdit(s)}
                      className="text-xs font-semibold px-2 py-1 rounded transition-colors hover:bg-[var(--accent-pale)]"
                      style={{ color: 'var(--accent)' }}
                    >
                      編集
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編集モーダル */}
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? '職員追加' : `${editing?.name} を編集`}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>氏名</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>メール</label>
                <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>ロール</label>
                <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as StaffRole })} className="outline-none" style={inputStyle}>
                  <option value="admin">管理者</option>
                  <option value="editor">編集者</option>
                  <option value="viewer">閲覧者</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>雇用形態</label>
                <select value={editing.employment_type} onChange={(e) => setEditing({ ...editing, employment_type: e.target.value as EmploymentType })} className="outline-none" style={inputStyle}>
                  <option value="full_time">常勤</option>
                  <option value="part_time">パート</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>出勤時間</label>
                <input type="time" value={editing.default_start_time} onChange={(e) => setEditing({ ...editing, default_start_time: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>退勤時間</label>
                <input type="time" value={editing.default_end_time} onChange={(e) => setEditing({ ...editing, default_end_time: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>対応エリア</label>
              <div className="flex flex-wrap gap-2">
                {MOCK_AREAS.map((area) => (
                  <button
                    key={area}
                    onClick={() => handleAreaToggle(area)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                    style={{
                      background: editing.transport_areas.includes(area) ? 'var(--accent)' : 'var(--bg)',
                      color: editing.transport_areas.includes(area) ? '#fff' : 'var(--ink-2)',
                      border: `1px solid ${editing.transport_areas.includes(area) ? 'var(--accent)' : 'var(--rule)'}`,
                    }}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>保有資格</label>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                緑=カウント対象 / グレー=配置基準外
              </p>
              <div className="flex flex-wrap gap-2">
                {QUALIFICATION_OPTIONS.map((q) => {
                  const has = editing.qualifications.includes(q.name);
                  return (
                    <button
                      key={q.name}
                      type="button"
                      onClick={() => {
                        const updated = has
                          ? editing.qualifications.filter((n) => n !== q.name)
                          : [...editing.qualifications, q.name];
                        const isQualified = updated.some((n) => COUNTABLE_QUALIFICATIONS.includes(n));
                        setEditing({ ...editing, qualifications: updated, is_qualified: isQualified });
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                      style={{
                        background: has
                          ? (q.countable ? 'var(--green)' : 'var(--ink-3)')
                          : 'var(--bg)',
                        color: has ? '#fff' : (q.countable ? 'var(--green)' : 'var(--ink-3)'),
                        border: `1px solid ${has
                          ? (q.countable ? 'var(--green)' : 'var(--ink-3)')
                          : 'var(--rule)'}`,
                      }}
                    >
                      {q.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
              <Button variant="primary" onClick={handleSave} disabled={!editing.name}>保存</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
