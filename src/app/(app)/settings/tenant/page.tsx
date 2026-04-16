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

/**
 * 資格種類の定義
 * - countable: 人員配置基準でカウントされる資格
 * - non_countable: 配置基準外（児発管・専門職員・加配加算）
 */
type QualificationType = {
  name: string;
  countable: boolean; // true=有資格者カウント対象
};

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tenantName, setTenantName] = useState('サンプル事業所');
  const [areas, setAreas] = useState<AreaLabel[]>(DEFAULT_AREAS);
  const [qualifications, setQualifications] = useState<QualificationType[]>(DEFAULT_QUALIFICATIONS);
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

          {/* 資格種類管理 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>資格種類</label>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              「カウント対象」がONの資格を持つ職員が、シフト生成時の有資格者カウントに含まれます。
              <br />児発管・専門職員・加配加算などはOFFにしてください。
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

          {/* 有資格者最低出勤人数 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>有資格者の最低出勤人数</label>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              上記で「カウント対象」ONの資格を持つ職員がこの人数以上出勤するようにシフトを生成します。
            </p>
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
