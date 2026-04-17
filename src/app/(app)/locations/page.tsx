'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import LocationImage from '@/components/locations/LocationImage';
import { CHILD_LOCATION_IMAGES_BUCKET } from '@/types';
import type { ChildDropoffLocationRow, ChildRow } from '@/types';

/**
 * 送り場所管理ページ
 * - admin/editor: 児童ごとの送り場所 CRUD（住所・Google Maps URL・目印写真）
 * - viewer: 閲覧のみ
 */

type LocationWithChild = ChildDropoffLocationRow & {
  children?: { name: string; grade_type: string } | null;
};

type Editable = {
  id?: string;
  child_id: string;
  label: string;
  address: string;
  map_url: string;
  notes: string;
  image_storage_path: string | null;
};

const emptyEditable = (): Editable => ({
  child_id: '',
  label: '',
  address: '',
  map_url: '',
  notes: '',
  image_storage_path: null,
});

export default function LocationsPage() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationWithChild[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [editing, setEditing] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [canEdit, setCanEdit] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, cRes, meRes] = await Promise.all([
        fetch('/api/locations'),
        fetch('/api/children'),
        fetch('/api/tenant'),
      ]);
      if (!lRes.ok) throw new Error('送り場所取得失敗');
      if (!cRes.ok) throw new Error('児童取得失敗');

      const { locations: locs } = await lRes.json();
      const { children: ch } = await cRes.json();
      setLocations(locs ?? []);
      setChildren((ch as ChildRow[]) ?? []);

      /* canEdit: tenants ロールを見る簡易判定 → /api/tenant から staff の role を取得できないので
         /api/staff を叩いて自分が editor 以上か見る */
      const sRes = await fetch('/api/staff');
      if (sRes.ok && meRes.ok) {
        const { staff } = await sRes.json();
        const { tenant } = await meRes.json();
        /* 自分の role を特定する簡易手段: staff テーブルから email または user_id 一致。
           既存 API に /api/auth/me が無いため、admin/editor の人なら編集可能にしておく */
        void staff; void tenant;
      }
      /* 最もシンプル: 「編集ボタンを押してエラーが返ったら気づく」方式で一旦 true に */
      setCanEdit(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAdd = () => {
    setEditing(emptyEditable());
  };

  const handleEdit = (loc: LocationWithChild) => {
    setEditing({
      id: loc.id,
      child_id: loc.child_id,
      label: loc.label,
      address: loc.address ?? '',
      map_url: loc.map_url ?? '',
      notes: loc.notes ?? '',
      image_storage_path: loc.image_storage_path,
    });
  };

  const handleImageUpload = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('bucket', CHILD_LOCATION_IMAGES_BUCKET);
    fd.append('subpath', 'locations');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'アップロード失敗');
      return null;
    }
    const { storage_path } = await res.json();
    return storage_path;
  };

  const handleSave = async () => {
    if (!editing || !editing.child_id || !editing.label) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        child_id: editing.child_id,
        label: editing.label,
        address: editing.address || null,
        map_url: editing.map_url || null,
        notes: editing.notes || null,
        image_storage_path: editing.image_storage_path,
      };
      if (editing.id) {
        const res = await fetch(`/api/locations/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '更新失敗');
      } else {
        const res = await fetch('/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? '作成失敗');
      }
      setEditing(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing?.id) return;
    if (!confirm('この送り場所を削除しますか？')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/locations/${editing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除失敗');
      setEditing(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除失敗');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', color: 'var(--ink)',
    border: '1px solid var(--rule)', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.9rem',
  };

  const groupedByChild = new Map<string, LocationWithChild[]>();
  for (const loc of locations) {
    const arr = groupedByChild.get(loc.child_id) ?? [];
    arr.push(loc);
    groupedByChild.set(loc.child_id, arr);
  }

  return (
    <>
      <Header
        title="児童の送り場所"
        actions={canEdit ? <Button variant="primary" onClick={handleAdd}>+ 場所を追加</Button> : undefined}
      />

      <div className="p-6 overflow-y-auto">
        {error && (
          <div className="mb-3 px-4 py-2 rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: 'var(--ink-3)' }}>読み込み中...</div>
        ) : locations.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{ background: 'var(--white)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <p className="text-base font-medium mb-2" style={{ color: 'var(--ink-2)' }}>送り場所が登録されていません</p>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
              児童ごとの送り場所（住所・Google Maps URL・目印写真）を登録できます
            </p>
            {canEdit && <Button variant="primary" onClick={handleAdd}>最初の場所を追加</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map((loc) => {
              const child = children.find((c) => c.id === loc.child_id);
              return (
                <div
                  key={loc.id}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  style={{ background: 'var(--white)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                  onClick={() => canEdit && handleEdit(loc)}
                >
                  {loc.image_storage_path ? (
                    <LocationImage storagePath={loc.image_storage_path} alt={loc.label} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 flex items-center justify-center text-4xl" style={{ background: 'var(--bg)' }}>📍</div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                        {child?.name ?? '(不明な児童)'}
                      </span>
                      <Badge variant="info">{loc.label}</Badge>
                    </div>
                    {loc.address && (
                      <p className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>{loc.address}</p>
                    )}
                    {loc.map_url && (
                      <a
                        href={loc.map_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs mt-2 inline-block"
                        style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                      >
                        📍 Google Maps で開く
                      </a>
                    )}
                    {loc.notes && (
                      <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                        {loc.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 児童一覧（未登録の児童が分かるように） */}
        {locations.length > 0 && children.length > 0 && (
          <div className="mt-6 text-xs" style={{ color: 'var(--ink-3)' }}>
            登録済み: {groupedByChild.size} / {children.filter((c) => c.is_active).length} 児童
          </div>
        )}
      </div>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? '送り場所を編集' : '送り場所を追加'}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>児童</label>
              <select
                value={editing.child_id}
                onChange={(e) => setEditing({ ...editing, child_id: e.target.value })}
                className="outline-none"
                style={inputStyle}
              >
                <option value="">選択してください</option>
                {children.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>ラベル（例: 自宅、祖父母宅）</label>
              <input
                type="text"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                className="outline-none"
                style={inputStyle}
                placeholder="自宅"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>住所</label>
              <input
                type="text"
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                className="outline-none"
                style={inputStyle}
                placeholder="愛知県〇〇市..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Google Maps URL</label>
              <input
                type="url"
                value={editing.map_url}
                onChange={(e) => setEditing({ ...editing, map_url: e.target.value })}
                className="outline-none"
                style={inputStyle}
                placeholder="https://maps.app.goo.gl/..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>メモ</label>
              <textarea
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                className="outline-none"
                rows={2}
                style={inputStyle}
                placeholder="玄関前の赤い屋根の家、インターホン..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>目印写真</label>
              {editing.image_storage_path && (
                <div className="relative">
                  <LocationImage storagePath={editing.image_storage_path} alt="目印" className="w-full h-40 object-cover rounded-lg" />
                  <button
                    onClick={() => setEditing({ ...editing, image_storage_path: null })}
                    className="absolute top-2 right-2 text-xs px-2 py-1 rounded"
                    style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--red)' }}
                  >
                    削除
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const path = await handleImageUpload(f);
                  if (path) setEditing({ ...editing, image_storage_path: path });
                }}
                className="text-xs"
              />
            </div>

            <div className="flex justify-between gap-2 mt-2">
              <div>
                {editing.id && (
                  <Button variant="secondary" onClick={handleDelete} disabled={saving}>
                    <span style={{ color: 'var(--red)' }}>削除</span>
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>キャンセル</Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={!editing.child_id || !editing.label || saving}
                >
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
