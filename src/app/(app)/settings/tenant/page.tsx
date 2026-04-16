'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

/**
 * テナント設定ページ（admin専用）
 * - 事業所名
 * - 送迎エリア設定（絵文字ラベル + エリア名）
 * - 有資格者最低出勤人数
 * - 休み希望締切日
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

type AreaLabel = { emoji: string; name: string };

const DEFAULT_AREAS: AreaLabel[] = [
  { emoji: '🍇', name: '藤江' },
  { emoji: '🌳', name: '豊明' },
  { emoji: '🏭', name: '大府' },
  { emoji: '✈', name: '常滑' },
  { emoji: '🍶', name: '学童エリア' },
];

export default function TenantSettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tenantName, setTenantName] = useState('サンプル事業所');
  const [areas, setAreas] = useState<AreaLabel[]>(DEFAULT_AREAS);
  const [minQualified, setMinQualified] = useState(2);
  const [requestDeadline, setRequestDeadline] = useState(20);
  const [saved, setSaved] = useState(false);

  const handleAddArea = () => {
    setAreas([...areas, { emoji: '📍', name: '' }]);
  };

  const handleRemoveArea = (index: number) => {
    setAreas(areas.filter((_, i) => i !== index));
  };

  const handleAreaChange = (index: number, field: 'emoji' | 'name', value: string) => {
    setAreas(areas.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  const handleSave = () => {
    // TODO: Supabase連携後にDB保存
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '0.9rem',
  };

  return (
    <>
      <Header title="テナント設定" onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>事業所設定</h2>
          <Badge variant="info">admin専用</Badge>
        </div>

        <div className="flex flex-col gap-6">
          {/* 事業所名 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>事業所名</label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full outline-none"
              style={inputStyle}
            />
          </div>

          {/* 送迎エリア */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>送迎エリア</label>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              絵文字ラベルとエリア名を設定します。職員の対応エリア選択に使用されます。
            </p>
            <div className="flex flex-col gap-2">
              {areas.map((area, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={area.emoji}
                    onChange={(e) => handleAreaChange(i, 'emoji', e.target.value)}
                    className="w-14 text-center outline-none"
                    style={inputStyle}
                    placeholder="🏠"
                  />
                  <input
                    type="text"
                    value={area.name}
                    onChange={(e) => handleAreaChange(i, 'name', e.target.value)}
                    className="flex-1 outline-none"
                    style={inputStyle}
                    placeholder="エリア名"
                  />
                  <button
                    onClick={() => handleRemoveArea(i)}
                    className="text-xs px-2 py-2 rounded transition-colors hover:bg-[var(--red-pale)]"
                    style={{ color: 'var(--red)' }}
                  >
                    削除
                  </button>
                </div>
              ))}
              <Button variant="secondary" onClick={handleAddArea}>
                + エリア追加
              </Button>
            </div>
          </div>

          {/* 有資格者最低出勤人数 */}
          <div className="flex flex-col gap-2">
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

          {/* 休み希望締切日 */}
          <div className="flex flex-col gap-2">
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

          {/* 保存ボタン */}
          <div className="flex items-center gap-3 mt-2">
            <Button variant="primary" onClick={handleSave}>保存</Button>
            {saved && <Badge variant="success">保存しました</Badge>}
          </div>
        </div>
      </div>
    </>
  );
}
