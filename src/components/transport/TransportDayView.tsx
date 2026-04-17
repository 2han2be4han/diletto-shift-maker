'use client';

import React, { useState } from 'react';
import { openInGoogleMaps } from '@/lib/utils/googleMaps';

/**
 * 日別送迎表ビュー
 * - 行: 児童名（利用予定のある児童）
 * - 列: 迎え時間 / 迎え担当 / 送り時間 / 送り担当
 * - 担当はドロップダウンで変更可能
 * - 未割り当て（is_unassigned）は赤ハイライト
 * - Phase 17: 児童名クリックで詳細行を展開し、迎/送の場所をリスト表示
 *   各場所をクリックで Google Maps 起動
 */

type TransportChild = {
  id: string;
  scheduleEntryId: string;
  name: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  pickupAreaLabel: string | null;
  dropoffAreaLabel: string | null;
  pickupStaffIds: string[];
  dropoffStaffIds: string[];
  isUnassigned: boolean;
};

type TransportStaff = {
  id: string;
  name: string;
};

type TransportDayViewProps = {
  children: TransportChild[];
  availableStaff: TransportStaff[];
  onStaffChange: (
    scheduleEntryId: string,
    field: 'pickup' | 'dropoff',
    staffIds: string[]
  ) => void;
  onAddPattern?: (childName: string, pickupTime: string | null, dropoffTime: string | null) => void;
  disabled?: boolean;
};

export default function TransportDayView({
  children,
  availableStaff,
  onStaffChange,
  onAddPattern,
  disabled = false,
}: TransportDayViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (children.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
          この日の利用予定はありません
        </p>
      </div>
    );
  }

  const colSpan = onAddPattern ? 6 : 5;

  return (
    <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
      <table className="w-full border-collapse" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th
              className="px-3 py-2 text-left font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', minWidth: '140px' }}
            >
              児童名
            </th>
            <th
              className="px-3 py-2 text-center font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', minWidth: '70px' }}
            >
              迎え時間
            </th>
            <th
              className="px-3 py-2 text-left font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', minWidth: '180px' }}
            >
              迎え担当
            </th>
            <th
              className="px-3 py-2 text-center font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', minWidth: '70px' }}
            >
              送り時間
            </th>
            <th
              className="px-3 py-2 text-left font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', minWidth: '180px' }}
            >
              送り担当
            </th>
            {onAddPattern && (
              <th
                className="px-2 py-2 text-center font-semibold"
                style={{ background: 'var(--ink)', color: '#fff', minWidth: '60px' }}
              >
                設定
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {children.map((child) => {
            const isExpanded = expandedId === child.scheduleEntryId;
            const hasAnyLocation =
              !!(child.pickupLocation || child.dropoffLocation ||
                 child.pickupAreaLabel || child.dropoffAreaLabel);
            return (
              <React.Fragment key={child.scheduleEntryId}>
                <tr
                  style={{
                    background: child.isUnassigned ? 'var(--red-pale)' : 'transparent',
                  }}
                >
                  {/* 児童名（クリックで詳細展開） */}
                  <td
                    className="px-3 py-2 font-medium"
                    style={{
                      borderBottom: isExpanded ? 'none' : '1px solid var(--rule)',
                      color: child.isUnassigned ? 'var(--red)' : 'var(--ink)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : child.scheduleEntryId)}
                      className="inline-flex items-center gap-1.5 py-1 rounded transition-colors hover:bg-[var(--accent-pale)]"
                      style={{ color: 'inherit', fontWeight: 'inherit' }}
                      aria-expanded={isExpanded}
                      title={hasAnyLocation ? '場所を確認（地図が開けます）' : '場所の詳細を開く'}
                    >
                      <span
                        className="inline-block transition-transform text-xs"
                        style={{
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          color: 'var(--ink-3)',
                        }}
                        aria-hidden
                      >
                        ▶
                      </span>
                      <span>{child.name}</span>
                      {hasAnyLocation && (
                        <span
                          aria-hidden
                          className="text-xs"
                          style={{ color: 'var(--ink-3)' }}
                          title="場所情報あり"
                        >
                          🗺
                        </span>
                      )}
                    </button>
                    {child.isUnassigned && (
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 font-bold rounded"
                        style={{ background: 'var(--red)', color: '#fff', fontSize: '0.65rem' }}
                      >
                        未割当
                      </span>
                    )}
                  </td>

                  {/* 迎え時間 */}
                  <td
                    className="px-3 py-2 text-center font-medium"
                    style={{
                      borderBottom: isExpanded ? 'none' : '1px solid var(--rule)',
                      color: 'var(--accent)',
                    }}
                  >
                    {child.pickupTime || '-'}
                  </td>

                  {/* 迎え担当 */}
                  <td
                    className="px-2 py-1.5"
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--rule)' }}
                  >
                    <StaffSelect
                      staffIds={child.pickupStaffIds}
                      availableStaff={availableStaff}
                      onChange={(ids) => onStaffChange(child.scheduleEntryId, 'pickup', ids)}
                      disabled={disabled}
                    />
                  </td>

                  {/* 送り時間 */}
                  <td
                    className="px-3 py-2 text-center font-medium"
                    style={{
                      borderBottom: isExpanded ? 'none' : '1px solid var(--rule)',
                      color: 'var(--green)',
                    }}
                  >
                    {child.dropoffTime || '-'}
                  </td>

                  {/* 送り担当 */}
                  <td
                    className="px-2 py-1.5"
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--rule)' }}
                  >
                    <StaffSelect
                      staffIds={child.dropoffStaffIds}
                      availableStaff={availableStaff}
                      onChange={(ids) => onStaffChange(child.scheduleEntryId, 'dropoff', ids)}
                      disabled={disabled}
                    />
                  </td>

                  {/* パターン登録ボタン */}
                  {onAddPattern && (
                    <td
                      className="px-2 py-1.5 text-center"
                      style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--rule)' }}
                    >
                      <button
                        onClick={() => onAddPattern(child.name, child.pickupTime, child.dropoffTime)}
                        className="text-xs font-semibold px-2 py-1 rounded transition-colors hover:bg-[var(--accent-pale)]"
                        style={{ color: 'var(--accent)' }}
                        title={`${child.name}の送迎パターンに登録`}
                      >
                        + 登録
                      </button>
                    </td>
                  )}
                </tr>

                {/* 展開: 送迎場所リスト */}
                {isExpanded && (
                  <tr style={{ background: 'var(--bg)' }}>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-3"
                      style={{ borderBottom: '1px solid var(--rule)' }}
                    >
                      <LocationDetails child={child} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 児童の迎/送場所を並べて表示するパネル（Phase 17）
 * 各場所カードをクリック → Google Maps で開く
 */
function LocationDetails({ child }: { child: TransportChild }) {
  const pickupEmpty = !child.pickupLocation && !child.pickupAreaLabel;
  const dropoffEmpty = !child.dropoffLocation && !child.dropoffAreaLabel;
  if (pickupEmpty && dropoffEmpty) {
    return (
      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
        場所が登録されていません。児童管理から送迎パターンを設定してください。
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <LocationCard
        label="迎"
        time={child.pickupTime}
        area={child.pickupAreaLabel}
        address={child.pickupLocation}
        color="var(--accent)"
        bg="var(--accent-pale)"
      />
      <LocationCard
        label="送"
        time={child.dropoffTime}
        area={child.dropoffAreaLabel}
        address={child.dropoffLocation}
        color="var(--green)"
        bg="var(--green-pale)"
      />
    </div>
  );
}

/**
 * 1つの送迎場所カード。area と address のどちらもあれば両方表示し、
 * address があれば Maps ボタン、なければ area 名で検索。
 */
function LocationCard({
  label, time, area, address, color, bg,
}: {
  label: string;
  time: string | null;
  area: string | null;
  address: string | null;
  color: string;
  bg: string;
}) {
  const hasAny = !!(area || address);
  /* Maps 検索クエリ: address 優先、なければ area ラベル文字列部分 */
  const mapQuery = address ?? area ?? '';
  return (
    <div
      className="p-3 rounded-lg flex flex-col gap-1.5"
      style={{ background: bg, border: `1px solid ${color}33` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color }}>{label} 🚗</span>
        <span className="text-sm font-medium" style={{ color }}>
          {time || '-'}
        </span>
        {area && (
          <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
            {area}
          </span>
        )}
      </div>
      {address && (
        <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
          📍 {address}
        </div>
      )}
      {hasAny && (
        <button
          type="button"
          onClick={() => openInGoogleMaps(mapQuery)}
          className="mt-1 self-start inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors hover:opacity-85"
          style={{
            color: '#fff',
            background: color,
          }}
          aria-label={`${label}の場所を Google Maps で開く`}
        >
          🗺 地図で開く
        </button>
      )}
      {!hasAny && (
        <div className="text-xs" style={{ color: 'var(--ink-3)' }}>場所未登録</div>
      )}
    </div>
  );
}

/* 担当者選択ドロップダウン（最大2名） */
function StaffSelect({
  staffIds,
  availableStaff,
  onChange,
  disabled,
}: {
  staffIds: string[];
  availableStaff: TransportStaff[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const handleChange = (index: number, newId: string) => {
    const updated = [...staffIds];
    if (newId === '') {
      updated.splice(index, 1);
    } else {
      updated[index] = newId;
    }
    onChange(updated);
  };

  const handleAdd = () => {
    if (staffIds.length >= 2) return;
    onChange([...staffIds, '']);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {staffIds.map((id, i) => (
        <select
          key={i}
          value={id}
          onChange={(e) => handleChange(i, e.target.value)}
          disabled={disabled}
          className="px-2 py-1 text-xs outline-none disabled:opacity-60"
          style={{
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            color: id ? 'var(--ink)' : 'var(--red)',
            background: id ? 'var(--white)' : 'var(--red-pale)',
            minWidth: '80px',
          }}
        >
          <option value="">未選択</option>
          {availableStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ))}
      {staffIds.length < 2 && !disabled && (
        <button
          onClick={handleAdd}
          className="px-2 py-1 text-xs font-medium rounded transition-colors hover:bg-[var(--accent-pale)]"
          style={{ color: 'var(--accent)', border: '1px dashed var(--accent)' }}
        >
          + 追加
        </button>
      )}
      {staffIds.length === 0 && (
        <button
          onClick={handleAdd}
          disabled={disabled}
          className="px-2 py-1 text-xs font-medium rounded disabled:opacity-60"
          style={{ color: 'var(--red)', border: '1px dashed var(--red)' }}
        >
          担当を選択
        </button>
      )}
    </div>
  );
}

