'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type {
  GradeType,
  ChildRow,
  ChildTransportPatternRow,
  PickupMethod,
  DropoffMethod,
  TenantSettings,
} from '@/types';
import { getDefaultPickupTimeByGrade } from '@/lib/utils/parseChildName';

/**
 * 児童管理ページ（admin・editor）
 * Supabase 連携 + エリア種類はテナント設定から取得
 */

type PatternItem = {
  id?: string;
  pattern_name: string;
  pickup_location: string;
  pickup_time: string;
  pickup_method: PickupMethod;
  dropoff_location: string;
  dropoff_time: string;
  dropoff_method: DropoffMethod;
  area_label: string;
};

type EditableChild = {
  id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  parent_contact: string | null;
  patterns: PatternItem[];
  isNew?: boolean;
};

const GRADE_LABELS: Record<GradeType, string> = {
  preschool: '未就学', elementary_1: '小1', elementary_2: '小2', elementary_3: '小3',
  elementary_4: '小4', elementary_5: '小5', elementary_6: '小6', junior_high: '中学',
};

const PATTERN_PRESETS = ['保育園', '自宅', '学校（通常）', '学校（短縮）', 'おけいこ', '休み'];
const METHOD_LABELS = { pickup: 'お迎え', self: '自分で', parent: '保護者' };
const METHOD_LABELS_DROP = { dropoff: '送り', self: '自分で帰る', parent: '保護者' };

const emptyPattern = (): PatternItem => ({
  pattern_name: '',
  pickup_location: '',
  pickup_time: '14:00',
  pickup_method: 'pickup',
  dropoff_location: '',
  dropoff_time: '16:00',
  dropoff_method: 'dropoff',
  area_label: '',
});

export default function ChildrenSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [patterns, setPatterns] = useState<ChildTransportPatternRow[]>([]);
  const [areaLabels, setAreaLabels] = useState<string[]>([]);
  const [editing, setEditing] = useState<EditableChild | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch('/api/children'),
        fetch('/api/tenant'),
      ]);
      if (!cRes.ok) throw new Error('児童の取得に失敗しました');
      const cJson = await cRes.json();
      setChildren(cJson.children ?? []);
      setPatterns(cJson.patterns ?? []);
      if (tRes.ok) {
        const { tenant } = await tRes.json();
        const s: TenantSettings = tenant?.settings ?? {};
        setAreaLabels((s.transport_areas ?? []).map((a) => `${a.emoji} ${a.name}`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAdd = () => {
    setEditing({
      id: `new-${Date.now()}`,
      name: '',
      grade_type: 'elementary_1',
      is_active: true,
      parent_contact: null,
      patterns: [emptyPattern()],
      isNew: true,
    });
  };

  const handleEdit = (child: ChildRow) => {
    const childPatterns = patterns
      .filter((p) => p.child_id === child.id)
      .map<PatternItem>((p) => ({
        id: p.id,
        pattern_name: p.pattern_name,
        pickup_location: p.pickup_location ?? '',
        pickup_time: p.pickup_time ?? '14:00',
        pickup_method: p.pickup_method,
        dropoff_location: p.dropoff_location ?? '',
        dropoff_time: p.dropoff_time ?? '16:00',
        dropoff_method: p.dropoff_method,
        area_label: p.area_label ?? '',
      }));
    setEditing({
      id: child.id,
      name: child.name,
      grade_type: child.grade_type,
      is_active: child.is_active,
      parent_contact: child.parent_contact,
      patterns: childPatterns.length > 0 ? childPatterns : [emptyPattern()],
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.name) return;
    setSaving(true);
    setError('');
    try {
      let childId = editing.id;
      if (editing.isNew) {
        const res = await fetch('/api/children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name,
            grade_type: editing.grade_type,
            is_active: editing.is_active,
            parent_contact: editing.parent_contact,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '作成失敗');
        const { child } = await res.json();
        childId = child.id;
      } else {
        const res = await fetch(`/api/children/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name,
            grade_type: editing.grade_type,
            is_active: editing.is_active,
            parent_contact: editing.parent_contact,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '更新失敗');
      }

      /* パターン一括置換 */
      const pRes = await fetch(`/api/children/${childId}/patterns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns: editing.patterns }),
      });
      if (!pRes.ok) throw new Error((await pRes.json()).error ?? 'パターン保存失敗');

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
    if (!confirm(`${editing.name} を削除しますか？`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/children/${editing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除失敗');
      setEditing(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除失敗');
    } finally {
      setSaving(false);
    }
  };

  const updatePattern = (index: number, field: keyof PatternItem, value: string) => {
    if (!editing) return;
    const ps = [...editing.patterns];
    ps[index] = { ...ps[index], [field]: value };
    setEditing({ ...editing, patterns: ps });
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', color: 'var(--ink)',
    border: '1px solid var(--rule)', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.85rem',
  };

  const smallInput: React.CSSProperties = { ...inputStyle, padding: '6px 8px', fontSize: '0.8rem' };

  if (loading) {
    return (
      <>
        <Header title="児童管理" />
        <div className="p-6" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
      </>
    );
  }

  const activeCount = children.filter((c) => c.is_active).length;

  return (
    <>
      <Header title="児童管理" />

      <div className="p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>児童一覧</h2>
            <Badge variant="info">{activeCount}名（有効）</Badge>
          </div>
          <Button variant="primary" onClick={handleAdd}>+ 児童追加</Button>
        </div>

        {error && (
          <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['氏名', '学年', 'パターン数', 'ステータス'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center" style={{ color: 'var(--ink-3)' }}>
                    児童が登録されていません
                  </td>
                </tr>
              )}
              {children.map((c) => {
                const count = patterns.filter((p) => p.child_id === c.id).length;
                return (
                  <tr key={c.id} className="hover:bg-[var(--accent-pale)] cursor-pointer" onClick={() => handleEdit(c)}>
                    <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>{c.name}</td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                      <Badge variant="info">{GRADE_LABELS[c.grade_type]}</Badge>
                    </td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                      {count}パターン
                    </td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                      <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? '有効' : '無効'}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.isNew ? '児童追加' : `${editing?.name} の設定`} size="lg">
        {editing && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>氏名</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>学年</label>
                <select
                  value={editing.grade_type}
                  onChange={(e) => {
                    const newGrade = e.target.value as GradeType;
                    const defaultTime = getDefaultPickupTimeByGrade(newGrade);
                    const updatedPatterns = editing.patterns.map((p) =>
                      p.pickup_time === getDefaultPickupTimeByGrade(editing.grade_type) || !p.pickup_time
                        ? { ...p, pickup_time: defaultTime }
                        : p
                    );
                    setEditing({ ...editing, grade_type: newGrade, patterns: updatedPatterns });
                  }}
                  className="outline-none"
                  style={inputStyle}
                >
                  {Object.entries(GRADE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} id="active" />
                <label htmlFor="active" className="text-sm" style={{ color: 'var(--ink-2)' }}>有効</label>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>保護者連絡先（任意）</label>
              <input
                type="text"
                value={editing.parent_contact ?? ''}
                onChange={(e) => setEditing({ ...editing, parent_contact: e.target.value })}
                className="outline-none"
                style={inputStyle}
                placeholder="090-xxxx-xxxx"
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  送迎パターン（{editing.patterns.length}件）
                </label>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>最大5パターン</span>
              </div>

              {editing.patterns.map((p, i) => (
                <div
                  key={i}
                  className="p-3"
                  style={{ background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--rule)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={p.pattern_name}
                      onChange={(e) => updatePattern(i, 'pattern_name', e.target.value)}
                      className="outline-none flex-1"
                      style={smallInput}
                    >
                      <option value="">区分を選択</option>
                      {PATTERN_PRESETS.map((pr) => (<option key={pr} value={pr}>{pr}</option>))}
                    </select>
                    <select
                      value={p.area_label}
                      onChange={(e) => updatePattern(i, 'area_label', e.target.value)}
                      className="outline-none"
                      style={smallInput}
                    >
                      <option value="">エリア</option>
                      {areaLabels.map((a) => (<option key={a} value={a}>{a}</option>))}
                    </select>
                    <button
                      onClick={() => setEditing({ ...editing, patterns: editing.patterns.filter((_, j) => j !== i) })}
                      className="text-xs px-2 py-1 rounded hover:bg-[var(--red-pale)]"
                      style={{ color: 'var(--red)' }}
                    >
                      削除
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded flex-wrap"
                      style={{ background: 'var(--accent-pale)', border: '1px solid rgba(26,62,184,0.1)' }}
                    >
                      <span className="text-xs font-bold shrink-0" style={{ color: 'var(--accent)' }}>迎🚗←</span>
                      {p.area_label && <span className="text-xs shrink-0">{p.area_label.split(' ')[0]}</span>}
                      <input type="text" value={p.pickup_location} onChange={(e) => updatePattern(i, 'pickup_location', e.target.value)} placeholder="場所" className="outline-none w-16 text-xs bg-transparent" style={{ color: 'var(--ink)' }} />
                      <span className="text-xs" style={{ color: 'var(--ink-3)' }}>-</span>
                      <input type="time" value={p.pickup_time} onChange={(e) => updatePattern(i, 'pickup_time', e.target.value)} className="outline-none text-xs bg-transparent w-20" style={{ color: 'var(--ink)' }} />
                      <select value={p.pickup_method} onChange={(e) => updatePattern(i, 'pickup_method', e.target.value)} className="outline-none text-xs bg-transparent" style={{ color: 'var(--accent)' }}>
                        {Object.entries(METHOD_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                      </select>
                    </div>

                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded flex-wrap"
                      style={{ background: 'var(--green-pale)', border: '1px solid rgba(42,122,82,0.1)' }}
                    >
                      <span className="text-xs font-bold shrink-0" style={{ color: 'var(--green)' }}>送🚗→</span>
                      {p.area_label && <span className="text-xs shrink-0">{p.area_label.split(' ')[0]}</span>}
                      <input type="text" value={p.dropoff_location} onChange={(e) => updatePattern(i, 'dropoff_location', e.target.value)} placeholder="場所" className="outline-none w-16 text-xs bg-transparent" style={{ color: 'var(--ink)' }} />
                      <span className="text-xs" style={{ color: 'var(--ink-3)' }}>-</span>
                      <input type="time" value={p.dropoff_time} onChange={(e) => updatePattern(i, 'dropoff_time', e.target.value)} className="outline-none text-xs bg-transparent w-20" style={{ color: 'var(--ink)' }} />
                      <select value={p.dropoff_method} onChange={(e) => updatePattern(i, 'dropoff_method', e.target.value)} className="outline-none text-xs bg-transparent" style={{ color: 'var(--green)' }}>
                        {Object.entries(METHOD_LABELS_DROP).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              {editing.patterns.length < 5 && (
                <Button
                  variant="secondary"
                  onClick={() => setEditing({ ...editing, patterns: [...editing.patterns, emptyPattern()] })}
                >
                  + パターン追加
                </Button>
              )}
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
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
