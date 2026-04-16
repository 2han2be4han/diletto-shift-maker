'use client';

import type { ParsedScheduleEntry } from '@/types';

/**
 * PDF解析結果の確認テーブル
 * - 解析結果を一覧表示
 * - 各行を編集可能（時間の修正、行の削除）
 * - 確認後に親コンポーネントへ渡す
 */

type PdfConfirmTableProps = {
  entries: ParsedScheduleEntry[];
  onEntriesChange: (entries: ParsedScheduleEntry[]) => void;
};

export default function PdfConfirmTable({ entries, onEntriesChange }: PdfConfirmTableProps) {
  /* 児童名でグループ化 */
  const childNames = [...new Set(entries.map((e) => e.child_name))];

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

  return (
    <div
      className="overflow-auto"
      style={{ maxHeight: '400px', borderRadius: '6px', border: '1px solid var(--rule)' }}
    >
      <table className="w-full border-collapse" style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th
              className="sticky top-0 px-3 py-2 text-left font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', borderBottom: '1px solid var(--rule)' }}
            >
              児童名
            </th>
            <th
              className="sticky top-0 px-3 py-2 text-left font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', borderBottom: '1px solid var(--rule)' }}
            >
              日付
            </th>
            <th
              className="sticky top-0 px-3 py-2 text-center font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', borderBottom: '1px solid var(--rule)' }}
            >
              迎え
            </th>
            <th
              className="sticky top-0 px-3 py-2 text-center font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', borderBottom: '1px solid var(--rule)' }}
            >
              送り
            </th>
            <th
              className="sticky top-0 px-3 py-2 text-center font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', borderBottom: '1px solid var(--rule)' }}
            >
              備考
            </th>
            <th
              className="sticky top-0 px-3 py-2 text-center font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', borderBottom: '1px solid var(--rule)', width: '40px' }}
            >
              削除
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            /* 児童名の最初の行かどうか（グループ表示用） */
            const isFirstOfChild =
              index === 0 || entries[index - 1].child_name !== entry.child_name;

            return (
              <tr
                key={`${entry.child_name}_${entry.date}_${index}`}
                className="transition-colors hover:bg-[var(--accent-pale)]"
              >
                {/* 児童名 */}
                <td
                  className="px-3 py-1.5 font-medium"
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    color: 'var(--ink)',
                    background: isFirstOfChild ? 'var(--bg)' : 'transparent',
                  }}
                >
                  {isFirstOfChild ? entry.child_name : ''}
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

                {/* 備考 */}
                <td
                  className="px-3 py-1.5 text-center text-xs"
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    color: entry.area_label ? 'var(--accent)' : 'var(--ink-3)',
                  }}
                >
                  {entry.area_label || '-'}
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
        className="px-3 py-2 text-xs font-medium flex gap-4"
        style={{ background: 'var(--bg)', borderTop: '1px solid var(--rule)', color: 'var(--ink-2)' }}
      >
        <span>児童数: {childNames.length}名</span>
        <span>レコード数: {entries.length}件</span>
      </div>
    </div>
  );
}
