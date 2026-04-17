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


  const handleAdd = () => {
    setEditing({
      id: `new-${Date.now()}`,
      name: '',
      grade_type: 'elementary_1',
      is_active: true,
      parent_contact: null,
      patterns: [emptyPattern('elementary_1')],
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
        /* 旧 area_label は互換のため pickup 側のフォールバックに */
        pickup_area_label: p.pickup_area_label ?? p.area_label ?? '',
        dropoff_location: p.dropoff_location ?? '',
        dropoff_time: p.dropoff_time ?? '16:00',
        dropoff_method: p.dropoff_method,
        dropoff_area_label: p.dropoff_area_label ?? '',
      }));
    setEditing({
      id: child.id,
      name: child.name,
      grade_type: child.grade_type,
      is_active: child.is_active,
      parent_contact: child.parent_contact,
      patterns: childPatterns.length > 0 ? childPatterns : [emptyPattern(child.grade_type)],
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
    ps[index] = {
      ...current,
      pickup_area_label: newLabel,
      pickup_time: shouldAutofillTime ? (area?.time ?? current.pickup_time) : current.pickup_time,
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
    ps[index] = {
      ...current,
      dropoff_area_label: newLabel,
      dropoff_time: shouldAutofillTime ? (area?.time ?? current.dropoff_time) : current.dropoff_time,
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>児童一覧</h2>
            <Badge variant="info">{activeCount}名（在籍）</Badge>
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
            </section>

            {/* 送迎パターン */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  送迎パターン（{editing.patterns.length}件）
                </label>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>最大5パターン</span>
              </div>
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
