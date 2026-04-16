'use client';

import React, { useState, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import PdfConfirmTable from './PdfConfirmTable';
import type { ParsedScheduleEntry } from '@/types';

/**
 * PDFインポートモーダル
 * フロー: アップロード → 解析中 → 確認テーブル → 確定でDB保存
 */

type PdfImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entries: ParsedScheduleEntry[]) => void;
};

type ImportState = 'idle' | 'uploading' | 'confirm' | 'saving';

export default function PdfImportModal({ isOpen, onClose, onConfirm }: PdfImportModalProps) {
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

      setEntries(data.entries);
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
