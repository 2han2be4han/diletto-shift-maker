'use client';

import React, { useState, useRef, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import PdfConfirmTable from './PdfConfirmTable';
import type { ChildRow, ParsedScheduleEntry, AreaLabel } from '@/types';
import { inferMarkFromTime, mergeAreas } from '@/lib/logic/resolveTransportSpec';
import { isDemoClient } from '@/lib/demo/flag';

/**
 * PDFインポートモーダル
 * フロー: アップロード → 解析中 → 確認テーブル → 確定でDB保存
 *
 * 解析結果に児童のマーク候補 × 解析時刻からマーク（pickup_mark / dropoff_mark）を自動推論する。
 */

type PdfImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entries: ParsedScheduleEntry[]) => void;
  childList: ChildRow[];
  /** Phase 28: マーク自動推論用テナントエリア */
  pickupAreas?: AreaLabel[];
  dropoffAreas?: AreaLabel[];
};

/**
 * 解析結果にマーク（pickup_mark / dropoff_mark）を付与。
 * 児童の pickup_area_labels / dropoff_area_labels 候補（AreaLabel.id 配列） × 解析時刻から、
 * テナント pickup_areas / dropoff_areas の time と一致するマーク id を推論する（Phase 30）。
 */
function assignMarks(
  entries: ParsedScheduleEntry[],
  childList: ChildRow[],
  pickupAreas: AreaLabel[],
  dropoffAreas: AreaLabel[],
): ParsedScheduleEntry[] {
  const nameToChild = new Map(childList.map((c) => [c.name, c]));
  return entries.map((e) => {
    if (e.pickup_mark !== undefined && e.dropoff_mark !== undefined) return e; /* 既設定は尊重 */
    const child = nameToChild.get(e.child_name);
    if (!child) return { ...e, pickup_mark: null, dropoff_mark: null };
    /* Phase 28 A案: 児童専用エリアを tenant に合流してから time 推論に使う */
    const mergedPickup = mergeAreas(pickupAreas, child.custom_pickup_areas);
    const mergedDropoff = mergeAreas(dropoffAreas, child.custom_dropoff_areas);
    const pickup =
      e.pickup_mark ?? inferMarkFromTime(child.pickup_area_labels, mergedPickup, e.pickup_time);
    const dropoff =
      e.dropoff_mark ?? inferMarkFromTime(child.dropoff_area_labels, mergedDropoff, e.dropoff_time);
    return { ...e, pickup_mark: pickup, dropoff_mark: dropoff };
  });
}

type ImportState = 'idle' | 'uploading' | 'confirm' | 'saving';

export default function PdfImportModal({
  isOpen,
  onClose,
  onConfirm,
  childList,
  pickupAreas = [],
  dropoffAreas = [],
}: PdfImportModalProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [entries, setEntries] = useState<ParsedScheduleEntry[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Phase D: デモモード検知。isDemoClient() は sessionStorage を見るので
     マウント後に判定する（SSR 段階では false 固定で hydration 差分ゼロ）。 */
  useEffect(() => {
    setIsDemo(isDemoClient());
  }, []);

  if (isOpen && isDemo) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="PDF 取り込み">
        <div className="flex flex-col gap-4 p-2">
          <div
            className="flex flex-col items-center gap-3 p-6 text-center"
            style={{
              background: 'var(--gold-pale)',
              borderRadius: '12px',
              border: '1px solid var(--gold)',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>🔒</div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              PDF 取り込み機能
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              この機能は有料版でご利用いただけます。
              <br />
              デモモードでは無効化されています。
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            本番環境ではデイロボから書き出した PDF をアップロードすると、
            Claude API が利用予定を自動抽出してカレンダーに取り込みます。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              閉じる
            </Button>
            <a
              href="https://diletto-s.com/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center font-semibold transition-all"
              style={{
                background: 'var(--ink)',
                color: '#fff',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '0.9rem',
                textDecoration: 'none',
              }}
            >
              お問い合わせ
            </a>
          </div>
        </div>
      </Modal>
    );
  }

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

      /* Phase 28: 児童のマーク候補 × 解析時刻からマーク（pickup_mark / dropoff_mark）を自動推論 */
      const withMarks = assignMarks(data.entries, childList, pickupAreas, dropoffAreas);
      setEntries(withMarks);
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
              pickupAreas={pickupAreas}
              dropoffAreas={dropoffAreas}
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
