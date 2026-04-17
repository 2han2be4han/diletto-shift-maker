'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { ParsedScheduleEntry, GradeType } from '@/types';
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
  /** Phase 22: 既存の児童名一覧（未登録検出用） */
  existingChildNames?: string[];
  /** Phase 22: 登録完了後に呼ばれる再取得コールバック */
  onChildrenRegistered?: () => Promise<void> | void;
};

export default function ExcelPasteModal({
  isOpen,
  onClose,
  onConfirm,
  year,
  month,
  existingChildNames = [],
  onChildrenRegistered,
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
  /* Phase 22: 未登録の児童名（大文字小文字問わず完全一致でない名前） */
  const existingSet = new Set(existingChildNames.map((n) => n.trim()));
  const unknownChildNames = childNames.filter((n) => !existingSet.has(n.trim()));
  const [registerOpen, setRegisterOpen] = useState(false);

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
            unknownChildNames={unknownChildNames}
            onBack={() => setStep('paste')}
            onConfirm={handleConfirm}
            onRequestRegister={() => setRegisterOpen(true)}
          />
        )}
      </div>

      {/* Phase 22: 未登録児童の一括登録サブダイアログ */}
      {registerOpen && (
        <UnknownChildrenRegisterDialog
          names={unknownChildNames}
          onClose={() => setRegisterOpen(false)}
          onDone={async () => {
            setRegisterOpen(false);
            if (onChildrenRegistered) await onChildrenRegistered();
          }}
        />
      )}
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
  unknownChildNames,
  onBack,
  onConfirm,
  onRequestRegister,
}: {
  parsed: ParsedScheduleEntry[];
  onParsedChange: (entries: ParsedScheduleEntry[]) => void;
  childNames: string[];
  unknownChildNames: string[];
  onBack: () => void;
  onConfirm: () => void;
  onRequestRegister: () => void;
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

      {/* Phase 22: 未登録児童の警告 */}
      {unknownChildNames.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2"
          style={{
            background: 'var(--gold-pale, #fdf6e3)',
            border: '1px solid rgba(184,134,11,0.25)',
            borderRadius: '6px',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--gold, #b8860b)' }}>
            ⚠ 未登録の児童が <strong>{unknownChildNames.length}名</strong> います:
          </span>
          <span className="text-xs flex flex-wrap gap-1" style={{ color: 'var(--ink-2)' }}>
            {unknownChildNames.slice(0, 5).map((n) => (
              <span key={n} className="px-1.5 py-0.5 rounded" style={{ background: 'var(--white, #fff)' }}>
                {n}
              </span>
            ))}
            {unknownChildNames.length > 5 && <span>…他 {unknownChildNames.length - 5}名</span>}
          </span>
          <Button variant="primary" onClick={onRequestRegister}>
            一括登録する
          </Button>
        </div>
      )}

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
  /* Phase 22: NFKC 正規化で Unicode 互換文字（⽒→氏、⾦→金 等）を統一。
     Excelから貼ったときに出る CJK 部首フォームを通常字に変換 */
  const normalized = raw.normalize('NFKC');
  const rows = parseTsvWithQuotes(normalized);
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

      const { pickup, dropoff, pickup_method, dropoff_method, note } = parseCellValue(cellValue);

      if (pickup || dropoff || note) {
        entries.push({
          child_name: childName,
          date: dc.dateStr,
          pickup_time: pickup,
          dropoff_time: dropoff,
          pickup_method,
          dropoff_method,
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
  pickup_method: 'pickup' | 'self';
  dropoff_method: 'dropoff' | 'self';
  note: string | null;
} {
  const text = cell.trim();
  const defaultMethods = { pickup_method: 'pickup' as const, dropoff_method: 'dropoff' as const };

  /* 特殊ステータス */
  if (/[定追][\s・‧][休]/.test(text) || text === '定休' || text === '追休') {
    return { pickup: null, dropoff: null, ...defaultMethods, note: text.replace(/\s+/g, '') };
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

  if (times.length === 0) {
    return { pickup: null, dropoff: null, ...defaultMethods, note: null };
  }

  let pickup: string | null = null;
  let dropoff: string | null = null;
  /* Phase 24: ラベルの有無で 迎/送 か self かを判断 */
  let pickup_method: 'pickup' | 'self' = 'pickup';
  let dropoff_method: 'dropoff' | 'self' = 'dropoff';

  /* 明示的なタイプがある場合 */
  const pickupEntry = times.find((t) => t.type === 'pickup');
  const dropoffEntry = times.find((t) => t.type === 'dropoff');

  if (pickupEntry) {
    pickup = pickupEntry.time;
    pickup_method = 'pickup';
  }
  if (dropoffEntry) {
    dropoff = dropoffEntry.time;
    dropoff_method = 'dropoff';
  }

  /* 不明なタイプが残っている場合、位置で推定 */
  if (!pickup && !dropoff && times.length >= 2) {
    /* 先の時間が来所、後の時間が帰宅。ラベル無しなので self 扱い */
    pickup = times[0].time;
    dropoff = times[1].time;
    pickup_method = 'self';
    dropoff_method = 'self';
  } else if (!pickup && !dropoff && times.length === 1) {
    /* 1つだけの場合、来所時刻として self 扱い */
    pickup = times[0].time;
    pickup_method = 'self';
  }

  /* unknown を埋める: ラベル無しのものは self */
  const unknowns = times.filter((t) => t.type === 'unknown');
  for (const u of unknowns) {
    if (!pickup && u.time !== dropoff) { pickup = u.time; pickup_method = 'self'; continue; }
    if (!dropoff && u.time !== pickup) { dropoff = u.time; dropoff_method = 'self'; }
  }

  return { pickup, dropoff, pickup_method, dropoff_method, note: null };
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
        pickup_method: 'pickup',
        dropoff_method: 'dropoff',
        area_label: row[4]?.trim() || null,
      });
    }
  }

  return entries;
}

/** 児童名のクリーンアップ:
 *  - 前後の空白、改行、✓マーク除去
 *  - Phase 22: 末尾の (学年) / （学年） を除去（例: "川島舞桜 (未就学)" → "川島舞桜"）
 *    ※ 学年はテナント側の children レコードを正とするため Excel の () は無視する
 */
function cleanChildName(raw: string | undefined): string {
  if (!raw) return '';
  const stripped = raw.trim().replace(/[✓✅☑]/g, '').replace(/[\n\r]/g, ' ').trim();
  if (!stripped) return '';
  /* parseChildName が "name (grade)" 形式を分離してくれるので name 部分だけ返す */
  return parseChildName(stripped).name;
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

/* ================================================================
 * Phase 22: 未登録児童の一括登録ダイアログ
 *   - Excel貼付で検出された既存未登録の児童名を一覧化
 *   - 各行に 氏名 / 学年 / 自宅住所 の入力
 *   - 「一括登録」で /api/children に逐次POST
 * ================================================================ */
type UnknownRow = {
  name: string;
  grade_type: GradeType;
  home_address: string;
};

const GRADE_OPTIONS: { value: GradeType; label: string }[] = [
  { value: 'preschool', label: '未就学' },
  { value: 'nursery_3', label: '年少' },
  { value: 'nursery_4', label: '年中' },
  { value: 'nursery_5', label: '年長' },
  { value: 'elementary_1', label: '小1' },
  { value: 'elementary_2', label: '小2' },
  { value: 'elementary_3', label: '小3' },
  { value: 'elementary_4', label: '小4' },
  { value: 'elementary_5', label: '小5' },
  { value: 'elementary_6', label: '小6' },
  { value: 'junior_high_1', label: '中1' },
  { value: 'junior_high_2', label: '中2' },
  { value: 'junior_high_3', label: '中3' },
  { value: 'high_1', label: '高1' },
  { value: 'high_2', label: '高2' },
  { value: 'high_3', label: '高3' },
];

function UnknownChildrenRegisterDialog({
  names,
  onClose,
  onDone,
}: {
  names: string[];
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  /* 初期値: parseChildName で Excel名から学年推定 */
  const [rows, setRows] = useState<UnknownRow[]>(() =>
    names.map((n) => {
      const parsed = parseChildName(n);
      return {
        name: parsed.name || n,
        grade_type: parsed.grade ?? 'elementary_1',
        home_address: '',
      };
    })
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateRow = <K extends keyof UnknownRow>(idx: number, field: K, value: UnknownRow[K]) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (rows.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    let okCount = 0;
    let firstError = '';
    for (const r of rows) {
      if (!r.name.trim()) continue;
      try {
        const res = await fetch('/api/children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.name.trim(),
            grade_type: r.grade_type,
            home_address: r.home_address.trim() || null,
            is_active: true,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!firstError) firstError = j.error ?? `${r.name} の登録に失敗`;
        } else {
          okCount++;
        }
      } catch (e) {
        if (!firstError) firstError = e instanceof Error ? e.message : '登録に失敗';
      }
    }
    setBusy(false);
    if (firstError && okCount === 0) {
      setError(firstError);
      return;
    }
    await onDone();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-lg p-5"
        style={{
          background: '#ffffff',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          border: '1px solid var(--rule)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            未登録児童の一括登録 <span className="text-sm ml-2" style={{ color: 'var(--ink-3)' }}>{rows.length}名</span>
          </h3>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--ink-3)' }} aria-label="閉じる">×</button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
          Excelの氏名から学年を推定しています。必要に応じて修正してください。自宅住所は任意です（後から児童管理で設定可）。
        </p>

        {error && (
          <div className="mb-3 px-3 py-2 text-xs rounded" style={{ background: 'var(--red-pale)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 mb-4">
          {rows.map((r, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 items-center p-2 rounded"
              style={{ background: 'var(--bg)', border: '1px solid var(--rule)' }}
            >
              <input
                type="text"
                value={r.name}
                onChange={(e) => updateRow(idx, 'name', e.target.value)}
                className="col-span-3 text-sm outline-none px-2 py-1.5 rounded"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
                placeholder="氏名"
              />
              <select
                value={r.grade_type}
                onChange={(e) => updateRow(idx, 'grade_type', e.target.value as GradeType)}
                className="col-span-2 text-sm outline-none px-2 py-1.5 rounded"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={r.home_address}
                onChange={(e) => updateRow(idx, 'home_address', e.target.value)}
                className="col-span-6 text-xs outline-none px-2 py-1.5 rounded"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
                placeholder="自宅住所（任意）"
              />
              <button
                onClick={() => removeRow(idx)}
                className="col-span-1 text-xs"
                style={{ color: 'var(--red)' }}
                aria-label={`${r.name} を登録対象から除外`}
                title="除外"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={busy || rows.length === 0}>
            {busy ? '登録中...' : `${rows.length}名を一括登録`}
          </Button>
        </div>
      </div>
    </div>
  );
}
