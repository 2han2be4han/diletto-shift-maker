'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

/**
 * Phase 28: 対応エリアをコンパクトなサマリーで表示し、ホバー時のみ詳細ポップオーバーで全一覧を出す。
 * 一覧ページのノイズを大幅に減らすためのもの。モバイル（タッチ）では onClick でも開くようにしておく。
 */
function TransportAreasPopover({
  pickup,
  dropoff,
}: {
  /** Phase 30: 表示用 AreaLabel オブジェクト配列（id→label 解決済み） */
  pickup: AreaLabel[];
  dropoff: AreaLabel[];
}) {
  const [open, setOpen] = useState(false);
  /* Phase 28 fix: 親の overflow:auto に切られないよう position:fixed で描画。
     下端見切れを防ぐため、画面下部に近いときは自動でボタン上に反転配置する。 */
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  /** ポップオーバー想定高さ（行数で概算）。計算で下スペース判定に使う */
  const estimatedHeight = 40 /* padding/タイトル */
    + (pickup.length > 0 ? 28 + pickup.length * 34 : 0)
    + (dropoff.length > 0 ? 28 + dropoff.length * 34 : 0);

  const updateCoords = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const POPOVER_WIDTH = 220;
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - POPOVER_WIDTH - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    /* 下に収まらない かつ 上の方が広い → 上に反転 */
    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      setCoords({ bottom: window.innerHeight - rect.top + 4, left });
    } else {
      setCoords({ top: rect.bottom + 4, left });
    }
  };

  const handleOpen = () => {
    updateCoords();
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  /* スクロール/リサイズ時は追従させるより閉じたほうが挙動が安定 */
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const totalCount = pickup.length + dropoff.length;
  if (totalCount === 0) {
    return <span style={{ color: 'var(--ink-3)' }}>-</span>;
  }

  /** 編集モーダルと同じ「方向別パネル（パレ背景 + 縦積みボタン風セル）」デザイン */
  const renderSection = (direction: 'pickup' | 'dropoff', items: AreaLabel[]) => {
    if (items.length === 0) return null;
    const accentVar = direction === 'pickup' ? 'var(--accent)' : 'var(--green)';
    const palVar = direction === 'pickup' ? 'var(--accent-pale)' : 'var(--green-pale)';
    const label = direction === 'pickup' ? '迎対応' : '送り対応';
    return (
      <div
        className="flex flex-col gap-1.5 rounded-md p-2"
        style={{ border: '1px solid var(--rule)', background: palVar }}
      >
        <span className="text-[0.65rem] font-bold" style={{ color: accentVar }}>{label}</span>
        <div className="flex flex-col gap-1">
          {items.map((a) => (
            <span
              key={`${direction}-${a.id}`}
              className="rounded-md"
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 500,
                background: 'var(--white)',
                color: accentVar,
                border: `1px solid ${accentVar}`,
              }}
            >
              {a.emoji} {a.name}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? handleClose() : handleOpen())}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--rule)',
          fontSize: '0.7rem',
          color: 'var(--ink-2)',
          fontWeight: 500,
        }}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {pickup.length > 0 && (
          <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--accent)' }}>
            <span className="font-bold">迎</span>
            <span>{pickup.length}</span>
          </span>
        )}
        {pickup.length > 0 && dropoff.length > 0 && (
          <span style={{ color: 'var(--rule-strong)' }}>/</span>
        )}
        {dropoff.length > 0 && (
          <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--green)' }}>
            <span className="font-bold">送</span>
            <span>{dropoff.length}</span>
          </span>
        )}
        <span aria-hidden style={{ color: 'var(--ink-3)', fontSize: '0.65rem' }}>ⓘ</span>
      </button>
      {open && coords && (
        <div
          role="tooltip"
          className="flex flex-col gap-2"
          style={{
            position: 'fixed',
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            zIndex: 1000,
            background: 'var(--white)',
            border: '1px solid var(--rule-strong)',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            width: '220px',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          {renderSection('pickup', pickup)}
          {renderSection('dropoff', dropoff)}
        </div>
      )}
    </div>
  );
}

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
  /* Phase 59: 運転手/付き添いフラグ。新規はどちらも false でユーザーが個別設定 */
  is_driver: false,
  is_attendant: false,
  display_order: null,
  is_active: true,
  retired_at: null,
  display_name: null,
  isNew: true,
});

export default function StaffSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  /* Phase 27-D (revised): 迎/送エリアをテナント設定から分離して取得 */
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);
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
      /* Phase 27-D (revised): 迎/送エリアを分離ソースで扱う。
         旧 transport_areas のみのテナントは迎側のフォールバックにする */
      setPickupAreas(s.pickup_areas ?? s.transport_areas ?? []);
      setDropoffAreas(s.dropoff_areas ?? []);
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
  /* Phase 30: 表示時に id → AreaLabel を解決するルックアップ。
     一覧ポップオーバーと editor 表示で共用する。 */
  const pickupById = new Map(pickupAreas.map((a) => [a.id, a]));
  const dropoffById = new Map(dropoffAreas.map((a) => [a.id, a]));
  const resolveAreas = (ids: string[] | null | undefined, src: 'pickup' | 'dropoff'): AreaLabel[] => {
    const lookup = src === 'pickup' ? pickupById : dropoffById;
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => lookup.get(id)).filter((a): a is AreaLabel => !!a);
  };

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
      /* Phase 59: 送迎役割フラグ（旧データに無ければ false） */
      is_driver: s.is_driver ?? false,
      is_attendant: s.is_attendant ?? false,
      display_order: s.display_order,
      is_active: s.is_active,
      retired_at: s.retired_at,
      display_name: s.display_name ?? null,
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
            /* Phase 59: 送迎役割フラグ */
            is_driver: editing.is_driver,
            is_attendant: editing.is_attendant,
            display_name: editing.display_name,
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
            /* Phase 59: 送迎役割フラグ */
            is_driver: editing.is_driver,
            is_attendant: editing.is_attendant,
            display_name: editing.display_name,
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

  /* Phase 47: admin によるパスワード再発行。
     既にログイン済 (user_id != null) の職員に Resend で recovery リンクを送る。
     未ログインの場合は招待フロー (handleResendInvite) を使うべきで、API 側でガードされる。 */
  const handleResetPassword = async (
    e: React.MouseEvent,
    target: StaffRow
  ) => {
    e.stopPropagation();
    if (!confirm(`${target.name} さんのパスワードを再発行しますか？\n本人にメールが送信されます。`)) return;
    setError('');
    setInfo('');
    setResendingId(target.id);
    try {
      const res = await fetch(`/api/staff/${target.id}/reset-password`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'パスワード再発行に失敗しました');
      setInfo(`${target.name} さんにパスワード再発行メールを送信しました`);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスワード再発行に失敗しました');
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
          <Button data-tour="staff-invite" variant="primary" onClick={handleAdd}>+ 職員を招待</Button>
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
        <div data-tour="staff-list" className="hidden md:block overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
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
                  /* Phase 47: メール列を撤去（モーダル編集で参照可、一覧では情報過多）。
                     資格列を旧メール位置（氏名の右隣）に移動して視認性アップ。
                     氏名列は未ログインバッジ + 再送/PW再発行ボタンが入るため余裕を持たせる。 */
                  { label: '氏名', minWidth: '220px' },
                  { label: '資格', minWidth: '180px' },
                  { label: 'ロール', minWidth: '80px' },
                  { label: '雇用', minWidth: '70px' },
                  { label: '勤務時間', minWidth: '130px' },
                  { label: '対応エリア', minWidth: '200px' },
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
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--ink-3)' }}>
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
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>
                    {/* Phase 47: 名前 1 段目 / 退職バッジ・未ログイン・操作ボタンを 2 段目に縦並びで整える。
                        旧実装は 1 行に詰め込んでいたため、長い名前で右端が切れたり最初の文字が欠ける問題があった。 */}
                    <div className="flex flex-col gap-1">
                      <div className="font-medium whitespace-nowrap">{s.name}</div>
                      {(s.is_active === false || !s.user_id || s.user_id) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {s.is_active === false && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--red-pale)', color: 'var(--red)' }}
                            >
                              退職
                            </span>
                          )}
                          {!s.user_id && s.is_active !== false && (
                            <>
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
                                title="招待メールを再送"
                              >
                                {resendingId === s.id ? '送信中...' : '再送'}
                              </button>
                            </>
                          )}
                          {s.user_id && s.is_active !== false && (
                            <button
                              type="button"
                              onClick={(e) => handleResetPassword(e, s)}
                              disabled={resendingId === s.id}
                              className="text-xs font-medium transition-colors"
                              style={{
                                background: 'transparent',
                                color: 'var(--ink-2)',
                                border: '1px solid var(--rule-strong)',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                cursor: resendingId === s.id ? 'not-allowed' : 'pointer',
                                opacity: resendingId === s.id ? 0.6 : 1,
                              }}
                              title="パスワード再発行メールを送信"
                            >
                              {resendingId === s.id ? '送信中...' : 'PW再発行'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  {/* Phase 47: メール列撤去 → 資格列を氏名の右隣に移動（旧メール位置） */}
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
                  {/* Phase 28: チップ全展開を辞め、サマリー + ホバーでポップオーバー詳細に変更。
                      旧 transport_areas は新カラム空時のフォールバックとして使用。
                      Phase 30: id 配列を AreaLabel[] に解決して渡す。 */}
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    {(() => {
                      const pickupIds = s.pickup_transport_areas && s.pickup_transport_areas.length > 0 ? s.pickup_transport_areas : s.transport_areas;
                      const dropoffIds = s.dropoff_transport_areas && s.dropoff_transport_areas.length > 0 ? s.dropoff_transport_areas : s.transport_areas;
                      return <TransportAreasPopover pickup={resolveAreas(pickupIds, 'pickup')} dropoff={resolveAreas(dropoffIds, 'dropoff')} />;
                    })()}
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
              {/* Phase 47: モバイル版にもパスワード再発行ボタン */}
              {s.user_id && s.is_active !== false && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={(e) => handleResetPassword(e, s)}
                    disabled={resendingId === s.id}
                    className="text-xs font-medium transition-colors"
                    style={{
                      background: 'transparent',
                      color: 'var(--ink-2)',
                      border: '1px solid var(--rule-strong)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      cursor: resendingId === s.id ? 'not-allowed' : 'pointer',
                      opacity: resendingId === s.id ? 0.6 : 1,
                    }}
                  >
                    {resendingId === s.id ? '送信中...' : 'パスワード再発行'}
                  </button>
                </div>
              )}

              <div className="text-xs mb-1" style={{ color: 'var(--ink-2)' }}>
                <span className="font-medium">勤務: </span>
                {s.default_start_time ?? '-'}〜{s.default_end_time ?? '-'}
              </div>

              {/* Phase 28: モバイルも共通ポップオーバー UI に統一 / Phase 30: id→AreaLabel 解決 */}
              {(() => {
                const pickupIds = s.pickup_transport_areas && s.pickup_transport_areas.length > 0 ? s.pickup_transport_areas : s.transport_areas;
                const dropoffIds = s.dropoff_transport_areas && s.dropoff_transport_areas.length > 0 ? s.dropoff_transport_areas : s.transport_areas;
                if (pickupIds.length === 0 && dropoffIds.length === 0) return null;
                return (
                  <div className="mb-1">
                    <TransportAreasPopover
                      pickup={resolveAreas(pickupIds, 'pickup')}
                      dropoff={resolveAreas(dropoffIds, 'dropoff')}
                    />
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
            {/* Phase 59-fix: 氏名 + メールを 1 行、表示名は下の行で full-width（長いヘルプ文で高さ不揃いになる問題を回避） */}
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

            {/* Phase 28 F案: 送迎表の担当セル用・短縮表示名（目安 3 文字）。full-width に分離 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                表示名 <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>（送迎表用・短めがおすすめ・任意）</span>
              </label>
              <input
                type="text"
                value={editing.display_name ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditing({ ...editing, display_name: v.trim() ? v : null });
                }}
                className="outline-none"
                style={inputStyle}
                placeholder={editing.name ? editing.name.replace(/\s+/g, '').slice(0, 3) : '例）濱田亜'}
              />
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                未入力なら氏名の先頭3文字を自動で使います。送迎表のセルは 3 文字程度が読みやすいですが、長くても入力は可能（超過分は送迎表で省略表示されます）。
              </p>
            </div>

            {/* Phase 59: 送迎役割を先頭付近に配置して目立たせる（運転手フラグが運用の要になるため） */}
            <div
              className="flex flex-col gap-2 p-3 rounded"
              style={{ background: 'var(--accent-pale)', border: '1.5px solid var(--accent)' }}
            >
              <label className="text-sm font-bold" style={{ color: 'var(--accent)' }}>🚐 送迎役割</label>
              <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                左スロット（主担当）= 運転手のみ / 右スロット（副担当）= 運転手 or 付き添い。両方オフなら送迎担当候補に出ません。
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'is_driver' as const, label: '🚗 運転手', color: 'var(--accent)' },
                  { key: 'is_attendant' as const, label: '🧑‍🤝‍🧑 付き添い', color: 'var(--green, #2f8f57)' },
                ]).map(({ key, label, color }) => {
                  const on = editing[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEditing({ ...editing, [key]: !on })}
                      className="text-sm font-semibold px-4 py-2 rounded transition-colors"
                      style={{
                        background: on ? color : 'var(--white)',
                        color: on ? '#fff' : 'var(--ink-2)',
                        border: `1.5px solid ${on ? color : 'var(--rule)'}`,
                      }}
                    >
                      {on ? '✓ ' : ''}{label}
                    </button>
                  );
                })}
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

            {/* Phase 60: 児童専用エリアの担当設定は児童管理側でしか行えないことを明示。
                ここに混入させると画面が肥大化するため、職員管理ではテナント共通エリアだけを扱う。 */}
            <div
              className="flex items-start gap-2 rounded-md p-3"
              style={{
                background: 'var(--accent-pale)',
                borderLeft: '4px solid var(--accent)',
                fontSize: '0.8rem',
                color: 'var(--ink)',
              }}
            >
              <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>ℹ️</span>
              <span>
                <strong style={{ fontWeight: 700 }}>児童専用エリア</strong>
                （🐻 祖母宅 など、特定の児童にだけ設定されるエリア）の担当設定は、
                <strong style={{ fontWeight: 700 }}>児童管理 → 専用エリア</strong>
                から行ってください。ここではテナント共通エリアのみ設定します。
              </span>
            </div>

            {/* Phase 27-D (revised v2): 迎エリア・送エリアを別ソースで並列表示。
                迎セクション=テナントの pickup_areas のみ、送セクション=dropoff_areas のみ。 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['pickup', 'dropoff'] as const).map((direction) => {
                const key = direction === 'pickup' ? 'pickup_transport_areas' : 'dropoff_transport_areas';
                const label = direction === 'pickup' ? '迎対応' : '送り対応';
                const accentVar = direction === 'pickup' ? 'var(--accent)' : 'var(--green)';
                const palVar = direction === 'pickup' ? 'var(--accent-pale)' : 'var(--green-pale)';
                /* Phase 30: AreaLabel オブジェクトを直接列挙し、id を選択値として保持。 */
                const areas = direction === 'pickup' ? pickupAreas : dropoffAreas;
                const selected = editing[key];
                return (
                  <div
                    key={direction}
                    className="flex flex-col gap-1.5 rounded-md p-2"
                    style={{ border: '1px solid var(--rule)', background: palVar }}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold" style={{ color: accentVar }}>{label}エリア</label>
                      {areas.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setEditing({ ...editing, [key]: areas.map((a) => a.id) })}
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
                    {areas.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                        （テナント設定で{label}エリアを追加してください）
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {areas.map((area) => {
                          const on = selected.includes(area.id);
                          return (
                            <button
                              key={area.id}
                              type="button"
                              onClick={() => handleAreaToggle(direction, area.id)}
                              className="rounded-md transition-all text-left"
                              style={{
                                padding: '5px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 500,
                                background: on ? accentVar : 'var(--white)',
                                color: on ? '#fff' : 'var(--ink-2)',
                                border: `1px solid ${on ? accentVar : 'var(--rule)'}`,
                              }}
                            >
                              {on ? '✓ ' : ''}{area.emoji} {area.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
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
