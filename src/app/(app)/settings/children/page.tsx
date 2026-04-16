'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { GradeType } from '@/types';

/**
 * 児童管理ページ（admin・editor）
 * - 児童一覧テーブル
 * - 追加・編集モーダル（名前・学年・送迎パターン）
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

type ChildItem = {
  id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  patterns: { name: string; pickup_location: string; pickup_time: string; dropoff_time: string; area_label: string }[];
};

const GRADE_LABELS: Record<GradeType, string> = {
  preschool: '未就学', elementary_1: '小1', elementary_2: '小2', elementary_3: '小3',
  elementary_4: '小4', elementary_5: '小5', elementary_6: '小6', junior_high: '中学',
};

const INITIAL_CHILDREN: ChildItem[] = [
  { id: 'c1', name: '川島舞桜', grade_type: 'preschool', is_active: true, patterns: [{ name: '保育園', pickup_location: '○○保育園', pickup_time: '11:20', dropoff_time: '16:00', area_label: '🍇 藤江' }] },
  { id: 'c2', name: '川島颯斗', grade_type: 'elementary_4', is_active: true, patterns: [{ name: '学校（通常）', pickup_location: '○○小学校', pickup_time: '14:20', dropoff_time: '16:00', area_label: '🍇 藤江' }] },
  { id: 'c3', name: '清水隼音', grade_type: 'elementary_4', is_active: true, patterns: [{ name: '学校（通常）', pickup_location: '△△小学校', pickup_time: '11:30', dropoff_time: '16:00', area_label: '🌳 豊明' }] },
  { id: 'c4', name: '滝川希', grade_type: 'preschool', is_active: true, patterns: [{ name: '保育園', pickup_location: '□□保育園', pickup_time: '13:50', dropoff_time: '16:30', area_label: '🏭 大府' }] },
  { id: 'c5', name: '竹内碧子', grade_type: 'elementary_3', is_active: true, patterns: [{ name: '学校（通常）', pickup_location: '◇◇小学校', pickup_time: '12:30', dropoff_time: '16:30', area_label: '🍇 藤江' }] },
  { id: 'c6', name: '板倉千夏', grade_type: 'elementary_2', is_active: true, patterns: [{ name: '学校（通常）', pickup_location: '○○小学校', pickup_time: '10:30', dropoff_time: '16:30', area_label: '🌳 豊明' }] },
];

export default function ChildrenSettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [children, setChildren] = useState<ChildItem[]>(INITIAL_CHILDREN);
  const [editing, setEditing] = useState<ChildItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleAdd = () => {
    setEditing({ id: `c${Date.now()}`, name: '', grade_type: 'elementary_1', is_active: true, patterns: [] });
    setIsNew(true);
  };

  const handleEdit = (child: ChildItem) => {
    setEditing({ ...child, patterns: child.patterns.map((p) => ({ ...p })) });
    setIsNew(false);
  };

  const handleSave = () => {
    if (!editing || !editing.name) return;
    if (isNew) {
      setChildren([...children, editing]);
    } else {
      setChildren(children.map((c) => (c.id === editing.id ? editing : c)));
    }
    setEditing(null);
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', color: 'var(--ink)',
    border: '1px solid var(--rule)', borderRadius: '6px',
    padding: '8px 12px', fontSize: '0.9rem',
  };

  return (
    <>
      <Header title="児童管理" onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>児童一覧</h2>
            <Badge variant="info">{children.filter((c) => c.is_active).length}名（有効）</Badge>
          </div>
          <Button variant="primary" onClick={handleAdd}>+ 児童追加</Button>
        </div>

        <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['氏名', '学年', '送迎パターン', 'ステータス', '操作'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--accent-pale)]">
                  <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>{c.name}</td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>{GRADE_LABELS[c.grade_type]}</td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)', fontSize: '0.8rem' }}>
                    {c.patterns.map((p) => `${p.name}（${p.area_label}）`).join(', ') || '未設定'}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? '有効' : '無効'}</Badge>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <button onClick={() => handleEdit(c)} className="text-xs font-semibold px-2 py-1 rounded hover:bg-[var(--accent-pale)]" style={{ color: 'var(--accent)' }}>編集</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編集モーダル */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={isNew ? '児童追加' : `${editing?.name} を編集`}>
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>氏名</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="outline-none" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>学年</label>
                <select value={editing.grade_type} onChange={(e) => setEditing({ ...editing, grade_type: e.target.value as GradeType })} className="outline-none" style={inputStyle}>
                  {Object.entries(GRADE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} id="active" />
              <label htmlFor="active" className="text-sm" style={{ color: 'var(--ink-2)' }}>有効（利用中）</label>
            </div>

            {/* 送迎パターン */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>送迎パターン</label>
              {editing.patterns.map((p, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-end" style={{ background: 'var(--bg)', padding: '8px', borderRadius: '6px' }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>区分</span>
                    <input type="text" value={p.name} onChange={(e) => { const ps = [...editing.patterns]; ps[i] = { ...p, name: e.target.value }; setEditing({ ...editing, patterns: ps }); }} className="outline-none text-xs" style={inputStyle} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>場所</span>
                    <input type="text" value={p.pickup_location} onChange={(e) => { const ps = [...editing.patterns]; ps[i] = { ...p, pickup_location: e.target.value }; setEditing({ ...editing, patterns: ps }); }} className="outline-none text-xs" style={inputStyle} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>迎え</span>
                    <input type="time" value={p.pickup_time} onChange={(e) => { const ps = [...editing.patterns]; ps[i] = { ...p, pickup_time: e.target.value }; setEditing({ ...editing, patterns: ps }); }} className="outline-none text-xs" style={inputStyle} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>送り</span>
                    <input type="time" value={p.dropoff_time} onChange={(e) => { const ps = [...editing.patterns]; ps[i] = { ...p, dropoff_time: e.target.value }; setEditing({ ...editing, patterns: ps }); }} className="outline-none text-xs" style={inputStyle} />
                  </div>
                  <button onClick={() => { const ps = editing.patterns.filter((_, j) => j !== i); setEditing({ ...editing, patterns: ps }); }} className="text-xs py-2 rounded hover:bg-[var(--red-pale)]" style={{ color: 'var(--red)' }}>削除</button>
                </div>
              ))}
              <Button variant="secondary" onClick={() => setEditing({ ...editing, patterns: [...editing.patterns, { name: '', pickup_location: '', pickup_time: '14:00', dropoff_time: '16:00', area_label: '' }] })}>
                + パターン追加
              </Button>
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
