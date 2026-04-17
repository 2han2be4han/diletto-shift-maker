'use client';

import React, { useState } from 'react';
import { openInGoogleMaps } from '@/lib/utils/googleMaps';

/**
 * 日別送迎表ビュー
 * - 行: 児童名（利用予定のある児童）
 * - 列: 迎え時間 / 迎え担当 / 送り時間 / 送り担当
 * - 担当はドロップダウンで変更可能（Phase 26: 変更は pending state に蓄積され、親の「保存」で一括反映）
 * - 未割り当て（is_unassigned）は赤ハイライト
 * - Phase 17: 児童名クリックで詳細行を展開し、迎/送の場所をリスト表示
 * - Phase 26:
 *   - 担当候補を「出勤中 かつ end_time >= transportMinEndTime」で絞り込み
 *   - pickup/dropoff method === 'self' のときは「👪 保護者送迎」表記で担当欄を非表示
 *   - セル時間の下に「エリア絵文字 + 名称」と「住所」を明示表示
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
  /** Phase 26: 'self' なら保護者送迎（担当不要） */
  pickupMethod: 'pickup' | 'self';
  dropoffMethod: 'dropoff' | 'self';
};

type TransportStaff = {
  id: string;
  name: string;
  /** Phase 26: 当日の勤務終了時刻（"HH:MM:SS" or "HH:MM"）。null なら欠勤/候補外 */
  endTime: string | null;
  /** Phase 27: 迎で担当しているエリア絵文字。重複なし */
  pickupAreaMarks: string[];
  /** Phase 27: 送で担当しているエリア絵文字。重複なし */
  dropoffAreaMarks: string[];
};

type TransportDayViewProps = {
  children: TransportChild[];
  /** 全職員（セル内 select 用）。Phase 26: 当日出勤かつ endTime >= minEndTime のみ候補 */
  availableStaff: TransportStaff[];
  /** Phase 26: "HH:MM" 形式の最低退勤時刻（この時刻以降に退勤する職員のみ候補） */
  transportMinEndTime: string;
  onStaffChange: (
    scheduleEntryId: string,
    field: 'pickup' | 'dropoff',
    staffIds: string[]
  ) => void;
  onAddPattern?: (childName: string, pickupTime: string | null, dropoffTime: string | null) => void;
  disabled?: boolean;
};

/** "HH:MM" または "HH:MM:SS" 形式 → 分数 */
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** "HH:MM:SS" や "HH:MM" を "HH:MM" 表示に正規化（秒を捨てる） */
function formatHourMinute(t: string | null): string {
  if (!t) return '-';
  const parts = t.split(':');
  if (parts.length < 2) return t;
  return `${parts[0]}:${parts[1]}`;
}

/** エリアラベル "🏠 藤江" から絵文字と名前を分離 */
function splitAreaLabel(label: string | null): { emoji: string | null; name: string | null } {
  if (!label) return { emoji: null, name: null };
  /* 最初の空白で分ける: "🏠 藤江" → emoji="🏠", name="藤江" */
  const trimmed = label.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { emoji: null, name: trimmed };
  return { emoji: trimmed.slice(0, spaceIdx), name: trimmed.slice(spaceIdx + 1).trim() };
}

export default function TransportDayView({
  children,
  availableStaff,
  transportMinEndTime,
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

  /* Phase 26.1: 列構成 = 児童名 / 迎え時間 / 迎場所 / 迎え担当 / 送り時間 / 送り場所 / 送り担当 / (設定) */
  const colSpan = onAddPattern ? 8 : 7;

  /* Phase 26: 候補職員を「出勤中 かつ endTime >= minEndTime」で絞り込み */
  const minEndMin = timeToMinutes(transportMinEndTime) ?? 0;
  const eligibleStaff = availableStaff.filter((s) => {
    if (!s.endTime) return false;
    const em = timeToMinutes(s.endTime);
    return em !== null && em >= minEndMin;
  });

  const headerCellStyle = { background: 'var(--ink)', color: '#fff' } as const;

  return (
    <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '1px solid var(--rule)' }}>
      <table className="w-full border-collapse" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th className="px-3 py-2 text-left font-semibold" style={{ ...headerCellStyle, minWidth: '140px' }}>
              児童名
            </th>
            <th className="px-2 py-2 text-center font-semibold" style={{ ...headerCellStyle, minWidth: '64px' }}>
              迎え時間
            </th>
            <th className="px-3 py-2 text-left font-semibold" style={{ ...headerCellStyle, minWidth: '160px' }}>
              迎場所
            </th>
            <th className="px-3 py-2 text-left font-semibold" style={{ ...headerCellStyle, minWidth: '220px' }}>
              迎え担当
            </th>
            <th className="px-2 py-2 text-center font-semibold" style={{ ...headerCellStyle, minWidth: '64px' }}>
              送り時間
            </th>
            <th className="px-3 py-2 text-left font-semibold" style={{ ...headerCellStyle, minWidth: '160px' }}>
              送り場所
            </th>
            <th className="px-3 py-2 text-left font-semibold" style={{ ...headerCellStyle, minWidth: '220px' }}>
              送り担当
            </th>
            {onAddPattern && (
              <th className="px-2 py-2 text-center font-semibold" style={{ ...headerCellStyle, minWidth: '60px' }}>
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
            const pickupSelf = child.pickupMethod === 'self';
            const dropoffSelf = child.dropoffMethod === 'self';
            return (
              <React.Fragment key={child.scheduleEntryId}>
                <tr
                  style={{
                    background: child.isUnassigned ? 'var(--red-pale)' : 'transparent',
                  }}
                >
                  {/* 児童名（クリックで詳細展開） */}
                  <td
                    className="px-3 py-2 font-medium align-top"
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

                  {/* 迎え時間（HH:MM） */}
                  <TimeCell
                    time={child.pickupTime}
                    timeColor="var(--accent)"
                    isExpanded={isExpanded}
                  />

                  {/* 迎場所: エリア絵文字 + 名称 + 住所（Maps リンク） */}
                  <LocationCellInline
                    areaLabel={child.pickupAreaLabel}
                    location={child.pickupLocation}
                    accentColor="var(--accent)"
                    isExpanded={isExpanded}
                  />

                  {/* 迎え担当（method=self のときは保護者送迎バッジ） */}
                  <td
                    className="px-2 py-1.5 align-top"
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--rule)' }}
                  >
                    {pickupSelf ? (
                      <SelfTransportBadge />
                    ) : (
                      <StaffSelect
                        staffIds={child.pickupStaffIds}
                        availableStaff={eligibleStaff}
                        onChange={(ids) => onStaffChange(child.scheduleEntryId, 'pickup', ids)}
                        disabled={disabled}
                        direction="pickup"
                      />
                    )}
                  </td>

                  {/* 送り時間（HH:MM） */}
                  <TimeCell
                    time={child.dropoffTime}
                    timeColor="var(--green)"
                    isExpanded={isExpanded}
                  />

                  {/* 送り場所 */}
                  <LocationCellInline
                    areaLabel={child.dropoffAreaLabel}
                    location={child.dropoffLocation}
                    accentColor="var(--green)"
                    isExpanded={isExpanded}
                  />

                  {/* 送り担当 */}
                  <td
                    className="px-2 py-1.5 align-top"
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--rule)' }}
                  >
                    {dropoffSelf ? (
                      <SelfTransportBadge />
                    ) : (
                      <StaffSelect
                        staffIds={child.dropoffStaffIds}
                        availableStaff={eligibleStaff}
                        onChange={(ids) => onStaffChange(child.scheduleEntryId, 'dropoff', ids)}
                        disabled={disabled}
                        direction="dropoff"
                      />
                    )}
                  </td>

                  {/* パターン登録ボタン */}
                  {onAddPattern && (
                    <td
                      className="px-2 py-1.5 text-center align-top"
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
 * 時刻のみのセル（Phase 26.1: HH:MM 表示、秒カット）
 */
function TimeCell({
  time,
  timeColor,
  isExpanded,
}: {
  time: string | null;
  timeColor: string;
  isExpanded: boolean;
}) {
  return (
    <td
      className="px-2 py-2 text-center align-middle font-semibold"
      style={{
        borderBottom: isExpanded ? 'none' : '1px solid var(--rule)',
        color: timeColor,
        fontSize: '0.95rem',
        letterSpacing: '0.02em',
      }}
    >
      {formatHourMinute(time)}
    </td>
  );
}

/**
 * 場所セル（Phase 26.1）
 * - エリア絵文字を大きく、エリア名、住所をまとめて表示
 * - 住所があれば Google Maps リンク
 */
function LocationCellInline({
  areaLabel,
  location,
  accentColor,
  isExpanded,
}: {
  areaLabel: string | null;
  location: string | null;
  accentColor: string;
  isExpanded: boolean;
}) {
  const { emoji, name } = splitAreaLabel(areaLabel);
  const hasAny = !!(emoji || name || location);
  const query = location ?? areaLabel ?? '';
  return (
    <td
      className="px-3 py-2 align-middle"
      style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--rule)' }}
    >
      {!hasAny ? (
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>—</span>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          {emoji && (
            <span
              className="shrink-0"
              style={{ fontSize: '1.4rem', lineHeight: 1 }}
              aria-hidden
            >
              {emoji}
            </span>
          )}
          <div className="flex flex-col min-w-0 gap-0.5 leading-tight">
            {name && (
              <span
                className="font-semibold truncate"
                style={{ color: accentColor, fontSize: '0.82rem' }}
                title={name}
              >
                {name}
              </span>
            )}
            {location && (
              <button
                type="button"
                onClick={() => openInGoogleMaps(query)}
                className="inline-flex items-center gap-1 text-left truncate hover:underline"
                style={{ color: 'var(--ink-3)', fontSize: '0.68rem' }}
                title={`${location}（Google Maps で開く）`}
              >
                <span aria-hidden>📍</span>
                <span className="truncate">{location}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </td>
  );
}

/**
 * 保護者送迎バッジ（Phase 26 2-4-c）
 * method = 'self' の場合に担当ドロップダウン代わりに表示。赤エラー扱いしない。
 */
function SelfTransportBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
      style={{
        background: 'var(--bg)',
        color: 'var(--ink-3)',
        border: '1px dashed var(--rule)',
      }}
      title="保護者による送迎のため、担当職員の割り当ては不要です"
    >
      <span aria-hidden>👪</span>
      <span>保護者送迎</span>
    </span>
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
  direction,
}: {
  staffIds: string[];
  availableStaff: TransportStaff[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  /** Phase 27: 迎担当=pickup のマークのみ表示、送担当=dropoff のマークのみ表示 */
  direction: 'pickup' | 'dropoff';
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
      {staffIds.map((id, i) => {
        /* Phase 26: 候補外（退勤時間 < 16:31 / 欠勤）でも既存選択は残す */
        const isMissing = id !== '' && !availableStaff.some((s) => s.id === id);
        /* Phase 27: 選択中の職員が同方向で担当している他エリアのマークを表示（迎/送別） */
        const selectedStaff = availableStaff.find((s) => s.id === id);
        const marks = (direction === 'pickup'
          ? selectedStaff?.pickupAreaMarks
          : selectedStaff?.dropoffAreaMarks) ?? [];
        return (
          <div key={i} className="inline-flex items-center gap-1">
            <select
              value={id}
              onChange={(e) => handleChange(i, e.target.value)}
              disabled={disabled}
              className="px-2 py-1 text-xs outline-none disabled:opacity-60"
              style={{
                border: `1px solid ${isMissing ? 'var(--red)' : 'var(--rule)'}`,
                borderRadius: '4px',
                color: id ? (isMissing ? 'var(--red)' : 'var(--ink)') : 'var(--red)',
                background: id ? (isMissing ? 'var(--red-pale)' : 'var(--white)') : 'var(--red-pale)',
                minWidth: '90px',
              }}
              title={
                isMissing
                  ? 'この職員は当日の送迎候補外です（勤務時間を確認してください）'
                  : marks.length > 0
                  ? `この日の担当エリア: ${marks.join(' ')}`
                  : undefined
              }
            >
              <option value="">未選択</option>
              {isMissing && <option value={id}>（候補外）</option>}
              {availableStaff.map((s) => (
                /* Phase 27: 外側のマークバッジと重複表示になるため option は名前のみ */
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {/* 選択中職員のマーク表示（select の value は option label の装飾を見せないので補足表示） */}
            {id && !isMissing && marks.length > 0 && (
              <span
                className="text-xs shrink-0 order-first"
                style={{ lineHeight: 1 }}
                title={`この日の担当エリア: ${marks.join(' ')}`}
                aria-label={`担当エリア ${marks.join(' ')}`}
              >
                {marks.join('')}
              </span>
            )}
          </div>
        );
      })}
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
