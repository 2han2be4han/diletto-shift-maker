'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { AreaLabel, QualificationType, TenantSettings } from '@/types';

/**
 * テナント設定ページ（admin専用）
 * - 事業所名 + settings(JSONB) の CRUD
 * - エリアは迎用 (pickup_areas) と 送用 (dropoff_areas) を別管理（Phase 13）
 * - 旧 transport_areas は後方互換のため読み取り時のみ pickup_areas にフォールバック
 */

const DEFAULT_PICKUP_AREAS: AreaLabel[] = [
  { emoji: '🍇', name: '藤江', time: '' },
  { emoji: '🌳', name: '豊明', time: '' },
  { emoji: '🏭', name: '大府', time: '' },
  { emoji: '✈', name: '常滑', time: '' },
  { emoji: '🍶', name: '学童エリア', time: '' },
];
const DEFAULT_DROPOFF_AREAS: AreaLabel[] = [];

const AREA_TIME_STEP_SECONDS = 600; /* 10分ステップ */

const DEFAULT_QUALIFICATIONS: QualificationType[] = [
  { name: '保育士', countable: true },
  { name: '幼稚園教諭', countable: true },
  { name: '児童指導員', countable: true },
  { name: '教師', countable: true },
  { name: '児童発達支援管理責任者', countable: false },
  { name: '専門職員', countable: false },
  { name: '加配加算', countable: false },
];

export default function TenantSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [tenantName, setTenantName] = useState('');
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>(DEFAULT_PICKUP_AREAS);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>(DEFAULT_DROPOFF_AREAS);
  const [qualifications, setQualifications] = useState<QualificationType[]>(DEFAULT_QUALIFICATIONS);
  const [minQualified, setMinQualified] = useState(2);
  const [requestDeadline, setRequestDeadline] = useState(20);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tenant');
        if (!res.ok) throw new Error(await res.text());
        const { tenant } = await res.json();
        const s: TenantSettings = tenant?.settings ?? {};
        setTenantName(tenant?.name ?? '');

        /* 迎エリア: pickup_areas 優先、なければ旧 transport_areas を流用（初回自動移行） */
        const pickup =
          (s.pickup_areas && s.pickup_areas.length > 0)
            ? s.pickup_areas
            : (s.transport_areas && s.transport_areas.length > 0)
              ? s.transport_areas
              : DEFAULT_PICKUP_AREAS;
        setPickupAreas(pickup);

        /* 送エリア: dropoff_areas 優先、なければ空（ユーザーが追加） */
        setDropoffAreas(s.dropoff_areas ?? DEFAULT_DROPOFF_AREAS);

        setQualifications(
          s.qualification_types && s.qualification_types.length > 0
            ? s.qualification_types
            : DEFAULT_QUALIFICATIONS
        );
        setMinQualified(s.min_qualified_staff ?? 2);
        setRequestDeadline(s.request_deadline_day ?? 20);
      } catch (e) {
        setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* --- 迎エリア操作 --- */
  const handleAddPickupArea = () =>
    setPickupAreas([...pickupAreas, { emoji: '📍', name: '', time: '' }]);
  const handleRemovePickupArea = (i: number) =>
    setPickupAreas(pickupAreas.filter((_, idx) => idx !== i));
  const handlePickupAreaChange = (i: number, field: keyof AreaLabel, value: string) =>
    setPickupAreas(pickupAreas.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));

  /* --- 送エリア操作 --- */
  const handleAddDropoffArea = () =>
    setDropoffAreas([...dropoffAreas, { emoji: '🏠', name: '', time: '' }]);
  const handleRemoveDropoffArea = (i: number) =>
    setDropoffAreas(dropoffAreas.filter((_, idx) => idx !== i));
  const handleDropoffAreaChange = (i: number, field: keyof AreaLabel, value: string) =>
    setDropoffAreas(dropoffAreas.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tenantName,
          settings: {
            /* 旧 transport_areas は pickup_areas と同じ値を書いて互換維持 */
            transport_areas: pickupAreas,
            pickup_areas: pickupAreas,
            dropoff_areas: dropoffAreas,
            qualification_types: qualifications,
            min_qualified_staff: minQualified,
            request_deadline_day: requestDeadline,
          } as TenantSettings,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失敗');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '0.9rem',
  };

  if (loading) {
    return (
      <>
        <Header title="テナント設定" />
        <div className="p-6" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <Header title="テナント設定" />

      <div className="p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>事業所設定</h2>
          <Badge variant="info">admin専用</Badge>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>事業所名</label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full outline-none"
              style={inputStyle}
            />
          </div>

          {/* 送迎エリア: 迎 / 送 を2カラムで並べる */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>送迎エリア</label>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                マーク・エリア名・時間はセットで扱います。児童の送迎パターンでエリアを選ぶと時間が自動入力されます（編集可能）。
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 迎エリア */}
              <AreaListSection
                title="迎のエリア"
                titleColor="var(--accent)"
                areas={pickupAreas}
                onChange={handlePickupAreaChange}
                onRemove={handleRemovePickupArea}
                onAdd={handleAddPickupArea}
                inputStyle={inputStyle}
                emptyMessage="迎のエリアを追加してください"
              />
              {/* 送エリア */}
              <AreaListSection
                title="送のエリア"
                titleColor="var(--green)"
                areas={dropoffAreas}
                onChange={handleDropoffAreaChange}
                onRemove={handleRemoveDropoffArea}
                onAdd={handleAddDropoffArea}
                inputStyle={inputStyle}
                emptyMessage="送のエリアを追加してください"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 max-w-2xl">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>資格種類</label>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              「カウント対象」がONの資格を持つ職員が、シフト生成時の有資格者カウントに含まれます。
            </p>
            <div className="flex flex-col gap-1.5">
              {qualifications.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{
                    background: q.countable ? 'var(--green-pale)' : 'var(--bg)',
                    borderRadius: '6px',
                    border: `1px solid ${q.countable ? 'rgba(42,122,82,0.15)' : 'var(--rule)'}`,
                  }}
                >
                  <input
                    type="text"
                    value={q.name}
                    onChange={(e) => {
                      const updated = [...qualifications];
                      updated[i] = { ...q, name: e.target.value };
                      setQualifications(updated);
                    }}
                    className="flex-1 outline-none text-sm bg-transparent"
                    style={{ color: 'var(--ink)' }}
                  />
                  <label className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.countable}
                      onChange={(e) => {
                        const updated = [...qualifications];
                        updated[i] = { ...q, countable: e.target.checked };
                        setQualifications(updated);
                      }}
                    />
                    <span style={{ color: q.countable ? 'var(--green)' : 'var(--ink-3)' }}>
                      カウント対象
                    </span>
                  </label>
                  <button
                    onClick={() => setQualifications(qualifications.filter((_, j) => j !== i))}
                    className="text-xs px-1 hover:opacity-70"
                    style={{ color: 'var(--red)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() => setQualifications([...qualifications, { name: '', countable: true }])}
              >
                + 資格追加
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 max-w-2xl">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>有資格者の最低出勤人数</label>
            <input
              type="number"
              min={1}
              max={10}
              value={minQualified}
              onChange={(e) => setMinQualified(parseInt(e.target.value) || 1)}
              className="w-24 outline-none"
              style={inputStyle}
            />
          </div>

          <div className="flex flex-col gap-2 max-w-2xl">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>休み希望の締切日</label>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>前月</span>
              <input
                type="number"
                min={1}
                max={28}
                value={requestDeadline}
                onChange={(e) => setRequestDeadline(parseInt(e.target.value) || 20)}
                className="w-20 outline-none"
                style={inputStyle}
              />
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>日まで</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            {saved && <Badge variant="success">保存しました</Badge>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- エリアリスト（迎/送共通の子コンポーネント） ---------- */
type AreaListSectionProps = {
  title: string;
  titleColor: string;
  areas: AreaLabel[];
  onChange: (i: number, field: keyof AreaLabel, value: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  inputStyle: React.CSSProperties;
  emptyMessage: string;
};

function AreaListSection({
  title,
  titleColor,
  areas,
  onChange,
  onRemove,
  onAdd,
  inputStyle,
  emptyMessage,
}: AreaListSectionProps) {
  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{ border: '1px solid var(--rule)', borderRadius: '10px', background: 'var(--surface)' }}
    >
      <h3 className="text-sm font-bold" style={{ color: titleColor }}>{title}</h3>
      {areas.length === 0 && (
        <p className="text-xs py-2" style={{ color: 'var(--ink-3)' }}>{emptyMessage}</p>
      )}
      <div className="flex flex-col gap-2">
        {areas.map((area, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={area.emoji}
              onChange={(e) => onChange(i, 'emoji', e.target.value)}
              className="w-12 text-center outline-none"
              style={inputStyle}
              placeholder="🏠"
              aria-label="マーク"
            />
            <input
              type="text"
              value={area.name}
              onChange={(e) => onChange(i, 'name', e.target.value)}
              className="flex-1 min-w-0 outline-none"
              style={inputStyle}
              placeholder="エリア名"
              aria-label="エリア名"
            />
            <input
              type="time"
              step={AREA_TIME_STEP_SECONDS}
              value={area.time ?? ''}
              onChange={(e) => onChange(i, 'time', e.target.value)}
              className="w-24 outline-none"
              style={inputStyle}
              aria-label="基準時間"
            />
            <button
              onClick={() => onRemove(i)}
              className="text-xs px-2 py-2 rounded transition-colors hover:bg-[var(--red-pale)]"
              style={{ color: 'var(--red)' }}
            >
              削除
            </button>
          </div>
        ))}
      </div>
      <Button variant="secondary" onClick={onAdd}>+ エリア追加</Button>
    </div>
  );
}
