'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/layout/Header';
import TransportDayView from '@/components/transport/TransportDayView';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { format, getDaysInMonth, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * 送迎表ページ
 * - 日別タブで日を切り替え
 * - 児童×担当のテーブル
 * - ドロップダウンで担当変更
 * - 割り当て生成 → 手動調整 → 確定
 *
 * TODO: Supabase連携後にDB読み書きに切り替え
 */

const MOCK_STAFF = [
  { id: 's1', name: '金田' },
  { id: 's2', name: '加藤' },
  { id: 's3', name: '鈴木' },
  { id: 's4', name: '田中' },
  { id: 's5', name: '佐藤' },
  { id: 's6', name: '山本' },
];

const MOCK_CHILDREN_NAMES = [
  '川島舞桜', '川島颯斗', '清水隼音', '滝川希', '竹内碧子',
  '中村日菜美', '板倉千夏', '木下琉十',
];

type TransportEntry = {
  scheduleEntryId: string;
  childName: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupStaffIds: string[];
  dropoffStaffIds: string[];
  isUnassigned: boolean;
};

function generateMockTransport(date: string): TransportEntry[] {
  const dow = getDay(new Date(date));
  if (dow === 0 || dow === 6) return [];

  const count = 4 + Math.floor(Math.random() * 5);
  const shuffled = [...MOCK_CHILDREN_NAMES].sort(() => Math.random() - 0.5).slice(0, count);
  const pickupTimes = ['10:30', '11:00', '11:20', '13:00', '13:50', '14:20'];
  const dropoffTimes = ['16:00', '16:30'];

  return shuffled.map((name, i) => ({
    scheduleEntryId: `${date}-${i}`,
    childName: name,
    pickupTime: pickupTimes[Math.floor(Math.random() * pickupTimes.length)],
    dropoffTime: dropoffTimes[Math.floor(Math.random() * dropoffTimes.length)],
    pickupStaffIds: [],
    dropoffStaffIds: [],
    isUnassigned: true,
  }));
}

export default function TransportPage() {
  const year = 2026;
  const month = 4;
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));

  /* 営業日リスト */
  const workDays = useMemo(() => {
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dow = getDay(dateObj);
      if (dow !== 0 && dow !== 6) {
        days.push(format(dateObj, 'yyyy-MM-dd'));
      }
    }
    return days;
  }, [daysInMonth]);

  const [selectedDate, setSelectedDate] = useState(workDays[0] || '');
  const [generated, setGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [transportData, setTransportData] = useState<Record<string, TransportEntry[]>>({});

  /* 全日一括生成 */
  const handleGenerate = () => {
    const data: Record<string, TransportEntry[]> = {};
    workDays.forEach((date) => {
      const entries = generateMockTransport(date);
      /* 仮割り当て: ランダムに担当を設定 */
      entries.forEach((entry) => {
        const shuffled = [...MOCK_STAFF].sort(() => Math.random() - 0.5);
        entry.pickupStaffIds = [shuffled[0].id];
        entry.dropoffStaffIds = [shuffled[1]?.id || shuffled[0].id];
        entry.isUnassigned = false;
      });
      /* 10%の確率で未割り当てにする */
      if (entries.length > 0 && Math.random() < 0.3) {
        const idx = Math.floor(Math.random() * entries.length);
        entries[idx].pickupStaffIds = [];
        entries[idx].dropoffStaffIds = [];
        entries[idx].isUnassigned = true;
      }
      data[date] = entries;
    });
    setTransportData(data);
    setGenerated(true);
    setConfirmed(false);
  };

  /* 担当変更 */
  const handleStaffChange = (
    scheduleEntryId: string,
    field: 'pickup' | 'dropoff',
    staffIds: string[]
  ) => {
    setTransportData((prev) => {
      const dayEntries = prev[selectedDate] || [];
      const updated = dayEntries.map((e) => {
        if (e.scheduleEntryId !== scheduleEntryId) return e;
        const newEntry = {
          ...e,
          [field === 'pickup' ? 'pickupStaffIds' : 'dropoffStaffIds']: staffIds,
        };
        /* 未割り当て判定を更新 */
        newEntry.isUnassigned =
          newEntry.pickupStaffIds.filter(Boolean).length === 0 &&
          newEntry.dropoffStaffIds.filter(Boolean).length === 0;
        return newEntry;
      });
      return { ...prev, [selectedDate]: updated };
    });
  };

  /* 集計 */
  const currentDayEntries = transportData[selectedDate] || [];
  const unassignedTotal = useMemo(() => {
    let count = 0;
    Object.values(transportData).forEach((entries) => {
      entries.forEach((e) => { if (e.isUnassigned) count++; });
    });
    return count;
  }, [transportData]);

  return (
    <>
      <Header
        title="送迎表"
      />

      <div className="p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              2026年4月
            </h2>
            {confirmed && <Badge variant="success">確定済み</Badge>}
            {generated && !confirmed && <Badge variant="warning">未確定</Badge>}
            {generated && unassignedTotal > 0 && (
              <Badge variant="error">未割当 {unassignedTotal}件</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {generated && !confirmed && (
              <Button
                variant="primary"
                onClick={() => setConfirmed(true)}
                disabled={unassignedTotal > 0}
              >
                {unassignedTotal > 0 ? '未割当あり（確定不可）' : '送迎表確定'}
              </Button>
            )}
            <Button
              variant={generated ? 'secondary' : 'app-card-cta'}
              onClick={handleGenerate}
              disabled={confirmed}
            >
              {generated ? '再生成' : '割り当て生成'}
            </Button>
          </div>
        </div>

        {generated ? (
          <>
            {/* 日別タブ */}
            <div
              className="flex gap-1 overflow-x-auto pb-2 mb-4"
              style={{ scrollbarWidth: 'thin' }}
            >
              {workDays.map((date) => {
                const dayEntries = transportData[date] || [];
                const hasUnassigned = dayEntries.some((e) => e.isUnassigned);
                const isSelected = date === selectedDate;

                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-md transition-all shrink-0"
                    style={{
                      background: isSelected
                        ? 'var(--accent)'
                        : hasUnassigned
                        ? 'var(--red-pale)'
                        : 'var(--white)',
                      color: isSelected
                        ? '#fff'
                        : hasUnassigned
                        ? 'var(--red)'
                        : 'var(--ink-2)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : hasUnassigned ? 'rgba(155,51,51,0.2)' : 'var(--rule)'}`,
                    }}
                  >
                    {format(new Date(date), 'M/d（E）', { locale: ja })}
                    {dayEntries.length > 0 && (
                      <span className="ml-1 opacity-70">{dayEntries.length}名</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 日別テーブル */}
            <TransportDayView
              children={currentDayEntries.map((e) => ({
                id: e.scheduleEntryId,
                scheduleEntryId: e.scheduleEntryId,
                name: e.childName,
                pickupTime: e.pickupTime,
                dropoffTime: e.dropoffTime,
                pickupStaffIds: e.pickupStaffIds,
                dropoffStaffIds: e.dropoffStaffIds,
                isUnassigned: e.isUnassigned,
              }))}
              availableStaff={MOCK_STAFF}
              onStaffChange={handleStaffChange}
              onAddPattern={(childName, pickupTime, dropoffTime) => {
                // TODO: Supabase連携後にchild_transport_patternsに保存
                alert(`${childName}の送迎パターンに登録:\n迎え ${pickupTime || '未設定'}\n送り ${dropoffTime || '未設定'}\n\n※ DB連携後に児童設定ページにも反映されます`);
              }}
              disabled={confirmed}
            />
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{
              background: 'var(--white)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <p className="text-base font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
              送迎担当が未生成です
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
              確定済みシフトと利用予定を元に送迎担当を自動割り当てします
            </p>
            <Button variant="app-card-cta" onClick={handleGenerate}>
              割り当て生成
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
