'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type {
  GradeType,
  ChildRow,
  TenantSettings,
  AreaLabel,
} from '@/types';
import { GRADE_LABELS } from '@/lib/utils/parseChildName';

/**
 * 児童管理ページ（admin・editor）
 * 送迎表への反映はテナント共通マーク + この児童専用エリアの選択で完結する。
 */

type EditableChild = {
  id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  parent_contact: string | null;
  home_address: string | null;
  /** 利用可能なお迎えマーク（複数選択） */
  pickup_area_labels: string[];
  /** 利用可能なお送りマーク（複数選択） */
  dropoff_area_labels: string[];
  /** この児童専用の迎えエリア候補（イレギュラー用） */
  custom_pickup_areas: AreaLabel[];
  /** この児童専用の送りエリア候補（イレギュラー用） */
  custom_dropoff_areas: AreaLabel[];
  isNew?: boolean;
};

/**
 * 学年カテゴリ別の行背景（うっすら）
 */
function getGradeRowBg(grade: GradeType): string {
  switch (grade) {
    case 'preschool':
      return 'rgba(26,62,184,0.12)';
    case 'nursery_3':
    case 'nursery_4':
    case 'nursery_5':
      return 'rgba(155,51,51,0.12)';
    default:
      return 'rgba(42,122,82,0.12)';
  }
}

/** "🐻 幼稚部" 形式の label を返す */
const formatAreaLabel = (a: AreaLabel): string => `${a.emoji} ${a.name}`;

export default function ChildrenSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);
  const [editing, setEditing] = useState<EditableChild | null>(null);
  const [draggingChildIdx, setDraggingChildIdx] = useState<number | null>(null);
  const [dragOverChildIdx, setDragOverChildIdx] = useState<number | null>(null);

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
      if (tRes.ok) {
        const { tenant } = await tRes.json();
        const s: TenantSettings = tenant?.settings ?? {};
        setPickupAreas(s.pickup_areas ?? s.transport_areas ?? []);
        setDropoffAreas(s.dropoff_areas ?? []);
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

  /* /settings/children?child=<id> で来た場合、対象児童を自動で編集モーダルに開く */
  useEffect(() => {
    if (loading || children.length === 0) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const childParam = params.get('child');
    if (!childParam || editing) return;
    const target = children.find((c) => c.id === childParam);
    if (target) handleEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, children]);


  const handleAdd = () => {
    setEditing({
      id: `new-${Date.now()}`,
      name: '',
      grade_type: 'elementary_1',
      is_active: true,
      parent_contact: null,
      home_address: null,
      pickup_area_labels: [],
      dropoff_area_labels: [],
      custom_pickup_areas: [],
      custom_dropoff_areas: [],
      isNew: true,
    });
  };

  const handleEdit = (child: ChildRow) => {
    setEditing({
      id: child.id,
      name: child.name,
      grade_type: child.grade_type,
      is_active: child.is_active,
      parent_contact: child.parent_contact,
      home_address: child.home_address,
      pickup_area_labels: child.pickup_area_labels ?? [],
      dropoff_area_labels: child.dropoff_area_labels ?? [],
      custom_pickup_areas: Array.isArray(child.custom_pickup_areas) ? child.custom_pickup_areas : [],
      custom_dropoff_areas: Array.isArray(child.custom_dropoff_areas) ? child.custom_dropoff_areas : [],
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.name) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: editing.name,
        grade_type: editing.grade_type,
        is_active: editing.is_active,
        parent_contact: editing.parent_contact,
        home_address: editing.home_address,
        pickup_area_labels: editing.pickup_area_labels,
        dropoff_area_labels: editing.dropoff_area_labels,
        custom_pickup_areas: editing.custom_pickup_areas,
        custom_dropoff_areas: editing.custom_dropoff_areas,
      };
      if (editing.isNew) {
        const res = await fetch('/api/children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '作成失敗');
      } else {
        const res = await fetch(`/api/children/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '更新失敗');
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

  /** 児童の並び替え: ドラッグ完了時に配列を splice → display_order を 0,1,2... で再採番 → API */
  const handleReorderChildren = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= children.length || to >= children.length) return;
    const next = [...children];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setChildren(next);
    try {
      const orders = next.map((c, idx) => ({ id: c.id, display_order: idx }));
      const res = await fetch('/api/children/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? '並び替え保存失敗');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '並び替えに失敗しました');
      await fetchAll();
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', color: 'var(--ink)',
    border: '1px solid var(--rule)', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.85rem',
  };

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
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>児童一覧</h2>
            <Badge variant="info">{activeCount}名（在籍）</Badge>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/settings/tenant"
              className="text-xs font-medium transition-colors inline-flex items-center gap-1 px-3 py-2 rounded-md hover:bg-[var(--accent-pale)]"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              title="送迎エリアの追加・並び替え・時間・住所を設定"
            >
              送迎エリアを設定 →
            </a>
            <Button variant="primary" onClick={handleAdd}>+ 児童追加</Button>
          </div>
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
                <th
                  className="px-2 py-2 text-center font-semibold"
                  style={{ background: 'var(--ink)', color: '#fff', width: '36px' }}
                  title="ドラッグで並び替え"
                >
                  ↕
                </th>
                {['氏名', '学年', 'マーク', 'ステータス'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center" style={{ color: 'var(--ink-3)' }}>
                    児童が登録されていません
                  </td>
                </tr>
              )}
              {children.map((c, idx) => {
                const markCount = (c.pickup_area_labels?.length ?? 0) + (c.dropoff_area_labels?.length ?? 0);
                const isDragging = draggingChildIdx === idx;
                const isDropTarget = dragOverChildIdx === idx && draggingChildIdx !== null && draggingChildIdx !== idx;
                return (
                  <tr
                    key={c.id}
                    onDragOver={(e) => {
                      if (draggingChildIdx === null || draggingChildIdx === idx) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverChildIdx(idx);
                    }}
                    onDragLeave={() => {
                      if (dragOverChildIdx === idx) setDragOverChildIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingChildIdx !== null && draggingChildIdx !== idx) {
                        handleReorderChildren(draggingChildIdx, idx);
                      }
                      setDraggingChildIdx(null);
                      setDragOverChildIdx(null);
                    }}
                    className="hover:bg-[var(--accent-pale)] cursor-pointer transition-colors"
                    style={{
                      opacity: isDragging ? 0.4 : 1,
                      /* 案A: 学年色 + zebra（奇数行に薄い濃淡を重ねる） */
                      background: isDropTarget
                        ? 'var(--accent-pale)'
                        : idx % 2 === 1
                          ? `linear-gradient(rgba(0,0,0,0.028), rgba(0,0,0,0.028)), ${getGradeRowBg(c.grade_type)}`
                          : getGradeRowBg(c.grade_type),
                    }}
                    onClick={() => handleEdit(c)}
                  >
                    <td
                      className="px-1 py-2 text-center"
                      style={{ borderBottom: '1px solid var(--rule)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDraggingChildIdx(idx);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(idx));
                        }}
                        onDragEnd={() => {
                          setDraggingChildIdx(null);
                          setDragOverChildIdx(null);
                        }}
                        className="inline-flex items-center justify-center w-6 h-7 rounded transition-colors hover:bg-[var(--bg)]"
                        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                        aria-label="ドラッグして並び替え"
                        title="ドラッグして並び替え"
                      >
                        <svg width="14" height="18" viewBox="0 0 14 18" fill="var(--ink-3)" aria-hidden>
                          <circle cx="4" cy="4" r="1.3" />
                          <circle cx="10" cy="4" r="1.3" />
                          <circle cx="4" cy="9" r="1.3" />
                          <circle cx="10" cy="9" r="1.3" />
                          <circle cx="4" cy="14" r="1.3" />
                          <circle cx="10" cy="14" r="1.3" />
                        </svg>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>{c.name}</td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                      <Badge variant="info">{GRADE_LABELS[c.grade_type]}</Badge>
                    </td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                      {markCount === 0 ? '未設定' : `${markCount}件`}
                    </td>
                    <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                      <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? '在籍' : '退籍'}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? '児童追加' : `${editing?.name} の設定`}
        size="lg"
      >
        {editing && (
          <div className="flex flex-col gap-6">
            {/* 基本情報 */}
            <section className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>氏名</label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="outline-none"
                    style={inputStyle}
                    placeholder="例）山田 太郎"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>学年</label>
                  <select
                    value={editing.grade_type}
                    onChange={(e) => setEditing({ ...editing, grade_type: e.target.value as GradeType })}
                    className="outline-none"
                    style={inputStyle}
                  >
                    {Object.entries(GRADE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1 sm:col-span-2">
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
                <label
                  className="flex items-center justify-center gap-2 rounded cursor-pointer"
                  style={{
                    background: editing.is_active ? 'var(--green-pale)' : 'var(--bg)',
                    border: `1px solid ${editing.is_active ? 'rgba(42,122,82,0.25)' : 'var(--rule)'}`,
                    padding: '0 12px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editing.is_active}
                    onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  />
                  <span className="text-sm font-medium" style={{ color: editing.is_active ? 'var(--green)' : 'var(--ink-3)' }}>
                    {editing.is_active ? '在籍' : '退籍'}
                  </span>
                </label>
              </div>

              {/* 自宅住所（送り先のデフォルト） */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                  自宅住所（送り先のデフォルト）
                </label>
                <input
                  type="text"
                  value={editing.home_address ?? ''}
                  onChange={(e) => setEditing({ ...editing, home_address: e.target.value })}
                  className="outline-none"
                  style={inputStyle}
                  placeholder="例）愛知県知多郡東浦町藤江西之宮95"
                />
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  送りマークに住所が未設定の場合、ここが自動で使われます（送迎表 → 地図で開く）
                </p>
              </div>

              {/* 迎/送 マーク選択（テナント共通 + この児童専用をマージ表示） */}
              <div className="flex items-center justify-end">
                <a
                  href="/settings/tenant"
                  target="_blank"
                  rel="noopener"
                  className="text-xs"
                  style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                >
                  テナント設定で追加 →
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['pickup', 'dropoff'] as const).map((direction) => {
                  const key = direction === 'pickup' ? 'pickup_area_labels' : 'dropoff_area_labels';
                  const customKey = direction === 'pickup' ? 'custom_pickup_areas' : 'custom_dropoff_areas';
                  const label = direction === 'pickup' ? 'お迎えマーク' : 'お送りマーク';
                  const accentVar = direction === 'pickup' ? 'var(--accent)' : 'var(--green)';
                  const palVar = direction === 'pickup' ? 'var(--accent-pale)' : 'var(--green-pale)';
                  const tenantAreasDir = direction === 'pickup' ? pickupAreas : dropoffAreas;
                  const customAreas = editing[customKey];
                  const selected = editing[key];
                  type AreaRow = { area: AreaLabel; source: 'tenant' | 'custom'; label: string };
                  const merged: AreaRow[] = [];
                  const seen = new Set<string>();
                  for (const a of tenantAreasDir) {
                    const l = formatAreaLabel(a);
                    seen.add(l);
                    const overrideIdx = customAreas.findIndex((c) => formatAreaLabel(c) === l);
                    merged.push(
                      overrideIdx >= 0
                        ? { area: customAreas[overrideIdx], source: 'custom', label: l }
                        : { area: a, source: 'tenant', label: l },
                    );
                  }
                  for (const c of customAreas) {
                    const l = formatAreaLabel(c);
                    if (seen.has(l)) continue;
                    merged.push({ area: c, source: 'custom', label: l });
                  }
                  const allLabels = merged.map((r) => r.label);
                  return (
                    <div
                      key={direction}
                      className="flex flex-col gap-1.5 rounded-md p-2"
                      style={{ border: '1px solid var(--rule)', background: palVar }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold" style={{ color: accentVar }}>
                          {label}
                        </label>
                        {merged.length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setEditing({ ...editing, [key]: allLabels })}
                              style={{ color: accentVar, textDecoration: 'underline' }}
                            >
                              全選択
                            </button>
                            <span style={{ color: 'var(--ink-3)' }}>/</span>
                            <button
                              type="button"
                              onClick={() => setEditing({ ...editing, [key]: [] })}
                              style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}
                            >
                              全解除
                            </button>
                          </div>
                        )}
                      </div>
                      {merged.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                          （テナント設定または下の「この児童専用エリア」で{label.replace('マーク', '')}エリアを追加してください）
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {(['tenant', 'custom'] as const).map((src) => {
                            const rows = merged.filter((r) => r.source === src);
                            if (rows.length === 0) return null;
                            return (
                              <div key={src} className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                                  {src === 'tenant' ? '【テナント共通】' : '【この児童専用】'}
                                </span>
                                {rows.map(({ area: a, label: ll }, idx) => {
                                  const checked = selected.includes(ll);
                                  return (
                                    <button
                                      type="button"
                                      key={`${src}-${idx}-${ll}`}
                                      onClick={() => {
                                        const next = checked
                                          ? selected.filter((l) => l !== ll)
                                          : [...selected, ll];
                                        setEditing({ ...editing, [key]: next });
                                      }}
                                      className="rounded-md transition-all text-left"
                                      style={{
                                        padding: '5px 10px',
                                        fontSize: '0.78rem',
                                        fontWeight: 500,
                                        background: checked ? accentVar : 'var(--white)',
                                        color: checked ? '#fff' : 'var(--ink-2)',
                                        border: `1px solid ${checked ? accentVar : 'var(--rule)'}`,
                                      }}
                                      title={a.time ? `${ll}：${a.time}〜` : ll}
                                    >
                                      {checked ? '✓ ' : ''}
                                      {ll}
                                      {a.time && (
                                        <span className="ml-1.5 opacity-80" style={{ fontSize: '0.7rem' }}>
                                          {a.time}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* この児童専用エリア（イレギュラー用） */}
              <CustomAreasEditor
                editing={editing}
                setEditing={setEditing}
                inputStyle={inputStyle}
              />
            </section>

            {/* フッター */}
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

/**
 * この児童専用エリアの編集 UI。
 * テナント共通では扱えないイレギュラー時刻/場所を、児童ごとに追加できる。
 */
function CustomAreasEditor({
  editing,
  setEditing,
  inputStyle,
}: {
  editing: EditableChild;
  setEditing: (c: EditableChild) => void;
  inputStyle: React.CSSProperties;
}) {
  const sections = [
    { key: 'custom_pickup_areas' as const, title: 'お迎え（この児童専用）', accent: 'var(--accent)', pale: 'var(--accent-pale)' },
    { key: 'custom_dropoff_areas' as const, title: 'お送り（この児童専用）', accent: 'var(--green)', pale: 'var(--green-pale)' },
  ];

  const updateArea = (
    key: 'custom_pickup_areas' | 'custom_dropoff_areas',
    i: number,
    field: keyof AreaLabel,
    value: string,
  ) => {
    const next = editing[key].map((a, idx) => (idx === i ? { ...a, [field]: value } : a));
    setEditing({ ...editing, [key]: next });
  };
  const addArea = (key: 'custom_pickup_areas' | 'custom_dropoff_areas') => {
    setEditing({ ...editing, [key]: [...editing[key], { emoji: '🏠', name: '' }] });
  };
  const removeArea = (key: 'custom_pickup_areas' | 'custom_dropoff_areas', i: number) => {
    setEditing({ ...editing, [key]: editing[key].filter((_, idx) => idx !== i) });
  };

  const emojiStyle: React.CSSProperties = { ...inputStyle, width: '2.75rem', textAlign: 'center', padding: '6px 4px', fontSize: '1rem' };
  const nameStyle: React.CSSProperties = { ...inputStyle, padding: '6px 10px' };
  const timeStyle: React.CSSProperties = { ...inputStyle, width: '6rem', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' };
  const addrStyle: React.CSSProperties = { ...inputStyle, padding: '6px 10px', flex: 1 };

  return (
    <div
      className="flex flex-col gap-2 rounded-md p-3 mt-1"
      style={{ border: '1px dashed var(--rule-strong)', background: 'var(--bg)' }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
          この児童専用エリア（イレギュラー用）
        </span>
        <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          テナント共通マークでは表現できない時刻・場所をここに追加できます。追加したマークは上の「お迎え / お送りマーク」の【この児童専用】に並び、選択するとこの児童の送迎表だけに反映されます。
        </span>
      </div>

      {sections.map(({ key, title, accent, pale }) => (
        <div key={key} className="flex flex-col gap-1.5 rounded-md p-2" style={{ border: '1px solid var(--rule)', background: pale }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: accent }}>{title}</span>
            <button
              type="button"
              onClick={() => addArea(key)}
              className="text-xs px-2 py-1 rounded"
              style={{ color: accent, border: `1px solid ${accent}`, background: 'var(--white)' }}
            >
              ＋ 追加
            </button>
          </div>
          {editing[key].length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              （未登録）
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {editing[key].map((a, i) => (
                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="text"
                    value={a.emoji}
                    onChange={(e) => updateArea(key, i, 'emoji', e.target.value)}
                    style={emojiStyle}
                    maxLength={2}
                    aria-label="絵文字"
                  />
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateArea(key, i, 'name', e.target.value)}
                    style={nameStyle}
                    placeholder="エリア名（例: おばあちゃん家）"
                    aria-label="エリア名"
                  />
                  <input
                    type="time"
                    value={a.time ?? ''}
                    onChange={(e) => updateArea(key, i, 'time', e.target.value)}
                    style={timeStyle}
                    step={600}
                    aria-label="基準時刻"
                  />
                  <input
                    type="text"
                    value={a.address ?? ''}
                    onChange={(e) => updateArea(key, i, 'address', e.target.value)}
                    style={addrStyle}
                    placeholder="住所（任意）"
                    aria-label="住所"
                  />
                  <button
                    type="button"
                    onClick={() => removeArea(key, i)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: 'var(--red)', border: '1px solid var(--rule)', background: 'var(--white)' }}
                    aria-label="削除"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
