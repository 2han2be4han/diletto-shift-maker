'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { ParsedScheduleEntry } from '@/types';
import { parseChildName } from '@/lib/utils/parseChildName';

/**
 * Excelコピペインポートモーダル
 *
 * Excelから利用予定表をそのままコピー&ペーストで取り込む。
 *
 * 対応フォーマット:
 * - 横型（デイロボ/Excel送迎表）: 1行目=日付ヘッダー、以降=児童行
 *   各セルに「迎 13:20\n送 16:00」のような複数行データ
 * - 縦型: 児童名 / 日付 / 迎え / 送り の列
 *
 * Excelでセルに改行がある場合、コピーするとダブルクォートで囲まれる。
 * 例: "迎 13:20\n送 16:00" のようなTSV形式になる。
 */

type ExcelPasteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entries: ParsedScheduleEntry[]) => void;
  year: number;
  month: number;
};

export default function ExcelPasteModal({
  isOpen,
  onClose,
  onConfirm,
  year,
  month,
}: ExcelPasteModalProps) {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedScheduleEntry[]>([]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'paste' | 'preview'>('paste');

  const handleParse = () => {
    setError('');
    try {
      const entries = parseExcelClipboard(rawText, year, month);
      if (entries.length === 0) {
        setError('有効なデータが見つかりませんでした。Excelの利用予定表をヘッダー行・児童名列を含めてコピーしてください。');
        return;
      }
      setParsed(entries);
      setStep('preview');
    } catch {
      setError('データの解析に失敗しました。Excelからそのままコピーしたデータか確認してください。');
    }
  };

  const handleConfirm = () => {
    onConfirm(parsed);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setRawText('');
    setParsed([]);
    setError('');
    setStep('paste');
  };

  const childNames = [...new Set(parsed.map((e) => e.child_name))];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { handleReset(); onClose(); }}
      title="Excelから貼り付け"
    >
      <div className="flex flex-col gap-4">
        {step === 'paste' && (
          <>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Excelの利用予定表を<strong>ヘッダー行と児童名列を含めて</strong>範囲選択し、
              コピー（Ctrl+C）してから下に貼り付け（Ctrl+V）してください。
            </p>

            {/* フォーマット説明 */}
            <div
              className="px-3 py-2 text-xs"
              style={{ background: 'var(--accent-pale)', borderRadius: '6px', color: 'var(--ink-2)' }}
            >
              <strong>対応フォーマット:</strong>
              <br />• 横型（1行目が日付、各セルに「迎 13:20 / 送 16:00」）
              <br />• 縦型（児童名・日付・迎え・送り の列）
              <br />• セル内改行があるExcelデータもそのまま対応
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={'Excelからコピーしたデータを貼り付けてください...\n\n例:\n氏名\t1(水)\t2(木)\t3(金)\n川島舞桜\t迎 13:20 送 16:00\t...\n'}
              rows={12}
              className="w-full px-3 py-3 text-xs outline-none resize-y"
              style={{
                background: 'var(--bg)',
                color: 'var(--ink)',
                border: '1px solid var(--rule)',
                borderRadius: '6px',
                fontFamily: 'monospace',
                lineHeight: '1.6',
              }}
            />

            {error && (
              <p
                className="text-xs font-medium px-3 py-2"
                style={{ color: 'var(--red)', background: 'var(--red-pale)', borderRadius: '4px' }}
              >
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { handleReset(); onClose(); }}>
                キャンセル
              </Button>
              <Button variant="primary" onClick={handleParse} disabled={!rawText.trim()}>
                プレビュー
              </Button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <ExcelGridPreview
            parsed={parsed}
            onParsedChange={setParsed}
            childNames={childNames}
            onBack={() => setStep('paste')}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </Modal>
  );
}

/* ================================================================
 * Excel風グリッドプレビュー（児童×日付）
 * パースされたデータをデイロボ風のグリッドで表示し、セルを直接編集可能
 * ================================================================ */

function ExcelGridPreview({
  parsed,
  onParsedChange,
  childNames,
  onBack,
  onConfirm,
}: {
  parsed: ParsedScheduleEntry[];
  onParsedChange: (entries: ParsedScheduleEntry[]) => void;
  childNames: string[];
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [editingCell, setEditingCell] = useState<{ child: string; date: string } | null>(null);

  /* 日付リストを抽出してソート */
  const dates = [...new Set(parsed.map((e) => e.date))].sort();

  /* 児童×日付のマップを構築 */
  const cellMap = new Map<string, ParsedScheduleEntry>();
  parsed.forEach((e) => cellMap.set(`${e.child_name}_${e.date}`, e));

  /* セル編集 */
  const handleCellUpdate = (
    childName: string,
    date: string,
    field: 'pickup_time' | 'dropoff_time',
    value: string
  ) => {
    const key = `${childName}_${date}`;
    const existing = cellMap.get(key);
    if (existing) {
      onParsedChange(
        parsed.map((e) =>
          e.child_name === childName && e.date === date
            ? { ...e, [field]: value || null }
            : e
        )
      );
    }
  };

  /* 行削除 */
  const handleDeleteChild = (childName: string) => {
    onParsedChange(parsed.filter((e) => e.child_name !== childName));
  };

  /* 日付のフォーマット（YYYY-MM-DD → D） */
  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDate();
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return { day, dow, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
  };

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="success">{parsed.length}件</Badge>
        <Badge variant="info">{childNames.length}名</Badge>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>セルをクリックして時間を修正できます</span>
      </div>

      <div
        className="overflow-auto"
        style={{ maxHeight: '450px', borderRadius: '6px', border: '1px solid var(--rule)' }}
      >
        <table
          className="border-collapse"
          style={{ fontSize: '0.75rem', minWidth: `${dates.length * 72 + 120}px` }}
        >
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 px-2 py-1.5 text-left font-semibold"
                style={{
                  background: 'var(--ink)', color: '#fff',
                  borderRight: '2px solid rgba(255,255,255,0.2)',
                  minWidth: '100px',
                }}
              >
                氏名
              </th>
              {dates.map((date) => {
                const { day, dow, isWeekend } = formatDay(date);
                return (
                  <th
                    key={date}
                    className="px-1 py-1.5 text-center font-semibold whitespace-nowrap"
                    style={{
                      background: 'var(--ink)', color: isWeekend ? 'rgba(255,255,255,0.5)' : '#fff',
                      borderRight: '1px solid rgba(255,255,255,0.1)',
                      minWidth: '64px',
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{dow}</div>
                    <div>{day}</div>
                  </th>
                );
              })}
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ background: 'var(--ink)', color: '#fff', minWidth: '36px' }}
              >
                削除
              </th>
            </tr>
          </thead>
          <tbody>
            {childNames.map((childName) => {
              const { name, gradeLabel } = parseChildName(childName);
              return (
              <tr key={childName}>
                <td
                  className="sticky left-0 z-10 px-2 py-1 font-medium whitespace-nowrap"
                  style={{
                    background: 'var(--white)',
                    borderBottom: '1px solid var(--rule)',
                    borderRight: '2px solid var(--rule-strong)',
                    color: 'var(--ink)',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{name}</span>
                    {gradeLabel && (
                      <span
                        className="text-xs px-1 rounded"
                        style={{ background: 'var(--accent-pale)', color: 'var(--accent)', fontSize: '0.6rem' }}
                      >
                        {gradeLabel}
                      </span>
                    )}
                  </div>
                </td>
                {dates.map((date) => {
                  const entry = cellMap.get(`${childName}_${date}`);
                  const isEditing = editingCell?.child === childName && editingCell?.date === date;
                  const { isWeekend } = formatDay(date);

                  return (
                    <td
                      key={date}
                      className="px-0.5 py-0.5 text-center cursor-pointer transition-colors hover:bg-[var(--accent-pale)]"
                      style={{
                        borderBottom: '1px solid var(--rule)',
                        borderRight: '1px solid var(--rule)',
                        background: isWeekend ? 'rgba(0,0,0,0.02)' : 'transparent',
                        position: 'relative',
                      }}
                      onClick={() => setEditingCell(entry ? { child: childName, date } : null)}
                    >
                      {entry?.area_label ? (
                        <span className="text-xs" style={{ color: 'var(--accent)' }}>{entry.area_label}</span>
                      ) : entry ? (
                        <div className="flex flex-col leading-tight">
                          {entry.pickup_time && (
                            <span style={{ color: 'var(--accent)', fontSize: '0.68rem' }}>迎 {entry.pickup_time}</span>
                          )}
                          {entry.dropoff_time && (
                            <span style={{ color: 'var(--green)', fontSize: '0.68rem' }}>送 {entry.dropoff_time}</span>
                          )}
                        </div>
                      ) : null}

                      {/* インライン編集ポップオーバー */}
                      {isEditing && entry && (
                        <div
                          className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 p-2 flex flex-col gap-1.5 w-36"
                          style={{
                            background: 'var(--white)', borderRadius: '6px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid var(--rule)',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                            {childName} {formatDay(date).day}日
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs w-6" style={{ color: 'var(--accent)' }}>迎</span>
                            <input
                              type="time"
                              value={entry.pickup_time || ''}
                              onChange={(e) => handleCellUpdate(childName, date, 'pickup_time', e.target.value)}
                              className="flex-1 px-1 py-0.5 text-xs outline-none"
                              style={{ border: '1px solid var(--rule)', borderRadius: '3px', color: 'var(--ink)' }}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs w-6" style={{ color: 'var(--green)' }}>送</span>
                            <input
                              type="time"
                              value={entry.dropoff_time || ''}
                              onChange={(e) => handleCellUpdate(childName, date, 'dropoff_time', e.target.value)}
                              className="flex-1 px-1 py-0.5 text-xs outline-none"
                              style={{ border: '1px solid var(--rule)', borderRadius: '3px', color: 'var(--ink)' }}
                            />
                          </div>
                          <button
                            onClick={() => setEditingCell(null)}
                            className="text-xs font-semibold py-0.5 rounded"
                            style={{ background: 'var(--accent)', color: '#fff', borderRadius: '3px' }}
                          >
                            OK
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td
                  className="px-1 py-1 text-center"
                  style={{ borderBottom: '1px solid var(--rule)' }}
                >
                  <button
                    onClick={() => handleDeleteChild(childName)}
                    className="text-xs hover:opacity-70"
                    style={{ color: 'var(--red)' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          戻る
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          この内容で登録する（{parsed.length}件）
        </Button>
      </div>
    </>
  );
}

/* ================================================================
 * Excel TSV パーサー
 * ================================================================
 * Excelからコピーすると、セル内改行を含むセルは "" で囲まれる。
 * 例: "迎 13:20\n送 16:00"\t"迎 09:30\n送 16:00"\t...
 * これを正しくパースして、児童×日付の利用予定に変換する。
 * ================================================================ */

function parseExcelClipboard(
  raw: string,
  year: number,
  month: number
): ParsedScheduleEntry[] {
  const rows = parseTsvWithQuotes(raw);
  if (rows.length < 2) return [];

  /* 1行目をヘッダーとして日付を抽出 */
  const headerRow = rows[0];
  const dateColumns: { colIndex: number; dateStr: string }[] = [];

  for (let i = 1; i < headerRow.length; i++) {
    const dateStr = parseDateFromHeader(headerRow[i], year, month);
    if (dateStr) {
      dateColumns.push({ colIndex: i, dateStr });
    }
  }

  /* ヘッダーから日付が取れない場合 → 縦型フォーマットを試行 */
  if (dateColumns.length === 0) {
    return parseVerticalFormat(rows, year, month);
  }

  /* 横型パース: 各行 = 1児童、各列 = 1日 */
  const entries: ParsedScheduleEntry[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const childName = cleanChildName(row[0]);
    if (!childName || childName === '利用数' || childName === '利用人数') continue;

    for (const dc of dateColumns) {
      const cellValue = row[dc.colIndex] || '';
      if (!cellValue.trim()) continue;

      const { pickup, dropoff, note } = parseCellValue(cellValue);

      if (pickup || dropoff || note) {
        entries.push({
          child_name: childName,
          date: dc.dateStr,
          pickup_time: pickup,
          dropoff_time: dropoff,
          area_label: note,
        });
      }
    }
  }

  return entries;
}

/**
 * TSVをパース（ダブルクォートで囲まれたセル内改行に対応）
 * Excelのコピー形式: フィールドはタブ区切り、改行を含むセルは "" で囲む
 */
function parseTsvWithQuotes(raw: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        /* 次の文字も " ならエスケープ ("") */
        if (i + 1 < raw.length && raw[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        /* クォート終了 */
        inQuotes = false;
        i++;
        continue;
      }
      currentField += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === '\t') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        currentField = '';
        if (ch === '\r' && i + 1 < raw.length && raw[i + 1] === '\n') {
          i++; // skip \r\n
        }
        /* 空行でなければ追加 */
        if (currentRow.some((f) => f.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  /* 最後のフィールド/行を追加 */
  currentRow.push(currentField);
  if (currentRow.some((f) => f.trim())) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * セル値から迎え/送り時間を抽出
 * 対応パターン:
 * - "迎 13:20\n送 16:00"
 * - "迎 13:20\n16:00"（送り省略）
 * - "13:20\n16:00"（迎え/送り省略）
 * - "定‧休", "追・休" などの特殊ステータス
 */
function parseCellValue(cell: string): {
  pickup: string | null;
  dropoff: string | null;
  note: string | null;
} {
  const text = cell.trim();

  /* 特殊ステータス */
  if (/[定追][\s・‧][休]/.test(text) || text === '定休' || text === '追休') {
    return { pickup: null, dropoff: null, note: text.replace(/\s+/g, '') };
  }

  const times: { time: string; type: 'pickup' | 'dropoff' | 'unknown' }[] = [];

  /* 各行を分割して解析 */
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const timeMatch = line.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) continue;

    const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;

    if (line.includes('迎')) {
      times.push({ time, type: 'pickup' });
    } else if (line.includes('送')) {
      times.push({ time, type: 'dropoff' });
    } else {
      times.push({ time, type: 'unknown' });
    }
  }

  if (times.length === 0) return { pickup: null, dropoff: null, note: null };

  let pickup: string | null = null;
  let dropoff: string | null = null;

  /* 明示的なタイプがある場合 */
  const pickupEntry = times.find((t) => t.type === 'pickup');
  const dropoffEntry = times.find((t) => t.type === 'dropoff');

  if (pickupEntry) pickup = pickupEntry.time;
  if (dropoffEntry) dropoff = dropoffEntry.time;

  /* 不明なタイプが残っている場合、位置で推定 */
  if (!pickup && !dropoff && times.length >= 2) {
    /* 先の時間が迎え、後の時間が送り */
    pickup = times[0].time;
    dropoff = times[1].time;
  } else if (!pickup && !dropoff && times.length === 1) {
    /* 1つだけの場合、時間帯で推定（13時以前=迎え、それ以降は迎え） */
    pickup = times[0].time;
  }

  /* unknown を埋める */
  const unknowns = times.filter((t) => t.type === 'unknown');
  for (const u of unknowns) {
    if (!pickup && u.time !== dropoff) { pickup = u.time; continue; }
    if (!dropoff && u.time !== pickup) { dropoff = u.time; }
  }

  return { pickup, dropoff, note: null };
}

/** ヘッダーから日付を抽出: "1(水)", "営 1(水)", "休 5(日)", "4/1" */
function parseDateFromHeader(header: string, year: number, month: number): string | null {
  if (!header || !header.trim()) return null;
  const cleaned = header.trim();

  /* "営 1(水)" "休 5(日)" "1(水)" パターン */
  const match = cleaned.match(/(\d{1,2})\s*[\(（]/);
  if (match) {
    const d = parseInt(match[1], 10);
    if (d >= 1 && d <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  /* 数字のみ */
  const numMatch = cleaned.match(/^[^\d]*(\d{1,2})[^\d]*$/);
  if (numMatch) {
    const d = parseInt(numMatch[1], 10);
    if (d >= 1 && d <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

/** 縦型フォーマット: 児童名 \t 日付 \t 迎え \t 送り */
function parseVerticalFormat(
  rows: string[][],
  year: number,
  month: number
): ParsedScheduleEntry[] {
  const entries: ParsedScheduleEntry[] = [];

  for (const row of rows) {
    if (row.length < 2) continue;
    const childName = cleanChildName(row[0]);
    if (!childName || childName === '氏名' || childName === '児童名') continue;

    const dateStr = parseDate(row[1], year, month);
    if (!dateStr) continue;

    const pickupTime = parseTimeStr(row[2]);
    const dropoffTime = parseTimeStr(row[3]);

    if (pickupTime || dropoffTime) {
      entries.push({
        child_name: childName,
        date: dateStr,
        pickup_time: pickupTime,
        dropoff_time: dropoffTime,
        area_label: row[4]?.trim() || null,
      });
    }
  }

  return entries;
}

/** 児童名のクリーンアップ: 前後の空白、改行、✓マーク除去 */
function cleanChildName(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/[✓✅☑]/g, '').replace(/[\n\r]/g, ' ').trim();
}

/** 日付文字列をパース */
function parseDate(str: string | undefined, year: number, month: number): string | null {
  if (!str) return null;
  const cleaned = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    return `${year}-${String(parseInt(slashMatch[1])).padStart(2, '0')}-${String(parseInt(slashMatch[2])).padStart(2, '0')}`;
  }
  const dayOnly = cleaned.match(/^(\d{1,2})$/);
  if (dayOnly) {
    const d = parseInt(dayOnly[1], 10);
    if (d >= 1 && d <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** 時間文字列をパース */
function parseTimeStr(str: string | undefined): string | null {
  if (!str) return null;
  const match = str.trim().match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return null;
}
