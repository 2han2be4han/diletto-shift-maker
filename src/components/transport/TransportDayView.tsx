'use client';

import { openInGoogleMaps } from '@/lib/utils/googleMaps';

/**
 * 日別送迎表ビュー
 * - 行: 児童名（利用予定のある児童）
 * - 列: 迎え時間 / 迎え担当 / 送り時間 / 送り担当
 * - 担当はドロップダウンで変更可能
 * - 未割り当て（is_unassigned）は赤ハイライト
 * - 時間の下に場所メモ（児童パターン由来）を表示し、クリックで Google Maps 起動
 */

type TransportChild = {
  id: string;
  scheduleEntryId: string;
  name: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
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
  if (children.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
          この日の利用予定はありません
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
      <table className="w-full border-collapse" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th
              className="px-3 py-2 text-left font-semibold"
              style={{ background: 'var(--ink)', color: '#fff', minWidth: '120px' }}
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
          {children.map((child) => (
            <tr
              key={child.scheduleEntryId}
              style={{
                background: child.isUnassigned ? 'var(--red-pale)' : 'transparent',
              }}
            >
              {/* 児童名 */}
              <td
                className="px-3 py-2 font-medium"
                style={{
                  borderBottom: '1px solid var(--rule)',
                  color: child.isUnassigned ? 'var(--red)' : 'var(--ink)',
                }}
              >
                <div className="flex items-center gap-2">
                  {child.name}
                  {child.isUnassigned && (
                    <span
                      className="text-xs px-1.5 py-0.5 font-bold rounded"
                      style={{ background: 'var(--red)', color: '#fff', fontSize: '0.65rem' }}
                    >
                      未割当
                    </span>
                  )}
                </div>
              </td>

              {/* 迎え時間 + 場所リンク */}
              <td
                className="px-3 py-2 text-center"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                <TimeWithMapLink
                  time={child.pickupTime}
                  location={child.pickupLocation}
                  color="var(--accent)"
                />
              </td>

              {/* 迎え担当 */}
              <td
                className="px-2 py-1.5"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                <StaffSelect
                  staffIds={child.pickupStaffIds}
                  availableStaff={availableStaff}
                  onChange={(ids) => onStaffChange(child.scheduleEntryId, 'pickup', ids)}
                  disabled={disabled}
                />
              </td>

              {/* 送り時間 + 場所リンク */}
              <td
                className="px-3 py-2 text-center"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                <TimeWithMapLink
                  time={child.dropoffTime}
                  location={child.dropoffLocation}
                  color="var(--green)"
                />
              </td>

              {/* 送り担当 */}
              <td
                className="px-2 py-1.5"
                style={{ borderBottom: '1px solid var(--rule)' }}
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
                  style={{ borderBottom: '1px solid var(--rule)' }}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 時間 + 場所メモ表示（Phase 14）
 * - 時間を色付きで表示
 * - 場所メモが設定されていれば 🗺 アイコン付きで下に表示し、クリックで Google Maps 起動
 */
function TimeWithMapLink({
  time, location, color,
}: { time: string | null; location: string | null; color: string }) {
  const hasLocation = !!location && location.trim().length > 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-medium" style={{ color }}>{time || '-'}</span>
      {hasLocation && (
        <button
          type="button"
          onClick={() => openInGoogleMaps(location)}
          className="text-xs inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
          style={{
            color,
            background: 'transparent',
            border: `1px dashed ${color}`,
            maxWidth: '140px',
          }}
          title={`Google Maps で開く: ${location}`}
        >
          <span aria-hidden>🗺</span>
          <span className="truncate" style={{ fontSize: '0.7rem' }}>{location}</span>
        </button>
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
