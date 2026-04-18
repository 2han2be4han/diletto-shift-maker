'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, subDays } from 'date-fns';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { defaultOutputDate, toDateString, nextBusinessDay } from '@/lib/dates/nextBusinessDay';
import type {
  StaffRow,
  ChildRow,
  ScheduleEntryRow,
  ShiftAssignmentRow,
  TransportAssignmentRow,
  AreaLabel,
  TenantSettings,
  GradeType,
} from '@/types';
import { resolveEntryTransportSpec } from '@/lib/logic/resolveTransportSpec';
import { staffDisplayName } from '@/lib/utils/displayName';

/** 児童名をマーク円内で 2 行表示するために分割。
    空白区切りがあればそこで分ける。無ければ文字列中央で分ける。2 文字以下は 1 行のまま。 */
function splitChildName(name: string): string[] {
  const t = (name ?? '').trim();
  const parts = t.split(/\s+/);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join('')];
  if (t.length <= 2) return [t];
  const mid = Math.ceil(t.length / 2);
  return [t.slice(0, mid), t.slice(mid)];
}

/** 児童管理 (settings/children) の getGradeRowBg と揃えた色分け。
    bg/border/text を返す。preschool=青系 / nursery=赤系 / 他=緑系。 */
function getGradeColors(grade: GradeType): { bg: string; border: string; text: string } {
  switch (grade) {
    case 'preschool':
      return { bg: 'rgba(26,62,184,0.14)', border: 'rgba(26,62,184,0.75)', text: 'rgb(16,40,120)' };
    case 'nursery_3':
    case 'nursery_4':
    case 'nursery_5':
      return { bg: 'rgba(155,51,51,0.14)', border: 'rgba(155,51,51,0.75)', text: 'rgb(120,35,35)' };
    default:
      return { bg: 'rgba(42,122,82,0.14)', border: 'rgba(42,122,82,0.75)', text: 'rgb(28,90,60)' };
  }
}

/**
 * Phase 31: 日次出力ページ（ホワイトボード風）
 *
 * 事業所のアナログ送迎ボード（時刻発ブロック + 児童マーク + 担当職員ボックス +
 * 右サイドの勤務時間表 + 休憩セクション）に寄せたレイアウト。
 * attendance_status='absent' の児童は送迎表示から除外（欠席連動）。
 */

type TransportSlot = {
  time: string;
  direction: 'pickup' | 'dropoff';
  /** 同一担当者にまとめた結果、複数エリアを跨ぐ場合に備えて配列で保持 */
  areaLabels: string[];
  children: Array<{
    name: string;
    areaEmoji: string | null;
    grade: GradeType;
  }>;
  staffIds: string[];
  isUnassigned: boolean;
  isConfirmed: boolean;
};

type OnDutyStaff = {
  id: string;
  name: string;
  start: string;
  end: string;
};

function fmtTime(t: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function DailyOutputPage() {
  const [date, setDate] = useState(defaultOutputDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [entries, setEntries] = useState<ScheduleEntryRow[]>([]);
  const [shifts, setShifts] = useState<ShiftAssignmentRow[]>([]);
  const [transportAssignments, setTransportAssignments] = useState<TransportAssignmentRow[]>([]);
  const [pickupAreas, setPickupAreas] = useState<AreaLabel[]>([]);
  const [dropoffAreas, setDropoffAreas] = useState<AreaLabel[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sRes, cRes, eRes, aRes, tRes, tenantRes] = await Promise.all([
        fetch('/api/staff'),
        fetch('/api/children'),
        fetch(`/api/schedule-entries?from=${date}&to=${date}`),
        fetch(`/api/shift-assignments?from=${date}&to=${date}`),
        fetch(`/api/transport-assignments?from=${date}&to=${date}`),
        fetch('/api/tenant'),
      ]);
      const sJson = sRes.ok ? await sRes.json() : { staff: [] };
      const cJson = cRes.ok ? await cRes.json() : { children: [] };
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const aJson = aRes.ok ? await aRes.json() : { assignments: [] };
      const tJson = tRes.ok ? await tRes.json() : { assignments: [] };
      const tenantJson = tenantRes.ok ? await tenantRes.json() : { tenant: null };

      setStaff(sJson.staff ?? []);
      setChildren(cJson.children ?? []);
      setEntries(eJson.entries ?? []);
      setShifts(aJson.assignments ?? []);
      setTransportAssignments(tJson.assignments ?? []);
      const settings: TenantSettings = tenantJson.tenant?.settings ?? {};
      setPickupAreas(settings.pickup_areas ?? settings.transport_areas ?? []);
      setDropoffAreas(settings.dropoff_areas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /* AreaLabel → emoji 引き */
  const allAreas = useMemo(
    () => [...pickupAreas, ...dropoffAreas],
    [pickupAreas, dropoffAreas],
  );
  const areaEmojiByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of allAreas) {
      m.set(`${a.emoji} ${a.name}`, a.emoji);
      m.set(a.name, a.emoji);
    }
    return m;
  }, [allAreas]);

  /* ---- 送迎スロットをタイムライン順に組み立て ---- */
  const slots: TransportSlot[] = useMemo(() => {
    const childById = new Map(children.map((c) => [c.id, c]));
    const entryById = new Map(entries.map((e) => [e.id, e]));

    const list: TransportSlot[] = [];

    for (const ta of transportAssignments) {
      const entry = entryById.get(ta.schedule_entry_id);
      if (!entry) continue;
      if (entry.attendance_status === 'absent') continue;

      const child = childById.get(entry.child_id);
      if (!child) continue;
      const spec = resolveEntryTransportSpec(entry, {
        child,
        pickupAreas,
        dropoffAreas,
      });

      if (entry.pickup_time && entry.pickup_method === 'pickup') {
        const emoji = spec.pickup.areaLabel
          ? areaEmojiByLabel.get(spec.pickup.areaLabel) ?? null
          : null;
        list.push({
          time: fmtTime(entry.pickup_time),
          direction: 'pickup',
          areaLabels: spec.pickup.areaLabel ? [spec.pickup.areaLabel] : [],
          children: [{ name: child.name, areaEmoji: emoji, grade: child.grade_type }],
          staffIds: ta.pickup_staff_ids,
          isUnassigned:
            ta.is_unassigned ||
            (entry.pickup_method === 'pickup' && ta.pickup_staff_ids.length === 0),
          isConfirmed: ta.is_confirmed,
        });
      }

      if (entry.dropoff_time && entry.dropoff_method === 'dropoff') {
        const emoji = spec.dropoff.areaLabel
          ? areaEmojiByLabel.get(spec.dropoff.areaLabel) ?? null
          : null;
        list.push({
          time: fmtTime(entry.dropoff_time),
          direction: 'dropoff',
          areaLabels: spec.dropoff.areaLabel ? [spec.dropoff.areaLabel] : [],
          children: [{ name: child.name, areaEmoji: emoji, grade: child.grade_type }],
          staffIds: ta.dropoff_staff_ids,
          isUnassigned:
            ta.is_unassigned ||
            (entry.dropoff_method === 'dropoff' && ta.dropoff_staff_ids.length === 0),
          isConfirmed: ta.is_confirmed,
        });
      }
    }

    /* グルーピング:
       - 担当者が割り当てられている slot: 同時刻+同方向+同じ担当者集合 でまとめる
         （エリア違いでも同じ担当者なら 1 ブロックに統合。areaLabels は配列で保持）
       - 未割当 slot: 同時刻+同方向+同エリア でまとめる（担当者が無いので area ベース） */
    const grouped = new Map<string, TransportSlot>();
    for (const s of list) {
      const hasStaff = s.staffIds.length > 0;
      const staffKey = hasStaff
        ? `S:${[...s.staffIds].sort().join(',')}`
        : `U:${s.areaLabels.join('|')}`;
      const key = `${s.time}|${s.direction}|${staffKey}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.children.push(...s.children);
        existing.staffIds = Array.from(new Set([...existing.staffIds, ...s.staffIds]));
        /* エリア違いの slot がマージされたら areaLabels に追加 */
        for (const al of s.areaLabels) {
          if (al && !existing.areaLabels.includes(al)) existing.areaLabels.push(al);
        }
        existing.isUnassigned = existing.isUnassigned || s.isUnassigned;
      } else {
        grouped.set(key, {
          ...s,
          children: [...s.children],
          areaLabels: [...s.areaLabels],
        });
      }
    }

    const result = Array.from(grouped.values());
    result.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    return result;
  }, [children, entries, transportAssignments, pickupAreas, dropoffAreas, areaEmojiByLabel]);

  const pickupSlots = useMemo(() => slots.filter((s) => s.direction === 'pickup'), [slots]);
  const dropoffSlots = useMemo(() => slots.filter((s) => s.direction === 'dropoff'), [slots]);

  /* ---- 出勤者一覧: 職員管理と同じ並び（staff API が display_order ASC NULLS LAST, name でソート済） ---- */
  const onDuty: OnDutyStaff[] = useMemo(() => {
    const shiftByStaffId = new Map(
      shifts
        .filter((sa) => sa.assignment_type === 'normal' && sa.start_time && sa.end_time)
        .map((sa) => [sa.staff_id, sa] as const),
    );
    /* staff 配列の順序をそのまま使う（職員管理の並びと一致） */
    return staff
      .filter((s) => shiftByStaffId.has(s.id))
      .map((s) => {
        const sa = shiftByStaffId.get(s.id)!;
        return {
          id: s.id,
          name: staffDisplayName(s),
          start: fmtTime(sa.start_time),
          end: fmtTime(sa.end_time),
        };
      });
  }, [shifts, staff]);

  const unassignedCount = slots.filter((s) => s.isUnassigned).length;
  /* 職員マーク内は表示名（短縮）。display_name 未登録時は staffDisplayName のフォールバック（姓+名頭文字など） */
  const staffNameById = useMemo(
    () => new Map(staff.map((s) => [s.id, staffDisplayName(s)])),
    [staff],
  );

  /* 利用児童数: 当日 entries のうち欠席でないユニーク child_id 数 */
  const activeChildCount = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      if (e.attendance_status === 'absent') continue;
      ids.add(e.child_id);
    }
    return ids.size;
  }, [entries]);

  /**
   * ブラウザ標準の印刷ダイアログを起動。
   * ユーザーはここから「PDF として保存」を選ぶ（全ブラウザ共通）。
   * 日本語・絵文字はブラウザ標準フォントで確実に描画される。
   * document.title をファイル名ヒントとして一時的に書き換える。
   */
  const handlePrint = () => {
    const original = document.title;
    document.title = `日次出力_${date}`;
    /* タイトル反映直後に印刷を呼ぶ。afterprint で元タイトルに戻す。 */
    const restore = () => {
      document.title = original;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  };

  const dateObj = new Date(date);
  const monthLabel = `${dateObj.getMonth() + 1}月`;
  const dayLabel = `${dateObj.getDate()}`;
  const weekLabel = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];

  return (
    <div className="flex flex-col h-full overflow-hidden daily-output-root">
      {/* 印刷用 CSS: 印刷時はサイドバー・ヘッダー・ナビボタン非表示、A4縦に最適化 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A3 portrait; margin: 10mm; }
              html, body {
                background: #fff !important;
                height: auto !important;
                overflow: visible !important;
                /* モバイル印刷対策: 狭いビューポートのときだけ 1100px まで広げる。
                   PC は通常これ以上の幅があるため no-op。 */
                min-width: 1100px !important;
              }
              /* AppShell 外周 (flex h-screen overflow-hidden) を印刷時に解放。
                 モバイル印刷では 100vh で下がクリップされ、flex 構造で幅も圧縮されるため
                 display: block + 幅/高さ解放に切り替える。PC でもサイドバーは aside で
                 非表示なので block 化しても副作用なし。 */
              body > div {
                display: block !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                min-width: 1100px !important;
              }
              main {
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
              }
              /* AppShell や layout が灰色 (var(--bg)) を当てている要素をすべて白に強制 */
              [style*="var(--bg)"],
              main {
                background: #fff !important;
                background-color: #fff !important;
              }
              /* アプリシェルの付帯UIを完全非表示 */
              aside, header, .print-hide {
                display: none !important;
              }
              /* メインコンテナを紙面に馴染ませる */
              .daily-output-root,
              .daily-output-root > div {
                height: auto !important;
                overflow: visible !important;
                padding: 0 !important;
                background: #fff !important;
              }
              .whiteboard-frame {
                box-shadow: none !important;
                max-width: none !important;
                margin: 0 !important;
              }
              .transport-block {
                page-break-inside: avoid;
                break-inside: avoid;
              }
              /* 色を残す */
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }

            /* モバイル画面 (<1024px) のみ縦積みに切り替え。
               @media screen スコープなので @media print には一切影響しない。
               元の 2-col レイアウト (minmax(0,1fr) 320px) は PC 画面/印刷で維持される。 */
            @media screen and (max-width: 1023px) {
              .whiteboard-grid {
                grid-template-columns: 1fr !important;
                gap: 1.25rem !important;
              }
              /* 2-col 前提の横並びヘッダーがモバイルでつぶれないよう余白を調整 */
              .whiteboard-frame {
                padding: 1rem !important;
              }
            }
          `,
        }}
      />

      <Header
        title="日次出力"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setDate(toDateString(subDays(new Date(date), 1)))}
            >
              ← 前日
            </Button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2 py-1 rounded text-sm"
              style={{ border: '1px solid var(--rule)' }}
            />
            <Button
              variant="secondary"
              onClick={() => setDate(toDateString(addDays(new Date(date), 1)))}
            >
              翌日 →
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDate(toDateString(nextBusinessDay(new Date())))}
            >
              今日/翌営業日
            </Button>
            <Button variant="primary" onClick={handlePrint}>
              🖨 印刷 / PDF保存
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-3 lg:p-6" style={{ background: 'var(--white)' }}>
        {error && (
          <div
            className="mb-2 px-4 py-2 rounded"
            style={{ background: 'var(--red-pale)', color: 'var(--red)', fontSize: '0.85rem' }}
          >
            {error}
          </div>
        )}

        {/* 未割当があるときだけ画面上に警告を出す（日付はボード内カードに表示） */}
        {unassignedCount > 0 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap print-hide">
            <Badge variant="error">未割当 {unassignedCount}件</Badge>
          </div>
        )}

        {loading ? (
          <div className="h-96 flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)' }}>
            読み込み中...
          </div>
        ) : (
          /* ホワイトボード本体: A3 縦に合わせた最大幅。常時 2-col（左=送迎, 右=勤務+休憩） */
          <div
            className="rounded-lg p-4 lg:p-6 whiteboard-frame mx-auto"
            style={{
              background: 'var(--white)',
              border: '2px solid var(--ink-2)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              maxWidth: '1100px',
            }}
          >
            <div className="grid gap-5 lg:gap-6 whiteboard-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
              {/* 左カラム: 日付カード + 送迎タイムライン */}
              <div>
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  {/* 日付カード（横並び: 4月20日(月) を 1 行で） */}
                  <div
                    className="shrink-0"
                    style={{
                      border: '2px solid var(--ink)',
                      borderRadius: '6px',
                      padding: '10px 18px',
                    }}
                  >
                    <span
                      className="text-2xl font-black whitespace-nowrap"
                      style={{ color: 'var(--ink)' }}
                    >
                      {monthLabel}{dayLabel}日({weekLabel})
                    </span>
                  </div>
                  <div>
                    <div className="text-base font-black" style={{ color: 'var(--ink-2)' }}>
                      予定ホワイトボード
                    </div>
                    <div className="text-base font-bold mt-1" style={{ color: 'var(--ink)' }}>
                      出勤者 {onDuty.length}名・利用児童 {activeChildCount}名
                    </div>
                  </div>
                </div>

                {slots.length === 0 ? (
                  <div
                    className="p-6 rounded text-sm text-center"
                    style={{ border: '1px dashed var(--rule)', color: 'var(--ink-3)' }}
                  >
                    この日の送迎予定はありません
                  </div>
                ) : (
                  <>
                    {/* 迎セクション: 上下に太線。3 列レイアウト (col1=1件, col2=2件まで, col3=5件まで) */}
                    <DirectionSection
                      heading="迎（来所）"
                      count={pickupSlots.length}
                      accent="var(--accent)"
                    >
                      {pickupSlots.length === 0 ? (
                        <EmptyDirection label="迎" />
                      ) : (
                        <ThreeColGrid
                          slots={pickupSlots}
                          staffNameById={staffNameById}
                          keyPrefix="p"
                          direction="pickup"
                        />
                      )}
                    </DirectionSection>

                    {/* 送セクション: 上下に太線。3 列レイアウト (同上) */}
                    <DirectionSection
                      heading="送（退所）"
                      count={dropoffSlots.length}
                      accent="var(--green)"
                    >
                      {dropoffSlots.length === 0 ? (
                        <EmptyDirection label="送" />
                      ) : (
                        <ThreeColGrid
                          slots={dropoffSlots}
                          staffNameById={staffNameById}
                          keyPrefix="d"
                          direction="dropoff"
                        />
                      )}
                    </DirectionSection>
                  </>
                )}
              </div>

              {/* 右カラム: 本日の出勤 + 休憩セクション */}
              <div className="flex flex-col gap-4">
                <section>
                  <h3
                    className="text-base font-black pb-1 mb-2"
                    style={{ color: 'var(--ink)', borderBottom: '2.5px solid var(--ink)' }}
                  >
                    本日の出勤
                  </h3>
                  {onDuty.length === 0 ? (
                    <div className="text-sm" style={{ color: 'var(--ink-3)' }}>
                      出勤者はいません
                    </div>
                  ) : (
                    <ul className="flex flex-col">
                      {onDuty.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 py-1.5"
                          style={{ borderBottom: '1px dashed var(--rule)' }}
                        >
                          <span
                            className="text-base font-black whitespace-nowrap"
                            style={{ color: 'var(--ink)' }}
                          >
                            {s.name}
                          </span>
                          <span
                            className="text-sm font-bold tracking-tight whitespace-nowrap"
                            style={{ color: 'var(--ink-2)' }}
                          >
                            {s.start}〜{s.end}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3
                    className="text-base font-black pb-1 mb-2"
                    style={{ color: 'var(--ink)', borderBottom: '2.5px solid var(--ink)' }}
                  >
                    休憩
                  </h3>
                  <div
                    className="p-3 rounded text-sm font-semibold"
                    style={{
                      border: '1px dashed var(--rule)',
                      color: 'var(--ink-2)',
                      minHeight: '70px',
                      lineHeight: '1.5',
                    }}
                  >
                    休憩時間をずらす
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== 迎/送セクション: 上下に太線を引いて完全分離 ===== */
function DirectionSection({
  heading,
  count,
  accent,
  children,
}: {
  heading: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 direction-section">
      {/* 太い上線 + 見出し */}
      <div
        className="flex items-baseline gap-2 px-2 py-1.5 direction-section-header"
        style={{
          borderTop: `6px solid ${accent}`,
          borderBottom: `2px solid ${accent}`,
          marginBottom: '10px',
        }}
      >
        <span className="text-xl font-black" style={{ color: accent }}>
          {heading}
        </span>
        <span className="text-sm font-bold" style={{ color: 'var(--ink-3)' }}>
          {count}便
        </span>
      </div>
      {children}
      {/* 太い下線で締める */}
      <div
        className="direction-section-footer"
        style={{
          borderBottom: `6px solid ${accent}`,
          marginTop: '10px',
        }}
      />
    </div>
  );
}

function EmptyDirection({ label }: { label: string }) {
  return (
    <div
      className="p-4 rounded text-xs text-center"
      style={{ border: '1px dashed var(--rule)', color: 'var(--ink-3)' }}
    >
      {label}の便はありません
    </div>
  );
}

/** 方向別のブロック配置ルール:
 *   迎え: 1 / 1 / 2 / 3 / 3 / 3... （1 行目 1件、2 行目 1件、3 行目 2件、4 行目以降 3件ずつ）
 *   送り: 2 / 3 / 3 / 3...         （1 行目 2件、2 行目以降 3件ずつ） */
function slotCell(i: number, direction: 'pickup' | 'dropoff'): { col: number; row: number } {
  if (direction === 'pickup') {
    if (i === 0) return { col: 1, row: 1 };
    if (i === 1) return { col: 1, row: 2 };
    if (i === 2) return { col: 1, row: 3 };
    if (i === 3) return { col: 2, row: 3 };
    /* i >= 4: row 4 から 3列ずつ */
    const r = 4 + Math.floor((i - 4) / 3);
    const c = ((i - 4) % 3) + 1;
    return { col: c, row: r };
  }
  /* dropoff */
  if (i === 0) return { col: 1, row: 1 };
  if (i === 1) return { col: 2, row: 1 };
  /* i >= 2: row 2 から 3列ずつ */
  const r = 2 + Math.floor((i - 2) / 3);
  const c = ((i - 2) % 3) + 1;
  return { col: c, row: r };
}

function ThreeColGrid({
  slots,
  staffNameById,
  keyPrefix,
  direction,
}: {
  slots: TransportSlot[];
  staffNameById: Map<string, string>;
  keyPrefix: string;
  direction: 'pickup' | 'dropoff';
}) {
  return (
    <div
      className="grid gap-x-6 gap-y-5"
      style={{
        gridTemplateColumns: 'repeat(3, max-content)',
        gridAutoRows: 'min-content',
        justifyContent: 'start',
      }}
    >
      {slots.map((s, i) => {
        const pos = slotCell(i, direction);
        return (
          <div
            key={`${keyPrefix}-${s.time}-${s.areaLabels.join(',')}-${i}`}
            style={{ gridColumn: pos.col, gridRow: pos.row }}
          >
            <TransportBlock slot={s} staffNameById={staffNameById} />
          </div>
        );
      })}
    </div>
  );
}

/* ===== 時刻ブロック: 画像の罫線で囲まれた一枠に相当 ===== */
function TransportBlock({
  slot,
  staffNameById,
}: {
  slot: TransportSlot;
  staffNameById: Map<string, string>;
}) {
  const headerColor = slot.direction === 'pickup' ? 'var(--accent)' : 'var(--green)';
  return (
    <div
      className="flex flex-col transport-block"
      style={{
        border: `2px solid ${slot.isUnassigned ? 'var(--red)' : 'var(--ink-2)'}`,
        background: slot.isUnassigned ? 'var(--red-pale)' : 'var(--white)',
        borderRadius: '6px',
        /* 内容に応じて自然幅。児童 1 名でも詰めて表示、多い便だけ横に広がる。 */
        flex: '0 0 auto',
        minWidth: 0,
        maxWidth: '380px',
      }}
    >
      {/* ヘッダー: 13:10発  榎江保育園(小)  / 大府緑公園  (複数エリア対応) */}
      <div
        className="px-3 py-2 flex items-baseline gap-2 flex-wrap"
        style={{ borderBottom: '1.5px solid var(--ink-2)' }}
      >
        <span className="text-2xl font-black leading-none" style={{ color: headerColor }}>
          {slot.time}
        </span>
        <span className="text-base font-black" style={{ color: headerColor }}>
          発
        </span>
        {slot.areaLabels.length > 0 && (
          <span className="text-base font-black" style={{ color: 'var(--ink)' }}>
            {slot.areaLabels.join(' / ')}
          </span>
        )}
      </div>

      {/* 本体: 児童マーク + 担当職員 */}
      <div className="p-3 flex flex-col gap-2">
        {/* 児童マーク行 */}
        <div className="flex flex-wrap gap-1.5">
          {slot.children.map((c, idx) => {
            const col = getGradeColors(c.grade);
            const nameLines = splitChildName(c.name);
            return (
              <div
                key={idx}
                className="flex flex-col items-center justify-center child-mark"
                style={{
                  background: col.bg,
                  border: `2px solid ${col.border}`,
                  borderRadius: '999px',
                  minWidth: '64px',
                  minHeight: '64px',
                  lineHeight: '1.1',
                  padding: '4px 6px',
                }}
                title={c.name}
              >
                {nameLines.map((line, i) => (
                  <span
                    key={i}
                    className="text-sm font-black whitespace-nowrap"
                    style={{ color: col.text }}
                  >
                    {line}
                  </span>
                ))}
              </div>
            );
          })}
        </div>

        {/* 担当職員ボックス行 */}
        <div className="flex flex-wrap gap-1.5 pt-1" style={{ borderTop: '1px dashed var(--rule)' }}>
          {slot.isUnassigned ? (
            <span
              className="text-base font-black px-2 py-1"
              style={{ color: 'var(--red)' }}
            >
              ⚠ 担当未割当
            </span>
          ) : slot.staffIds.length === 0 ? (
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              —
            </span>
          ) : (
            slot.staffIds.map((id) => (
              <span
                key={id}
                className="text-base font-black staff-box whitespace-nowrap"
                style={{
                  background: 'var(--white)',
                  border: '2px solid var(--ink-2)',
                  borderRadius: '4px',
                  color: 'var(--ink)',
                  minWidth: '56px',
                  padding: '4px 10px',
                  textAlign: 'center',
                }}
              >
                {staffNameById.get(id) ?? id}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
