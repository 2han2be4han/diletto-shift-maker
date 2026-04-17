'use client';

import React, { useState, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import PdfConfirmTable from './PdfConfirmTable';
import type { ChildRow, ChildTransportPatternRow, ParsedScheduleEntry } from '@/types';

/**
 * PDFインポートモーダル
 * フロー: アップロード → 解析中 → 確認テーブル → 確定でDB保存
 *
 * Phase 27-A-1: 解析結果に pattern_id を付与する。優先順位（精度の高い順）:
 *   1. 時刻 AND エリア が両方一致（最強）
 *   2. エリア一致（PDF の area_label とパターンの pickup/dropoff/area_label のいずれか）
 *   3. 時刻（pickup と dropoff の両方）が一致
 *   4. patternUsage（過去の最頻パターン）
 *   5. 児童の最初のパターン
 *   6. 該当なし（pattern_id = null）
 */

type PdfImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entries: ParsedScheduleEntry[]) => void;
  childList: ChildRow[];
  patterns: ChildTransportPatternRow[];
  patternUsage: Map<string, string>;
};

/** "HH:MM:SS" → "HH:MM"（比較用正規化） */
function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/** 解析結果に pattern_id を付与する */
function assignPatternIds(
  entries: ParsedScheduleEntry[],
  childList: ChildRow[],
  patterns: ChildTransportPatternRow[],
  patternUsage: Map<string, string>,
): ParsedScheduleEntry[] {
  const nameToChildId = new Map(childList.map((c) => [c.name, c.id]));
  /* child_id → パターン一覧 */
  const patternsByChild = new Map<string, ChildTransportPatternRow[]>();
  for (const p of patterns) {
    const list = patternsByChild.get(p.child_id) ?? [];
    list.push(p);
    patternsByChild.set(p.child_id, list);
  }
  /** パターンの迎/送/旧 area_label のいずれかが entry.area_label と一致するか */
  const matchArea = (p: ChildTransportPatternRow, areaLabel: string | null): boolean => {
    if (!areaLabel) return false;
    return (
      p.pickup_area_label === areaLabel ||
      p.dropoff_area_label === areaLabel ||
      p.area_label === areaLabel
    );
  };

  return entries.map((e) => {
    if (e.pattern_id !== undefined) return e; /* 既に設定済みは尊重 */
    const childId = nameToChildId.get(e.child_name);
    if (!childId) return { ...e, pattern_id: null };
    const childPatterns = patternsByChild.get(childId) ?? [];
    if (childPatterns.length === 0) return { ...e, pattern_id: null };
    const pt = normalizeTime(e.pickup_time);
    const dt = normalizeTime(e.dropoff_time);
    const timeMatch = (p: ChildTransportPatternRow) =>
      normalizeTime(p.pickup_time) === pt && normalizeTime(p.dropoff_time) === dt;

    /* 1. 時刻 AND エリア 両方一致 */
    const bothMatch = childPatterns.find((p) => timeMatch(p) && matchArea(p, e.area_label));
    if (bothMatch) return { ...e, pattern_id: bothMatch.id };
    /* 2. エリア一致のみ */
    const areaOnly = childPatterns.find((p) => matchArea(p, e.area_label));
    if (areaOnly) return { ...e, pattern_id: areaOnly.id };
    /* 3. 時刻一致のみ */
    const timeOnly = childPatterns.find(timeMatch);
    if (timeOnly) return { ...e, pattern_id: timeOnly.id };
    /* 4. 過去の最頻 */
    const fromUsage = patternUsage.get(childId);
    if (fromUsage && childPatterns.some((p) => p.id === fromUsage)) {
      return { ...e, pattern_id: fromUsage };
    }
    /* 5. 最初の 1 件 */
    return { ...e, pattern_id: childPatterns[0].id };
  });
}

type ImportState = 'idle' | 'uploading' | 'confirm' | 'saving';

export default function PdfImportModal({
  isOpen,
  onClose,
  onConfirm,
  childList,
  patterns,
  patternUsage,
}: PdfImportModalProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [entries, setEntries] = useState<ParsedScheduleEntry[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError('');
    setState('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import/pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'PDF解析に失敗しました');
      }

      /* Phase 27-A-1: 解析結果に初期 pattern_id を付与 */
      setEntries(assignPatternIds(data.entries, childList, patterns, patternUsage));
      setIsMock(data.isMock);
      setState('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      setState('idle');
    }
  };

  const handleConfirm = () => {
    setState('saving');
    onConfirm(entries);
    /* 保存後にリセット */
    setTimeout(() => {
      setState('idle');
      setEntries([]);
      setFileName('');
      onClose();
    }, 500);
  };

  const handleReset = () => {
    setState('idle');
    setEntries([]);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="PDFインポート"
    >
      <div className="flex flex-col gap-4">
        {/* アイドル / エラー状態: ファイル選択 */}
        {state === 'idle' && (
          <>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              デイロボの利用予定PDFをアップロードしてください。
              Claude AIが自動で児童名・日付・時間を読み取ります。
            </p>

            {/* ドロップエリア風 */}
            <label
              className="flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-colors hover:bg-[var(--accent-pale)]"
              style={{
                border: '2px dashed var(--rule-strong)',
                borderRadius: '8px',
                background: 'var(--bg)',
              }}
            >
              <span className="text-2xl">📄</span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                クリックしてPDFを選択
              </span>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                PDF形式・10MB以下
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            {error && (
              <p
                className="text-xs font-medium px-3 py-2"
                style={{
                  color: 'var(--red)',
                  background: 'var(--red-pale)',
                  borderRadius: '4px',
                }}
              >
                {error}
              </p>
            )}
          </>
        )}

        {/* 解析中 */}
        {state === 'uploading' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div
              className="w-10 h-10 rounded-full animate-spin"
              style={{ border: '3px solid var(--rule)', borderTopColor: 'var(--accent)' }}
            />
            <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              {fileName} を解析中...
            </p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              Claude AIがPDFを読み取っています
            </p>
          </div>
        )}

        {/* 確認テーブル */}
        {state === 'confirm' && (
          <>
            <div className="flex items-center gap-3">
              <Badge variant="success">{entries.length}件 検出</Badge>
              {isMock && <Badge variant="warning">モックデータ（API未接続）</Badge>}
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {fileName}
              </span>
            </div>

            <PdfConfirmTable
              entries={entries}
              onEntriesChange={setEntries}
              childList={childList}
              patterns={patterns}
            />

            <div className="flex gap-2 mt-2">
              <Button variant="secondary" onClick={handleReset}>
                やり直す
              </Button>
              <Button variant="primary" onClick={handleConfirm}>
                この内容で登録する
              </Button>
            </div>
          </>
        )}

        {/* 保存中 */}
        {state === 'saving' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div
              className="w-10 h-10 rounded-full animate-spin"
              style={{ border: '3px solid var(--rule)', borderTopColor: 'var(--green)' }}
            />
            <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              利用予定を登録中...
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
