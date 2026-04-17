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

const DEFAULT_START_TIME = '09:30';
const DEFAULT_END_TIME = '18:30';
const TIME_STEP_SECONDS = 600; /* 10分ステップ */

const emptyStaff = (): EditableStaff => ({
  id: `new-${Date.now()}`,
  name: '',
  email: '',
  role: 'admin',
  employment_type: 'part_time',
  default_start_time: DEFAULT_START_TIME,
  default_end_time: DEFAULT_END_TIME,
  transport_areas: [],
  /* Phase 27-D: 未 UI。保存時に transport_areas と同期（D-4 UI で上書き） */
  pickup_transport_areas: [],
  dropoff_transport_areas: [],
  qualifications: [],
  is_qualified: false,
  display_order: null,
  is_active: true,
  retired_at: null,
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
  const [resendingId, setResendingId] = useState<string | null>(null);
  /* Phase 24: ドラッグ並び替え状態 */
  const [draggingStaffIdx, setDraggingStaffIdx] = useState<number | null>(null);
  const [dragOverStaffIdx, setDragOverStaffIdx] = useState<number | null>(null);

  /** 職員の並び替え: ドラッグ完了時に display_order を 0,1,2... で再採番 → API */
  const handleReorderStaff = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= staffList.length || to >= staffList.length) return;
    const next = [...staffList];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setStaffList(next);
    try {
      const orders = next.map((s, idx) => ({ id: s.id, display_order: idx }));
      const res = await fetch('/api/staff/reorder', {
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

  const [showRetired, setShowRetired] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch(`/api/staff${showRetired ? '?include_retired=1' : ''}`),
        fetch('/api/tenant'),
      ]);
      if (!sRes.ok) throw new Error('職員の取得に失敗しました');
      if (!tRes.ok) throw new Error('テナント情報の取得に失敗しました');
      const { staff } = await sRes.json();
      const { tenant } = await tRes.json();
      setStaffList(staff ?? []);
      const s: TenantSettings = tenant?.settings ?? {};
      /* Phase 13: 対応エリア候補は 迎(pickup_areas) ∪ 送(dropoff_areas) のユニーク合成。
         旧 transport_areas のみのテナントは自動的にそれを使う */
      const pickup = s.pickup_areas ?? s.transport_areas ?? [];
      const dropoff = s.dropoff_areas ?? [];
      const seen = new Set<string>();
      const union: AreaLabel[] = [];
      for (const a of [...pickup, ...dropoff]) {
        const key = `${a.emoji}|${a.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          union.push(a);
        }
      }
      setAreas(union);
      setQualificationTypes(s.qualification_types ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [showRetired]);

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
      default_start_time: s.default_start_time ?? DEFAULT_START_TIME,
      default_end_time: s.default_end_time ?? DEFAULT_END_TIME,
      transport_areas: s.transport_areas,
      /* Phase 27-D: 未 UI。現状は StaffRow の値をそのまま引き継ぐ（未適用テナントでは []） */
      pickup_transport_areas: s.pickup_transport_areas ?? [],
      dropoff_transport_areas: s.dropoff_transport_areas ?? [],
      qualifications: s.qualifications,
      is_qualified: s.is_qualified,
      display_order: s.display_order,
      is_active: s.is_active,
      retired_at: s.retired_at,
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
            /* Phase 27-D: transport_areas は pickup ∪ dropoff のユニオンで後方互換維持 */
            transport_areas: Array.from(new Set([...editing.pickup_transport_areas, ...editing.dropoff_transport_areas])),
            pickup_transport_areas: editing.pickup_transport_areas,
            dropoff_transport_areas: editing.dropoff_transport_areas,
            qualifications: editing.qualifications,
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
            /* Phase 27-D: transport_areas は pickup ∪ dropoff のユニオンで後方互換維持 */
            transport_areas: Array.from(new Set([...editing.pickup_transport_areas, ...editing.dropoff_transport_areas])),
            pickup_transport_areas: editing.pickup_transport_areas,
            dropoff_transport_areas: editing.dropoff_transport_areas,
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

  /* Phase 25: 物理削除廃止 → 退職（ソフト削除）に変更 */
  const handleDelete = async () => {
    if (!editing || editing.isNew) return;
    if (
      !confirm(
        `${editing.name} を退職扱いにしますか？\n（ログイン不可になります。再雇用時に「復帰」できます）`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${editing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('退職処理に失敗しました');
      setEditing(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '退職処理に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async (
    e: React.MouseEvent,
    target: StaffRow
  ) => {
    e.stopPropagation(); /* 行クリックの編集モーダルを抑止 */
    if (!confirm(`${target.name} さんに招待メールを再送しますか？`)) return;
    setError('');
    setInfo('');
    setResendingId(target.id);
    try {
      const res = await fetch(`/api/staff/${target.id}/resend-invite`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? '再送に失敗しました');
      setInfo(`${target.name} さんに招待メールを再送しました`);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '再送に失敗しました');
    } finally {
      setResendingId(null);
    }
  };

  /* Phase 27-D: 迎/送 別々にトグル */
  const handleAreaToggle = (direction: 'pickup' | 'dropoff', area: string) => {
    if (!editing) return;
    const key = direction === 'pickup' ? 'pickup_transport_areas' : 'dropoff_transport_areas';
    const current = editing[key];
    const has = current.includes(area);
    setEditing({
      ...editing,
      [key]: has ? current.filter((a) => a !== area) : [...current, area],
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
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>職員一覧</h2>
            <Badge variant="info">{staffList.filter((s) => s.is_active !== false).length}名</Badge>
            <label className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: 'var(--ink-2)' }}>
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => setShowRetired(e.target.checked)}
              />
              退職者も表示
            </label>
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

        {/* デスクトップ・タブレット（md以上）: テーブル表示 */}
        <div className="hidden md:block overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th
                  className="px-2 py-2 text-center font-semibold"
                  style={{ background: 'var(--ink)', color: '#fff', width: '36px' }}
                  title="ドラッグで並び替え"
                >
                  ↕
                </th>
                {[
                  { label: '氏名', minWidth: '140px' },
                  { label: 'メール', minWidth: '180px' },
                  { label: 'ロール', minWidth: '80px' },
                  { label: '雇用', minWidth: '70px' },
                  { label: '勤務時間', minWidth: '130px' },
                  { label: '対応エリア', minWidth: '200px' },
                  { label: '資格', minWidth: '180px' },
                ].map((col) => (
                  <th
                    key={col.label}
                    className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                    style={{ background: 'var(--ink)', color: '#fff', minWidth: col.minWidth }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffList.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center" style={{ color: 'var(--ink-3)' }}>
                    職員が登録されていません
                  </td>
                </tr>
              )}
              {staffList.map((s, idx) => {
                const isDragging = draggingStaffIdx === idx;
                const isDropTarget = dragOverStaffIdx === idx && draggingStaffIdx !== null && draggingStaffIdx !== idx;
                return (
                <tr
                  key={s.id}
                  onDragOver={(e) => {
                    if (draggingStaffIdx === null || draggingStaffIdx === idx) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverStaffIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverStaffIdx === idx) setDragOverStaffIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingStaffIdx !== null && draggingStaffIdx !== idx) {
                      handleReorderStaff(draggingStaffIdx, idx);
                    }
                    setDraggingStaffIdx(null);
                    setDragOverStaffIdx(null);
                  }}
                  className="hover:bg-[var(--accent-pale)] transition-colors cursor-pointer"
                  style={{
                    opacity: s.is_active === false ? 0.55 : isDragging ? 0.4 : 1,
                    background: isDropTarget
                      ? 'var(--accent-pale)'
                      : s.is_active === false
                        ? 'var(--bg)'
                        : undefined,
                  }}
                  onClick={() => handleEdit(s)}
                >
                  <td
                    className="px-1 py-2 text-center"
                    style={{ borderBottom: '1px solid var(--rule)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDraggingStaffIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(idx));
                      }}
                      onDragEnd={() => {
                        setDraggingStaffIdx(null);
                        setDragOverStaffIdx(null);
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
                  <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>
                    {s.name}
                    {s.is_active === false && (
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--red-pale)', color: 'var(--red)' }}
                      >
                        退職
                      </span>
                    )}
                    {!s.user_id && s.is_active !== false && (
                      <>
                        <span className="ml-2 text-xs" style={{ color: 'var(--gold)' }}>未ログイン</span>
                        <button
                          type="button"
                          onClick={(e) => handleResendInvite(e, s)}
                          disabled={resendingId === s.id}
                          className="ml-2 text-xs font-medium transition-colors"
                          style={{
                            background: 'transparent',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            cursor: resendingId === s.id ? 'not-allowed' : 'pointer',
                            opacity: resendingId === s.id ? 0.6 : 1,
                          }}
                          title="招待メールを再送"
                        >
                          {resendingId === s.id ? '送信中...' : '再送'}
                        </button>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)' }}>
                    {s.email}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant={s.role === 'admin' ? 'error' : s.role === 'editor' ? 'info' : 'neutral'}>
                      {ROLE_LABELS[s.role]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {EMPLOYMENT_LABELS[s.employment_type]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {s.default_start_time ?? '-'}〜{s.default_end_time ?? '-'}
                  </td>
                  {/* Phase 27-D+G: 迎/送をチップで分離表示。新カラム空時は旧 transport_areas にフォールバック */}
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    {(() => {
                      const pickup = s.pickup_transport_areas && s.pickup_transport_areas.length > 0 ? s.pickup_transport_areas : s.transport_areas;
                      const dropoff = s.dropoff_transport_areas && s.dropoff_transport_areas.length > 0 ? s.dropoff_transport_areas : s.transport_areas;
                      if (pickup.length === 0 && dropoff.length === 0) {
                        return <span style={{ color: 'var(--ink-3)' }}>-</span>;
                      }
                      return (
                        <div className="flex flex-col gap-1">
                          {pickup.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[0.65rem] font-bold" style={{ color: 'var(--accent)', minWidth: '1.3em' }}>迎</span>
                              {pickup.map((a, idx) => (
                                <span
                                  key={`p-${idx}-${a}`}
                                  className="inline-flex items-center rounded-lg whitespace-nowrap"
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '0.7rem',
                                    background: 'var(--accent-pale)',
                                    color: 'var(--accent)',
                                    border: '1px solid var(--accent)',
                                    fontWeight: 500,
                                  }}
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                          {dropoff.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[0.65rem] font-bold" style={{ color: 'var(--green)', minWidth: '1.3em' }}>送</span>
                              {dropoff.map((a, idx) => (
                                <span
                                  key={`d-${idx}-${a}`}
                                  className="inline-flex items-center rounded-lg whitespace-nowrap"
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '0.7rem',
                                    background: 'var(--green-pale)',
                                    color: 'var(--green)',
                                    border: '1px solid var(--green)',
                                    fontWeight: 500,
                                  }}
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', fontSize: '0.8rem' }}>
                    {s.qualifications.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.qualifications.map((q) => (
                          <span
                            key={q}
                            className="px-1.5 py-0.5 rounded text-xs whitespace-nowrap"
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* モバイル（md 未満）: カード表示 */}
        <div className="md:hidden flex flex-col gap-3">
          {staffList.length === 0 && (
            <div className="px-3 py-6 text-center rounded-lg" style={{ background: 'var(--bg)', color: 'var(--ink-3)' }}>
              職員が登録されていません
            </div>
          )}
          {staffList.map((s) => (
            <div
              key={s.id}
              onClick={() => handleEdit(s)}
              className="p-3 rounded-lg cursor-pointer transition-colors hover:bg-[var(--accent-pale)]"
              style={{ background: 'var(--surface)', border: '1px solid var(--rule)' }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base" style={{ color: 'var(--ink)' }}>
                    {s.name}
                  </div>
                  <div className="text-xs mt-0.5 break-all" style={{ color: 'var(--ink-3)' }}>
                    {s.email ?? '（メール未設定）'}
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  <Badge variant={s.role === 'admin' ? 'error' : s.role === 'editor' ? 'info' : 'neutral'}>
                    {ROLE_LABELS[s.role]}
                  </Badge>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    {EMPLOYMENT_LABELS[s.employment_type]}
                  </span>
                </div>
              </div>

              {!s.user_id && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--gold)' }}>未ログイン</span>
                  <button
                    type="button"
                    onClick={(e) => handleResendInvite(e, s)}
                    disabled={resendingId === s.id}
                    className="text-xs font-medium transition-colors"
                    style={{
                      background: 'transparent',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      cursor: resendingId === s.id ? 'not-allowed' : 'pointer',
                      opacity: resendingId === s.id ? 0.6 : 1,
                    }}
                  >
                    {resendingId === s.id ? '送信中...' : '再送'}
                  </button>
                </div>
              )}

              <div className="text-xs mb-1" style={{ color: 'var(--ink-2)' }}>
                <span className="font-medium">勤務: </span>
                {s.default_start_time ?? '-'}〜{s.default_end_time ?? '-'}
              </div>

              {/* Phase 27-D+G: モバイル行の対応エリアも迎/送チップで表示 */}
              {(() => {
                const pickup = s.pickup_transport_areas && s.pickup_transport_areas.length > 0 ? s.pickup_transport_areas : s.transport_areas;
                const dropoff = s.dropoff_transport_areas && s.dropoff_transport_areas.length > 0 ? s.dropoff_transport_areas : s.transport_areas;
                if (pickup.length === 0 && dropoff.length === 0) return null;
                return (
                  <div className="flex flex-col gap-1 mb-1">
                    {pickup.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[0.65rem] font-bold" style={{ color: 'var(--accent)' }}>迎</span>
                        {pickup.map((a, idx) => (
                          <span
                            key={`p-${idx}-${a}`}
                            className="inline-flex items-center rounded-lg whitespace-nowrap"
                            style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--accent-pale)', color: 'var(--accent)', border: '1px solid var(--accent)', fontWeight: 500 }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {dropoff.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[0.65rem] font-bold" style={{ color: 'var(--green)' }}>送</span>
                        {dropoff.map((a, idx) => (
                          <span
                            key={`d-${idx}-${a}`}
                            className="inline-flex items-center rounded-lg whitespace-nowrap"
                            style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--green-pale)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 500 }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {s.qualifications.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.qualifications.map((q) => (
                    <span
                      key={q}
                      className="px-1.5 py-0.5 rounded text-xs whitespace-nowrap"
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
              )}
            </div>
          ))}
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
                <input
                  type="time"
                  step={TIME_STEP_SECONDS}
                  value={editing.default_start_time ?? ''}
                  onChange={(e) => setEditing({ ...editing, default_start_time: e.target.value })}
                  className="outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>退勤時間</label>
                <input
                  type="time"
                  step={TIME_STEP_SECONDS}
                  value={editing.default_end_time ?? ''}
                  onChange={(e) => setEditing({ ...editing, default_end_time: e.target.value })}
                  className="outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Phase 27-D: 対応エリアを迎/送に分割。迎=accent(青系), 送=green(緑系) */}
            {(['pickup', 'dropoff'] as const).map((direction) => {
              const key = direction === 'pickup' ? 'pickup_transport_areas' : 'dropoff_transport_areas';
              const label = direction === 'pickup' ? '迎対応' : '送り対応';
              const accentVar = direction === 'pickup' ? 'var(--accent)' : 'var(--green)';
              const selected = editing[key];
              return (
                <div key={direction} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{label}エリア</label>
                    {areaLabels.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing({ ...editing, [key]: [...areaLabels] })}
                          className="text-xs transition-colors"
                          style={{ color: accentVar, textDecoration: 'underline' }}
                        >
                          全選択
                        </button>
                        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>/</span>
                        <button
                          type="button"
                          onClick={() => setEditing({ ...editing, [key]: [] })}
                          className="text-xs transition-colors"
                          style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}
                        >
                          全解除
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {areaLabels.length === 0 && (
                      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                        （テナント設定でエリアを追加してください）
                      </p>
                    )}
                    {areaLabels.map((area) => (
                      <button
                        key={area}
                        onClick={() => handleAreaToggle(direction, area)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                        style={{
                          background: selected.includes(area) ? accentVar : 'var(--bg)',
                          color: selected.includes(area) ? '#fff' : 'var(--ink-2)',
                          border: `1px solid ${selected.includes(area) ? accentVar : 'var(--rule)'}`,
                        }}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

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
              <div className="flex gap-2">
                {!editing.isNew && editing.is_active !== false && (
                  <Button variant="secondary" onClick={handleDelete} disabled={saving}>
                    <span style={{ color: 'var(--red)' }}>退職</span>
                  </Button>
                )}
                {!editing.isNew && editing.is_active === false && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!editing || !confirm(`${editing.name} を復帰させますか？`)) return;
                      setSaving(true);
                      try {
                        const res = await fetch(`/api/staff/${editing.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ is_active: true }),
                        });
                        if (!res.ok) throw new Error('復帰処理に失敗しました');
                        setEditing(null);
                        await fetchAll();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : '復帰処理に失敗しました');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                  >
                    <span style={{ color: 'var(--green)' }}>復帰</span>
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
