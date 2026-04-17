'use client';

import type { ChildRow, ChildTransportPatternRow, ParsedScheduleEntry } from '@/types';

/**
 * PDF解析結果の確認テーブル
 * - 解析結果を一覧表示
 * - 各行を編集可能（時間の修正、行の削除、Phase 27-A-1: パターン切替）
 * - 確認後に親コンポーネントへ渡す
 *
 * Phase 27-A-1: パターン列を追加。児童名横に 🔗 (紐付け済) / ⚠ (該当なし) マーク。
 * 時刻完全一致 or 過去最頻 or 最初の 1 件 で初期選択済み（親から渡される pattern_id）。
 */

type PdfConfirmTableProps = {
  entries: ParsedScheduleEntry[];
  onEntriesChange: (entries: ParsedScheduleEntry[]) => void;
  childList: ChildRow[];
  patterns: ChildTransportPatternRow[];
};

function fmtTime(t: string | null | undefined): string {
  if (!t) return '--:--';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function PdfConfirmTable({
  entries,
  onEntriesChange,
  childList,
  patterns,
}: PdfConfirmTableProps) {
  /* 児童名でグループ化 */
  const childNames = [...new Set(entries.map((e) => e.child_name))];
  const nameToChildId = new Map(childList.map((c) => [c.name, c.id]));
  const patternsByChild = new Map<string, ChildTransportPatternRow[]>();
  for (const p of patterns) {
    const list = patternsByChild.get(p.child_id) ?? [];
    list.push(p);
    patternsByChild.set(p.child_id, list);
  }
  const patternById = new Map(patterns.map((p) => [p.id, p]));

  const handleDelete = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    onEntriesChange(updated);
  };

  const handleTimeChange = (
    index: number,
    field: 'pickup_time' | 'dropoff_time',
    value: string
  ) => {
    const updated = entries.map((entry, i) =>
      i === index ? { ...entry, [field]: value || null } : entry
    );
    onEntriesChange(updated);
  };

  const handlePatternChange = (index: number, patternId: string) => {
    const updated = entries.map((entry, i) =>
      i === index ? { ...entry, pattern_id: patternId === '' ? null : patternId } : entry
    );
    onEntriesChange(updated);
  };

  const unlinkedCount = entries.filter((e) => !e.pattern_id).length;

  return (
    <div
      className="overflow-auto"
      style={{ maxHeight: '400px', borderRadius: '6px', border: '1px solid var(--rule)' }}
    >
      <table className="w-full border-collapse" style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            {['児童名', '日付', '迎え', '送り', 'パターン', '削除'].map((h, i) => (
              <th
                key={h}
                className="sticky top-0 px-3 py-2 font-semibold"
                style={{
                  background: 'var(--ink)',
                  color: '#fff',
                  borderBottom: '1px solid var(--rule)',
                  textAlign: i >= 2 && i <= 3 ? 'center' : i >= 4 ? 'center' : 'left',
                  width: h === '削除' ? '40px' : undefined,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const isFirstOfChild =
              index === 0 || entries[index - 1].child_name !== entry.child_name;
            const childId = nameToChildId.get(entry.child_name);
            const childPatterns = childId ? patternsByChild.get(childId) ?? [] : [];
            const hasPattern = Boolean(entry.pattern_id);
            const mark = hasPattern ? '🔗' : '⚠';
            const markColor = hasPattern ? 'var(--green)' : 'var(--gold)';
            return (
              <tr
                key={`${entry.child_name}_${entry.date}_${index}`}
                className="transition-colors hover:bg-[var(--accent-pale)]"
              >
                {/* 児童名 + マーク */}
                <td
                  className="px-3 py-1.5 font-medium"
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    color: 'var(--ink)',
                    background: isFirstOfChild ? 'var(--bg)' : 'transparent',
                  }}
                >
                  {isFirstOfChild ? (
                    <span className="inline-flex items-center gap-1">
                      <span style={{ color: markColor }} title={hasPattern ? 'パターン紐付け済' : 'パターン未選択'}>{mark}</span>
                      {entry.child_name}
                    </span>
                  ) : (
                    ''
                  )}
                </td>

                {/* 日付 */}
                <td
                  className="px-3 py-1.5"
                  style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}
                >
                  {entry.date}
                </td>

                {/* 迎え時間 */}
                <td
                  className="px-1 py-1.5 text-center"
                  style={{ borderBottom: '1px solid var(--rule)' }}
                >
                  <input
                    type="time"
                    value={entry.pickup_time || ''}
                    onChange={(e) => handleTimeChange(index, 'pickup_time', e.target.value)}
                    className="w-20 px-1 py-0.5 text-center text-xs outline-none"
                    style={{
                      border: '1px solid var(--rule)',
                      borderRadius: '4px',
                      color: 'var(--accent)',
                    }}
                  />
                </td>

                {/* 送り時間 */}
                <td
                  className="px-1 py-1.5 text-center"
                  style={{ borderBottom: '1px solid var(--rule)' }}
                >
                  <input
                    type="time"
                    value={entry.dropoff_time || ''}
                    onChange={(e) => handleTimeChange(index, 'dropoff_time', e.target.value)}
                    className="w-20 px-1 py-0.5 text-center text-xs outline-none"
                    style={{
                      border: '1px solid var(--rule)',
                      borderRadius: '4px',
                      color: 'var(--green)',
                    }}
                  />
                </td>

                {/* パターン選択 */}
                <td
                  className="px-2 py-1.5"
                  style={{ borderBottom: '1px solid var(--rule)' }}
                >
                  {childPatterns.length === 0 ? (
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>（パターン未登録）</span>
                  ) : (
                    <select
                      value={entry.pattern_id ?? ''}
                      onChange={(e) => handlePatternChange(index, e.target.value)}
                      className="w-full px-1.5 py-1 text-xs outline-none"
                      style={{
                        border: `1px solid ${hasPattern ? 'var(--rule)' : 'var(--gold)'}`,
                        borderRadius: '4px',
                        background: hasPattern ? 'var(--white)' : 'var(--gold-pale)',
                        color: 'var(--ink)',
                      }}
                    >
                      <option value="">（該当なし）</option>
                      {childPatterns.map((p) => {
                        const pt = fmtTime(p.pickup_time);
                        const dt = fmtTime(p.dropoff_time);
                        const area = p.pickup_area_label ?? p.dropoff_area_label ?? p.area_label ?? '';
                        return (
                          <option key={p.id} value={p.id}>
                            {p.pattern_name} {area ? `[${area}]` : ''} 迎{pt}/送{dt}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  {entry.pattern_id && patternById.get(entry.pattern_id) && (() => {
                    const p = patternById.get(entry.pattern_id)!;
                    const autoMatch = fmtTime(p.pickup_time) === fmtTime(entry.pickup_time)
                      && fmtTime(p.dropoff_time) === fmtTime(entry.dropoff_time);
                    if (autoMatch) return null;
                    return (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        ※ パターンの時刻と差異あり（{fmtTime(p.pickup_time)}/{fmtTime(p.dropoff_time)}）
                      </div>
                    );
                  })()}
                </td>

                {/* 削除ボタン */}
                <td
                  className="px-1 py-1.5 text-center"
                  style={{ borderBottom: '1px solid var(--rule)' }}
                >
                  <button
                    onClick={() => handleDelete(index)}
                    className="text-xs hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--red)' }}
                    title="この行を削除"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* サマリー */}
      <div
        className="px-3 py-2 text-xs font-medium flex gap-4 flex-wrap items-center"
        style={{ background: 'var(--bg)', borderTop: '1px solid var(--rule)', color: 'var(--ink-2)' }}
      >
        <span>児童数: {childNames.length}名</span>
        <span>レコード数: {entries.length}件</span>
        {unlinkedCount > 0 && (
          <span style={{ color: 'var(--gold)' }}>
            ⚠ パターン未選択: {unlinkedCount}件（このままでも登録できますが /transport で場所が空欄になります）
          </span>
        )}
      </div>
    </div>
  );
}
