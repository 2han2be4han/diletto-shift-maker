'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { GradeType } from '@/types';
import { getDefaultPickupTimeByGrade } from '@/lib/utils/parseChildName';

/**
 * 児童管理ページ（admin・editor）
 *
 * デイロボのExcelを参考に、児童ごとに複数の送迎パターンを登録可能。
 * パターン例: 保育園 / 自宅 / 学校(通常) / 学校(短縮) / おけいこ / 休み
 *
 * 各パターンに:
 * - 区分名（保育園/自宅/学校 etc）
 * - 迎え: 場所 + 時間 + 方法(お迎え/自分で来る)
 * - 送り: 場所 + 時間 + 方法(送り/自分で帰る/保護者)
 * - エリアラベル
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

type PatternItem = {
  name: string;
  pickup_location: string;
  pickup_time: string;
  pickup_method: 'pickup' | 'self' | 'parent';
  dropoff_location: string;
  dropoff_time: string;
  dropoff_method: 'dropoff' | 'self' | 'parent';
  area_label: string;
};

type ChildItem = {
  id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  patterns: PatternItem[];
};

const GRADE_LABELS: Record<GradeType, string> = {
  preschool: '未就学', elementary_1: '小1', elementary_2: '小2', elementary_3: '小3',
  elementary_4: '小4', elementary_5: '小5', elementary_6: '小6', junior_high: '中学',
};

const PATTERN_PRESETS = ['保育園', '自宅', '学校（通常）', '学校（短縮）', 'おけいこ', '休み'];
const METHOD_LABELS = { pickup: 'お迎え', self: '自分で', parent: '保護者' };
const METHOD_LABELS_DROP = { dropoff: '送り', self: '自分で帰る', parent: '保護者' };
const MOCK_AREAS = ['🍇 藤江', '🌳 豊明', '🏭 大府', '✈ 常滑', '🍶 学童'];

const emptyPattern = (): PatternItem => ({
  name: '', pickup_location: '', pickup_time: '14:00', pickup_method: 'pickup',
  dropoff_location: '', dropoff_time: '16:00', dropoff_method: 'dropoff', area_label: '',
});

/* デイロボExcelを参考にした仮データ */
const INITIAL_CHILDREN: ChildItem[] = [
  {
    id: 'c1', name: '川島舞桜', grade_type: 'preschool', is_active: true,
    patterns: [
      { name: '保育園', pickup_location: '学校', pickup_time: '13:45', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '自宅', pickup_location: 'おけいこ', pickup_time: '14:25', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '学校（短縮）', pickup_location: '短縮', pickup_time: '11:30', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '自宅', pickup_location: '自宅', pickup_time: '10:30', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '休み', pickup_location: '保護者', pickup_time: '10:15', pickup_method: 'parent', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '' },
    ],
  },
  {
    id: 'c2', name: '川島颯斗', grade_type: 'elementary_4', is_active: true,
    patterns: [
      { name: '学校（通常）', pickup_location: '学校', pickup_time: '13:45', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: 'おけいこ', pickup_location: 'おけいこ', pickup_time: '14:25', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '学校（短縮）', pickup_location: '短縮', pickup_time: '11:30', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '自宅', pickup_location: '自宅', pickup_time: '10:30', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '休み', pickup_location: '自宅', pickup_time: '11:20', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:10', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
    ],
  },
  {
    id: 'c4', name: '清水隼音', grade_type: 'elementary_4', is_active: true,
    patterns: [
      { name: '学校（通常）', pickup_location: '学校', pickup_time: '13:45', pickup_method: 'pickup', dropoff_location: '大府緑公', dropoff_time: '16:40', dropoff_method: 'dropoff', area_label: '🏭 大府' },
      { name: '自宅', pickup_location: '自宅', pickup_time: '10:30', pickup_method: 'pickup', dropoff_location: '大府緑公', dropoff_time: '16:40', dropoff_method: 'dropoff', area_label: '🏭 大府' },
      { name: '休み', pickup_location: '学校', pickup_time: '12:20', pickup_method: 'pickup', dropoff_location: '大府緑公', dropoff_time: '16:40', dropoff_method: 'dropoff', area_label: '🏭 大府' },
    ],
  },
  {
    id: 'c5', name: '滝川希', grade_type: 'preschool', is_active: true,
    patterns: [
      { name: '保育園', pickup_location: '藤江保', pickup_time: '13:25', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:00', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '自宅', pickup_location: '自宅', pickup_time: '10:30', pickup_method: 'pickup', dropoff_location: '自宅', dropoff_time: '17:00', dropoff_method: 'dropoff', area_label: '🍇 藤江' },
      { name: '休み', pickup_location: '保護者', pickup_time: '10:15', pickup_method: 'parent', dropoff_location: '自宅', dropoff_time: '17:00', dropoff_method: 'dropoff', area_label: '' },
    ],
  },
];

export default function ChildrenSettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [children, setChildren] = useState<ChildItem[]>(INITIAL_CHILDREN);
  const [editing, setEditing] = useState<ChildItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleAdd = () => {
    setEditing({ id: `c${Date.now()}`, name: '', grade_type: 'elementary_1', is_active: true, patterns: [emptyPattern()] });
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

  const smallInput: React.CSSProperties = {
    ...inputStyle, padding: '6px 8px', fontSize: '0.8rem',
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

        {/* 児童一覧テーブル */}
        <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
          <table className="w-full border-collapse" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {['氏名', '学年', 'パターン数', 'エリア', 'ステータス', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ background: 'var(--ink)', color: '#fff' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--accent-pale)] cursor-pointer" onClick={() => handleEdit(c)}>
                  <td className="px-3 py-2 font-medium" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink)' }}>{c.name}</td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant="info">{GRADE_LABELS[c.grade_type]}</Badge>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {c.patterns.length}パターン
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                    {[...new Set(c.patterns.map((p) => p.area_label).filter(Boolean))].join(' ')}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? '有効' : '無効'}</Badge>
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>編集</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編集モーダル */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={isNew ? '児童追加' : `${editing?.name} の設定`} size="lg">
        {editing && (
          <div className="flex flex-col gap-5">
            {/* 基本情報 */}
            <div className="grid grid-cols-3 gap-3">
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
                    /* 学年変更時、空のパターンの迎え時間にデフォルト値を入れる */
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

            {/* 送迎パターン（デイロボExcel準拠） */}
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
                  {/* 上段: 区分 + エリア + 削除 */}
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={p.name}
                      onChange={(e) => updatePattern(i, 'name', e.target.value)}
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
                      {MOCK_AREAS.map((a) => (<option key={a} value={a}>{a}</option>))}
                    </select>
                    <button
                      onClick={() => setEditing({ ...editing, patterns: editing.patterns.filter((_, j) => j !== i) })}
                      className="text-xs px-2 py-1 rounded hover:bg-[var(--red-pale)]"
                      style={{ color: 'var(--red)' }}
                    >
                      削除
                    </button>
                  </div>

                  {/* 下段: 迎え｜送り 横並び */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* 迎え側 */}
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded"
                      style={{ background: 'var(--accent-pale)', border: '1px solid rgba(26,62,184,0.1)' }}
                    >
                      <span className="text-xs font-bold shrink-0" style={{ color: 'var(--accent)' }}>迎🚗←</span>
                      <input type="text" value={p.pickup_location} onChange={(e) => updatePattern(i, 'pickup_location', e.target.value)} placeholder="場所" className="outline-none w-16 text-xs bg-transparent" style={{ color: 'var(--ink)' }} />
                      <input type="time" value={p.pickup_time} onChange={(e) => updatePattern(i, 'pickup_time', e.target.value)} className="outline-none text-xs bg-transparent w-20" style={{ color: 'var(--ink)' }} />
                      <select value={p.pickup_method} onChange={(e) => updatePattern(i, 'pickup_method', e.target.value)} className="outline-none text-xs bg-transparent" style={{ color: 'var(--accent)' }}>
                        {Object.entries(METHOD_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                      </select>
                    </div>

                    {/* 送り側 */}
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded"
                      style={{ background: 'var(--green-pale)', border: '1px solid rgba(42,122,82,0.1)' }}
                    >
                      <span className="text-xs font-bold shrink-0" style={{ color: 'var(--green)' }}>送🚗→</span>
                      <input type="text" value={p.dropoff_location} onChange={(e) => updatePattern(i, 'dropoff_location', e.target.value)} placeholder="場所" className="outline-none w-16 text-xs bg-transparent" style={{ color: 'var(--ink)' }} />
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

            {/* 保存 */}
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
