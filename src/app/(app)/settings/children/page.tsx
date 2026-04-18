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
  AreaLabel,
} from '@/types';
import { getDefaultPickupTimeByGrade, GRADE_LABELS } from '@/lib/utils/parseChildName';

/**
 * 児童管理ページ（admin・editor）
 * Supabase 連携 + エリア種類はテナント設定から取得
 *
 * 送迎パターンは迎 / 送 で別エリアを選択可能。
 * エリア選択時にそのエリアの基準時刻が時間欄に自動入力される（編集可）。
 */

type PatternItem = {
  id?: string;
  pattern_name: string;
  pickup_location: string;
  pickup_time: string;
  pickup_method: PickupMethod;
  pickup_area_label: string;
  dropoff_location: string;
  dropoff_time: string;
  dropoff_method: DropoffMethod;
  dropoff_area_label: string;
};

type EditableChild = {
  id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  parent_contact: string | null;
  home_address: string | null;
  /** Phase 21: 利用可能なお迎えマーク（複数選択）*/
  pickup_area_labels: string[];
  /** Phase 27: 送りマーク（複数選択） */
  dropoff_area_labels: string[];
  /** Phase 28 A案: この児童専用の迎えエリア候補 */
  custom_pickup_areas: AreaLabel[];
  /** Phase 28 A案: この児童専用の送りエリア候補 */
  custom_dropoff_areas: AreaLabel[];
  patterns: PatternItem[];
  isNew?: boolean;
};

/* GRADE_LABELS は @/lib/utils/parseChildName から import（プルダウン順もこの定義順） */

const PICKUP_METHOD_LABELS: Record<PickupMethod, string> = {
  pickup: 'お迎え',
  self: '自分で',
  parent: '保護者',
};
const DROPOFF_METHOD_LABELS: Record<DropoffMethod, string> = {
  dropoff: '送り',
  self: '自分で帰る',
  parent: '保護者',
};

const TIME_STEP_SECONDS = 600; /* 10分ステップ */
/* 迎/送 行内のレイアウト揃えるための固定幅 */
const LABEL_WIDTH = '3.5rem';
const METHOD_SELECT_WIDTH = '6rem';

/**
 * Phase 23: 学年カテゴリ別の行背景（うっすら）
 *   - 児童発達支援: 未就学 → 淡い青 / 年少・年中・年長 → 淡い赤
 *   - 放課後等デイサービス (小1 以降) → 淡い緑
 */
function getGradeRowBg(grade: GradeType): string {
  switch (grade) {
    case 'preschool':
      return 'rgba(26,62,184,0.05)'; /* 未就学: 青 */
    case 'nursery_3':
    case 'nursery_4':
    case 'nursery_5':
      return 'rgba(155,51,51,0.05)'; /* 年少・年中・年長: 赤 */
    default:
      return 'rgba(42,122,82,0.05)'; /* 小1 以降: 緑 */
  }
}

const emptyPattern = (grade?: GradeType): PatternItem => ({
  pattern_name: '',
  pickup_location: '',
  pickup_time: grade ? getDefaultPickupTimeByGrade(grade) : '14:00',
  pickup_method: 'pickup',
  pickup_area_label: '',
  dropoff_location: '',
  dropoff_time: '16:00',
  dropoff_method: 'dropoff',
  dropoff_area_label: '',
});

/** "🐻 幼稚部" 形式の label を返す */
const formatAreaLabel = (a: AreaLabel): string => `${a.emoji} ${a.name}`;

export default function ChildrenSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [patterns, setPatterns] = useState<ChildTransportPatternRow[]>([]);
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);
  const [editing, setEditing] = useState<EditableChild | null>(null);
  /* Phase 28: パターン登録セクションの開閉状態。
     既存パターン有 or URL #pattern-new 時のみ自動で開く（イレギュラー児童用に格下げ） */
  const [patternSectionOpen, setPatternSectionOpen] = useState(false);
  /* ドラッグ並び替え用 */
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
      setPatterns(cJson.patterns ?? []);
      if (tRes.ok) {
        const { tenant } = await tRes.json();
        const s: TenantSettings = tenant?.settings ?? {};
        /* 迎エリア: pickup_areas 優先、旧 transport_areas にフォールバック */
        setPickupAreas(s.pickup_areas ?? s.transport_areas ?? []);
        /* 送エリア: dropoff_areas のみ（旧 transport_areas は迎扱いのため送には使わない） */
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

  /* Phase 28: /settings/children?child=<id>#pattern-new で来た場合、対象児童を自動で編集モーダルに開く。
     送迎表 [未登録パターンあり] から誘導される導線用。children/patterns 取得完了後に 1 度だけ実行。 */
  useEffect(() => {
    if (loading || children.length === 0) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const childParam = params.get('child');
    if (!childParam || editing) return;
    const target = children.find((c) => c.id === childParam);
    if (target) handleEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, children, patterns]);


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
      patterns: [emptyPattern('elementary_1')],
      isNew: true,
    });
    /* Phase 28: 新規追加時はパターン登録不要（マーク選択のみで十分）→ 閉じる */
    setPatternSectionOpen(false);
  };

  const handleEdit = (child: ChildRow) => {
    const childPatterns = patterns
      .filter((p) => p.child_id === child.id)
      .map<PatternItem>((p) => {
        /* 旧 area_label は互換のため pickup 側のフォールバックに */
        const pickupLabel = p.pickup_area_label ?? p.area_label ?? '';
        const dropoffLabel = p.dropoff_area_label ?? '';
        /* 個別住所（memo）が未入力の場合、エリア設定の住所を default として表示。
           保存しても問題なし（個別住所の "既定値" として機能する） */
        const pickupAreaAddress =
          pickupAreas.find((a) => formatAreaLabel(a) === pickupLabel)?.address ?? '';
        const dropoffAreaAddress =
          dropoffAreas.find((a) => formatAreaLabel(a) === dropoffLabel)?.address ?? '';
        /* 住所フォールバック優先順位:
             1. 個別memo (p.pickup_location / p.dropoff_location) が最優先
             2. エリア設定の住所
             3. 送り側は児童の自宅住所 (home_address) */
        return {
          id: p.id,
          pattern_name: p.pattern_name,
          pickup_location: p.pickup_location || pickupAreaAddress,
          pickup_time: p.pickup_time ?? '14:00',
          pickup_method: p.pickup_method,
          pickup_area_label: pickupLabel,
          dropoff_location: p.dropoff_location || dropoffAreaAddress || (child.home_address ?? ''),
          dropoff_time: p.dropoff_time ?? '16:00',
          dropoff_method: p.dropoff_method,
          dropoff_area_label: dropoffLabel,
        };
      });
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
      patterns: childPatterns.length > 0 ? childPatterns : [emptyPattern(child.grade_type)],
    });
    /* Phase 28: 既存パターンがある児童だけ自動展開。新規児童ではマーク選択のみで OK なので閉じた状態 */
    const hasDbPatterns = childPatterns.some((p) => !!p.id);
    const hasHashAnchor =
      typeof window !== 'undefined' && window.location.hash === '#pattern-new';
    setPatternSectionOpen(hasDbPatterns || hasHashAnchor);
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
            home_address: editing.home_address,
            pickup_area_labels: editing.pickup_area_labels,
            dropoff_area_labels: editing.dropoff_area_labels,
            custom_pickup_areas: editing.custom_pickup_areas,
            custom_dropoff_areas: editing.custom_dropoff_areas,
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
            home_address: editing.home_address,
            pickup_area_labels: editing.pickup_area_labels,
            dropoff_area_labels: editing.dropoff_area_labels,
            custom_pickup_areas: editing.custom_pickup_areas,
            custom_dropoff_areas: editing.custom_dropoff_areas,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '更新失敗');
      }

      /* パターン一括置換: pattern_name は UI で編集しないので index 採番 */
      const patternsForSave = editing.patterns.map((p, idx) => ({
        ...p,
        pattern_name: p.pattern_name?.trim() || `パターン${idx + 1}`,
      }));
      const pRes = await fetch(`/api/children/${childId}/patterns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns: patternsForSave }),
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

  /** 児童の並び替え: ドラッグ完了時に配列を splice → display_order を 0,1,2... で再採番 → API */
  const handleReorderChildren = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= children.length || to >= children.length) return;
    const next = [...children];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    /* 楽観更新 */
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
      /* 失敗時は再取得して元の順序に戻す */
      await fetchAll();
    }
  };

  const updatePattern = <K extends keyof PatternItem>(
    index: number,
    field: K,
    value: PatternItem[K]
  ) => {
    if (!editing) return;
    const ps = [...editing.patterns];
    ps[index] = { ...ps[index], [field]: value };
    setEditing({ ...editing, patterns: ps });
  };

  /**
   * エリア選択時: 時間欄に基準時刻を自動入力
   * ユーザーが後から時間を編集済みの場合は上書きしない（空 or 既定値のときだけ入れる）
   */
  const handlePickupAreaChange = (index: number, newLabel: string) => {
    if (!editing) return;
    const area = pickupAreas.find((a) => formatAreaLabel(a) === newLabel);
    const current = editing.patterns[index];
    const ps = [...editing.patterns];
    const shouldAutofillTime =
      !!area?.time &&
      (!current.pickup_time ||
        current.pickup_time === '14:00' ||
        current.pickup_time === getDefaultPickupTimeByGrade(editing.grade_type));
    /* 住所: 手入力済み(空でない)は尊重、空のときだけエリアの住所で埋める */
    const shouldAutofillAddress = !!area?.address && !current.pickup_location;
    ps[index] = {
      ...current,
      pickup_area_label: newLabel,
      pickup_time: shouldAutofillTime ? (area?.time ?? current.pickup_time) : current.pickup_time,
      pickup_location: shouldAutofillAddress
        ? (area?.address ?? current.pickup_location)
        : current.pickup_location,
    };
    setEditing({ ...editing, patterns: ps });
  };

  const handleDropoffAreaChange = (index: number, newLabel: string) => {
    if (!editing) return;
    const area = dropoffAreas.find((a) => formatAreaLabel(a) === newLabel);
    const current = editing.patterns[index];
    const ps = [...editing.patterns];
    const shouldAutofillTime =
      !!area?.time && (!current.dropoff_time || current.dropoff_time === '16:00');
    /* 住所フォールバック: 個別memo → area.address → child.home_address */
    let nextLocation = current.dropoff_location;
    if (!current.dropoff_location) {
      nextLocation = area?.address || editing.home_address || '';
    }
    ps[index] = {
      ...current,
      dropoff_area_label: newLabel,
      dropoff_time: shouldAutofillTime ? (area?.time ?? current.dropoff_time) : current.dropoff_time,
      dropoff_location: nextLocation,
    };
    setEditing({ ...editing, patterns: ps });
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
  const pickupAreaOptions = pickupAreas.map(formatAreaLabel);
  const dropoffAreaOptions = dropoffAreas.map(formatAreaLabel);
  const hasAnyArea = pickupAreas.length > 0 || dropoffAreas.length > 0;

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
                {['氏名', '学年', 'パターン数', 'ステータス'].map((h) => (
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
                const count = patterns.filter((p) => p.child_id === c.id).length;
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
                      background: isDropTarget ? 'var(--accent-pale)' : getGradeRowBg(c.grade_type),
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
                      {count}パターン
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
                    onChange={(e) => {
                      const newGrade = e.target.value as GradeType;
                      const defaultTime = getDefaultPickupTimeByGrade(newGrade);
                      const oldDefaultTime = getDefaultPickupTimeByGrade(editing.grade_type);
                      /* 学年依存の既定時間が入っているパターンだけ自動更新 */
                      const updatedPatterns = editing.patterns.map((p) =>
                        p.pickup_time === oldDefaultTime || !p.pickup_time
                          ? { ...p, pickup_time: defaultTime }
                          : p
                      );
                      setEditing({ ...editing, grade_type: newGrade, patterns: updatedPatterns });
                    }}
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

              {/* 自宅住所（Phase 20: 送迎パターンの dropoff default） */}
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
                  送迎パターンの送り先が未入力の場合、ここが自動で使われます（送迎表 → 地図で開く）
                </p>
              </div>

              {/* Phase 27: 迎/送 の 2 カラム並列。職員管理と同レイアウト。
                  テナント設定のマーク・時間がそのまま候補として並び、選択したら送迎表で自動使用。 */}
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
                  /* Phase 28 A案: 共通 + 児童専用 をマージ表示（重複は custom 優先で 1 件に統合） */
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

              {/* Phase 28 A案: この児童専用エリア（イレギュラー用） */}
              <CustomAreasEditor
                editing={editing}
                setEditing={setEditing}
                inputStyle={inputStyle}
              />
            </section>

            {/* 送迎パターン（Phase 28: イレギュラー児童専用セクションに格下げ。
                既存パターン有 or URL #pattern-new で自動展開、それ以外は閉じた状態がデフォルト） */}
            <section className="flex flex-col gap-3" id="pattern-new">
              <button
                type="button"
                onClick={() => setPatternSectionOpen((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-md transition-colors text-left"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--rule)',
                  color: 'var(--ink)',
                }}
                aria-expanded={patternSectionOpen}
                aria-controls="pattern-section-body"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">
                    <span aria-hidden style={{ marginRight: 8 }}>{patternSectionOpen ? '▼' : '▶'}</span>
                    送迎パターン登録（イレギュラー児童用）
                  </span>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    通常はお迎え/お送りマークの選択だけで送迎表に自動反映されます。
                    曜日や時間帯で例外がある児童だけ、ここで個別パターンを登録してください。
                    {editing.patterns.some((p) => !!p.id) && (
                      <span style={{ color: 'var(--accent)', marginLeft: 4, fontWeight: 600 }}>
                        （登録済み {editing.patterns.filter((p) => !!p.id).length} 件）
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-xs shrink-0 ml-3" style={{ color: 'var(--ink-3)' }}>最大5件</span>
              </button>

              {patternSectionOpen && (
                <div id="pattern-section-body" className="flex flex-col gap-3">
              {!hasAnyArea && (
                <p className="text-xs px-3 py-2 rounded" style={{ background: 'var(--gold-pale, #fdf6e3)', color: 'var(--gold, #b8860b)' }}>
                  迎/送エリアが未設定です。テナント設定でマーク・エリア名・時間を登録してから利用してください。
                </p>
              )}

              {editing.patterns.map((p, i) => (
                <div
                  key={i}
                  className="p-3 flex flex-col gap-2"
                  style={{ background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--rule)' }}
                >
                  {/* パターン番号 + 削除 */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>
                      パターン {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, patterns: editing.patterns.filter((_, j) => j !== i) })}
                      className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--red-pale)]"
                      style={{ color: 'var(--red)' }}
                      aria-label="このパターンを削除"
                    >
                      🗑 削除
                    </button>
                  </div>

                  {/* 迎 行 */}
                  <PickupRow
                    pattern={p}
                    areaOptions={pickupAreaOptions}
                    onMethodChange={(v) => updatePattern(i, 'pickup_method', v)}
                    onAreaChange={(v) => handlePickupAreaChange(i, v)}
                    onTimeChange={(v) => updatePattern(i, 'pickup_time', v)}
                    onLocationChange={(v) => updatePattern(i, 'pickup_location', v)}
                  />
                  {/* 送 行 */}
                  <DropoffRow
                    pattern={p}
                    areaOptions={dropoffAreaOptions}
                    onMethodChange={(v) => updatePattern(i, 'dropoff_method', v)}
                    onAreaChange={(v) => handleDropoffAreaChange(i, v)}
                    onTimeChange={(v) => updatePattern(i, 'dropoff_time', v)}
                    onLocationChange={(v) => updatePattern(i, 'dropoff_location', v)}
                  />
                </div>
              ))}

              {editing.patterns.length < 5 && (
                <Button
                  variant="secondary"
                  onClick={() => setEditing({ ...editing, patterns: [...editing.patterns, emptyPattern(editing.grade_type)] })}
                >
                  + パターン追加
                </Button>
              )}
                </div>
              )}
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

/* ---------- 迎 行 ---------- */
type PickupRowProps = {
  pattern: PatternItem;
  areaOptions: string[];
  onMethodChange: (v: PickupMethod) => void;
  onAreaChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onLocationChange: (v: string) => void;
};

function PickupRow({
  pattern, areaOptions, onMethodChange, onAreaChange, onTimeChange, onLocationChange,
}: PickupRowProps) {
  return (
    <div
      className="flex flex-col gap-1.5 px-2.5 py-2"
      style={{
        background: 'var(--accent-pale)',
        border: '1px solid rgba(26,62,184,0.15)',
        borderRadius: '8px',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold shrink-0 whitespace-nowrap text-center"
          style={{ color: 'var(--accent)', width: LABEL_WIDTH }}
        >
          迎 🚗←
        </span>
        <select
          value={pattern.pickup_method}
          onChange={(e) => onMethodChange(e.target.value as PickupMethod)}
          className="outline-none text-xs font-medium shrink-0"
          style={methodSelectStyle('var(--accent)')}
        >
          {Object.entries(PICKUP_METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={pattern.pickup_area_label}
          onChange={(e) => onAreaChange(e.target.value)}
          className="outline-none text-xs flex-1 min-w-0"
          style={areaSelectStyle()}
          aria-label="迎のエリア"
        >
          <option value="">エリア選択</option>
          {areaOptions.map((a, idx) => (<option key={`${idx}-${a}`} value={a}>{a}</option>))}
        </select>
        <input
          type="time"
          step={TIME_STEP_SECONDS}
          value={pattern.pickup_time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="outline-none text-xs shrink-0"
          style={timeInputStyle()}
          aria-label="迎の時間"
        />
      </div>
      <MemoInput
        icon="📍"
        value={pattern.pickup_location}
        onChange={onLocationChange}
        placeholder="住所・目印（Mapsで開く）例: 大府市吉田町123"
        ariaLabel="迎の住所メモ"
      />
    </div>
  );
}

/* ---------- 送 行 ---------- */
type DropoffRowProps = {
  pattern: PatternItem;
  areaOptions: string[];
  onMethodChange: (v: DropoffMethod) => void;
  onAreaChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onLocationChange: (v: string) => void;
};

function DropoffRow({
  pattern, areaOptions, onMethodChange, onAreaChange, onTimeChange, onLocationChange,
}: DropoffRowProps) {
  return (
    <div
      className="flex flex-col gap-1.5 px-2.5 py-2"
      style={{
        background: 'var(--green-pale)',
        border: '1px solid rgba(42,122,82,0.15)',
        borderRadius: '8px',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold shrink-0 whitespace-nowrap text-center"
          style={{ color: 'var(--green)', width: LABEL_WIDTH }}
        >
          送 🚗→
        </span>
        <select
          value={pattern.dropoff_method}
          onChange={(e) => onMethodChange(e.target.value as DropoffMethod)}
          className="outline-none text-xs font-medium shrink-0"
          style={methodSelectStyle('var(--green)')}
        >
          {Object.entries(DROPOFF_METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={pattern.dropoff_area_label}
          onChange={(e) => onAreaChange(e.target.value)}
          className="outline-none text-xs flex-1 min-w-0"
          style={areaSelectStyle()}
          aria-label="送のエリア"
        >
          <option value="">エリア選択</option>
          {areaOptions.map((a, idx) => (<option key={`${idx}-${a}`} value={a}>{a}</option>))}
        </select>
        <input
          type="time"
          step={TIME_STEP_SECONDS}
          value={pattern.dropoff_time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="outline-none text-xs shrink-0"
          style={timeInputStyle()}
          aria-label="送の時間"
        />
      </div>
      <MemoInput
        icon="📍"
        value={pattern.dropoff_location}
        onChange={onLocationChange}
        placeholder="住所・目印（Mapsで開く）例: 自宅 玄関前"
        ariaLabel="送の住所メモ"
      />
    </div>
  );
}

/* ---------- 住所メモ入力（Phase 14: 送迎表で Google Maps 起動に使用） ---------- */
type MemoInputProps = {
  icon: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
};

function MemoInput({ icon, value, onChange, placeholder, ariaLabel }: MemoInputProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs shrink-0" style={{ color: 'var(--ink-3)', width: LABEL_WIDTH, textAlign: 'center' }}>
        {icon}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="outline-none text-xs flex-1 min-w-0"
        style={{
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--rule)',
          borderRadius: '6px',
          padding: '6px 10px',
        }}
      />
    </div>
  );
}

/* ---------- 共通スタイル ---------- */
function methodSelectStyle(accentColor: string): React.CSSProperties {
  return {
    background: 'var(--surface)',
    color: accentColor,
    border: '1px solid var(--rule)',
    borderRadius: '6px',
    padding: '6px 8px',
    width: METHOD_SELECT_WIDTH,
  };
}

function areaSelectStyle(): React.CSSProperties {
  return {
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
    padding: '6px 8px',
  };
}

function timeInputStyle(): React.CSSProperties {
  return {
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
    padding: '6px 8px',
    width: '6.5rem',
  };
}

/**
 * Phase 28 A案: この児童専用エリアの編集 UI。
 * テナント共通では扱えないイレギュラー時刻/場所を、児童ごとに追加できる。
 * フィールドは tenant 設定の AreaLabel 編集と同じ（絵文字 / 名前 / 時刻 / 住所 / 削除）。
 * ドラッグ並び替えは不要（件数が少ない想定）。
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
