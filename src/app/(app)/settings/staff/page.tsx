'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type {
  StaffRole,
  EmploymentType,
  StaffRow,
  TenantSettings,
  AreaLabel,
  QualificationType,
} from '@/types';

/**
 * 職員管理ページ（admin専用）
 * Supabase 接続 + 招待メール送信対応
 */

const ROLE_LABELS: Record<StaffRole, string> = { admin: '管理者', editor: '編集者', viewer: '閲覧者' };
const EMPLOYMENT_LABELS: Record<EmploymentType, string> = { full_time: '常勤', part_time: 'パート' };

type EditableStaff = Omit<StaffRow, 'tenant_id' | 'user_id' | 'created_at'> & { isNew?: boolean };

const emptyStaff = (): EditableStaff => ({
  id: `new-${Date.now()}`,
  name: '',
  email: '',
  role: 'admin',
  employment_type: 'part_time',
  default_start_time: '09:00',
  default_end_time: '17:00',
  transport_areas: [],
  qualifications: [],
  is_qualified: false,
  isNew: true,
});

export default function StaffSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [areas, setAreas] = useState<AreaLabel[]>([]);
  const [qualificationTypes, setQualificationTypes] = useState<QualificationType[]>([]);
  const [editing, setEditing] = useState<EditableStaff | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch('/api/staff'),
        fetch('/api/tenant'),
      ]);
      if (!sRes.ok) throw new Error('職員の取得に失敗しました');
      if (!tRes.ok) throw new Error('テナント情報の取得に失敗しました');
      const { staff } = await sRes.json();
      const { tenant } = await tRes.json();
      setStaffList(staff ?? []);
      const s: TenantSettings = tenant?.settings ?? {};
      setAreas(s.transport_areas ?? []);
      setQualificationTypes(s.qualification_types ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const countable = qualificationTypes.filter((q) => q.countable).map((q) => q.name);
  const areaLabels = areas.map((a) => `${a.emoji} ${a.name}`);

  const handleAdd = () => setEditing(emptyStaff());
  const handleEdit = (s: StaffRow) => {
    setEditing({
      id: s.id,
      name: s.name,
      email: s.email ?? '',
      role: s.role,
      employment_type: s.employment_type,
      default_start_time: s.default_start_time ?? '09:00',
      default_end_time: s.default_end_time ?? '17:00',
      transport_areas: s.transport_areas,
      qualifications: s.qualifications,
      is_qualified: s.is_qualified,
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.name) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (editing.isNew) {
        /* 新規 = 招待メール送信 */
        const res = await fetch('/api/staff/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name,
            email: editing.email,
            role: editing.role,
            employment_type: editing.employment_type,
            default_start_time: editing.default_start_time,
            default_end_time: editing.default_end_time,
            transport_areas: editing.transport_areas,
            is_qualified: editing.is_qualified,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '追加失敗');
        setInfo(json.warning ?? '招待メールを送信しました');
      } else {
        /* 既存 = 更新 */
        const res = await fetch(`/api/staff/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name,
            email: editing.email,
            role: editing.role,
            employment_type: editing.employment_type,
            default_start_time: editing.default_start_time,
            default_end_time: editing.default_end_time,
            transport_areas: editing.transport_areas,
            qualifications: editing.qualifications,
            is_qualified: editing.is_qualified,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? '更新失敗');
        }
        setInfo('更新しました');
      }
      setEditing(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing || editing.isNew) return;
    if (!confirm(`${editing.name} を削除しますか？（元に戻せません）`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${editing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除失敗');
      setEditing(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <>
        <Header title="職員管理" />
        <div className="p-6" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <Header title="職員管理" />

      <div className="p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>職員一覧</h2>
            <Badge variant="info">{staffList.length}名</Badge>
          </div>
          <Button variant="primary" onClick={handleAdd}>+ 職員を招待</Button>
        </div>

        {error && (
          <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {info && (
          <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--green-pale)', color: 'var(--green)', fontSize: '0.85rem' }}>
            {info}
          </div>
        )}

        <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['氏名', 'メール', 'ロール', '雇用', '勤務時間', '対応エリア', '資格'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--ink-3)' }}>
                    職員が登録されていません
                  </td>
                </tr>
              )}
              {staffList.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--accent-pale)] transition-colors cursor-pointer" onClick={() => handleEdit(s)}>
                  <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>
                    {s.name}
                    {!s.user_id && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--gold)' }}>未ログイン</span>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)' }}>
                    {s.email}
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
                    {s.default_start_time ?? '-'}〜{s.default_end_time ?? '-'}
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
                              background: countable.includes(q) ? 'var(--green-pale)' : 'var(--bg)',
                              color: countable.includes(q) ? 'var(--green)' : 'var(--ink-3)',
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? '職員を招待' : `${editing?.name} を編集`}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>氏名</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>メール</label>
                <input
                  type="email"
                  value={editing.email ?? ''}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  className="outline-none"
                  style={inputStyle}
                  disabled={!editing.isNew}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>出勤時間</label>
                <input type="time" value={editing.default_start_time ?? ''} onChange={(e) => setEditing({ ...editing, default_start_time: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>退勤時間</label>
                <input type="time" value={editing.default_end_time ?? ''} onChange={(e) => setEditing({ ...editing, default_end_time: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>対応エリア</label>
              <div className="flex flex-wrap gap-2">
                {areaLabels.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    （テナント設定でエリアを追加してください）
                  </p>
                )}
                {areaLabels.map((area) => (
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
                {qualificationTypes.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    （テナント設定で資格種類を追加してください）
                  </p>
                )}
                {qualificationTypes.map((q) => {
                  const has = editing.qualifications.includes(q.name);
                  return (
                    <button
                      key={q.name}
                      type="button"
                      onClick={() => {
                        const updated = has
                          ? editing.qualifications.filter((n) => n !== q.name)
                          : [...editing.qualifications, q.name];
                        const isQualified = updated.some((n) => countable.includes(n));
                        setEditing({ ...editing, qualifications: updated, is_qualified: isQualified });
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                      style={{
                        background: has ? (q.countable ? 'var(--green)' : 'var(--ink-3)') : 'var(--bg)',
                        color: has ? '#fff' : (q.countable ? 'var(--green)' : 'var(--ink-3)'),
                        border: `1px solid ${has ? (q.countable ? 'var(--green)' : 'var(--ink-3)') : 'var(--rule)'}`,
                      }}
                    >
                      {q.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between gap-2 mt-2">
              <div>
                {!editing.isNew && (
                  <Button variant="secondary" onClick={handleDelete} disabled={saving}>
                    <span style={{ color: 'var(--red)' }}>削除</span>
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>キャンセル</Button>
                <Button variant="primary" onClick={handleSave} disabled={!editing.name || saving}>
                  {saving ? '処理中...' : editing.isNew ? '招待を送信' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
