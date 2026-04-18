import type {
  ScheduleEntryRow,
  ChildRow,
  AreaLabel,
} from '@/types';

/**
 * Phase 29: 送迎仕様の解決（マーク一本化）
 *
 * schedule_entry から送迎に必要な情報（エリアラベル・時刻・場所）を
 * 迎/送それぞれで解決する。解決順:
 *   (a) pickup_mark / dropoff_mark が有効 → テナント pickup_areas / dropoff_areas
 *       または児童専用 custom_pickup_areas / custom_dropoff_areas から time / address / areaLabel を解決
 *   (b) マーク未設定なら児童の pickup_area_labels / dropoff_area_labels 候補 × entry の時刻から推論
 *   (c) entry 側の pickup_time / dropoff_time と住所フォールバック（最終手段）
 *
 * 送り側の location は最終フォールバックとして児童の home_address を使う。
 */

export type TransportSpec = {
  /** "🏠 藤江" のような emoji+name。null=該当なし */
  areaLabel: string | null;
  /** "HH:MM" または "HH:MM:SS"。null=未設定 */
  time: string | null;
  /** 住所（地図用）。null=該当なし */
  location: string | null;
};

export type ResolvedTransport = {
  pickup: TransportSpec;
  dropoff: TransportSpec;
};

/** "HH:MM:SS" → "HH:MM"。空/未設定は null */
function normTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/** AreaLabel[] から emoji+name 文字列で検索 */
function findArea(areas: AreaLabel[], label: string | null): AreaLabel | undefined {
  if (!label) return undefined;
  return areas.find((a) => `${a.emoji} ${a.name}` === label);
}

/**
 * テナント共通エリア + 児童専用エリアをマージ。
 * 同じ emoji+name は児童専用側を優先（time/address の上書き）。
 * custom 側の time/address が undefined の場合は tenant 側の値を維持する。
 */
export function mergeAreas(
  tenantAreas: AreaLabel[] | null | undefined,
  customAreas: AreaLabel[] | null | undefined,
): AreaLabel[] {
  const base = Array.isArray(tenantAreas) ? tenantAreas : [];
  const custom = Array.isArray(customAreas) ? customAreas : [];
  if (custom.length === 0) return base;
  const byKey = new Map<string, AreaLabel>();
  for (const a of base) byKey.set(`${a.emoji} ${a.name}`, a);
  for (const c of custom) {
    const key = `${c.emoji} ${c.name}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      emoji: c.emoji,
      name: c.name,
      time: c.time ?? prev?.time,
      address: c.address ?? prev?.address,
    });
  }
  return Array.from(byKey.values());
}

/**
 * 児童のマーク候補 × 解析時刻から、最もマッチするマークを推論。
 * PDF/Excel インポート時と、既存 entries の on-the-fly 解決で使う。
 *
 * 優先度:
 *   1. time がマーク候補に紐づくエリアの time と完全一致
 *   2. time から前後 15 分以内に該当するエリア
 *   3. マーク候補が 1 件だけなら無条件でそれを返す
 *   4. 該当なし → null
 */
export function inferMarkFromTime(
  markCandidates: string[] | null | undefined,
  tenantAreas: AreaLabel[] | null | undefined,
  time: string | null,
): string | null {
  if (!markCandidates || markCandidates.length === 0) return null;
  if (!tenantAreas || tenantAreas.length === 0) {
    return markCandidates.length === 1 ? markCandidates[0] : null;
  }
  const target = normTime(time);
  if (!target) {
    return markCandidates.length === 1 ? markCandidates[0] : null;
  }

  /* マーク候補を AreaLabel に解決（tenant 側に無いマークは除外） */
  const resolved = markCandidates
    .map((m) => ({ mark: m, area: findArea(tenantAreas, m) }))
    .filter((x): x is { mark: string; area: AreaLabel } => !!x.area && !!x.area.time);

  if (resolved.length === 0) {
    return markCandidates.length === 1 ? markCandidates[0] : null;
  }

  /* 1. 完全一致 */
  const exact = resolved.find((r) => normTime(r.area.time!) === target);
  if (exact) return exact.mark;

  /* 2. ±15 分以内で最近接 */
  const [th, tm] = target.split(':').map(Number);
  const targetMin = th * 60 + tm;
  let best: { mark: string; diff: number } | null = null;
  for (const r of resolved) {
    const [h, m] = normTime(r.area.time!)!.split(':').map(Number);
    const diff = Math.abs(h * 60 + m - targetMin);
    if (diff <= 15 && (!best || diff < best.diff)) {
      best = { mark: r.mark, diff };
    }
  }
  if (best) return best.mark;

  /* 3. 候補が 1 件なら無条件 */
  return markCandidates.length === 1 ? markCandidates[0] : null;
}

/**
 * schedule_entry を送迎仕様に解決。
 */
export function resolveEntryTransportSpec(
  entry: ScheduleEntryRow,
  params: {
    child: ChildRow | undefined;
    pickupAreas: AreaLabel[];
    dropoffAreas: AreaLabel[];
  },
): ResolvedTransport {
  const { child } = params;

  /* 児童専用エリアを tenant に合流してから解決に使う */
  const pickupAreas = mergeAreas(params.pickupAreas, child?.custom_pickup_areas);
  const dropoffAreas = mergeAreas(params.dropoffAreas, child?.custom_dropoff_areas);

  /* mark 解決: entry.pickup_mark / dropoff_mark を最優先、無ければ児童マーク × 時刻から推論 */
  const pickupMark =
    entry.pickup_mark
    ?? inferMarkFromTime(child?.pickup_area_labels, pickupAreas, entry.pickup_time);
  const dropoffMark =
    entry.dropoff_mark
    ?? inferMarkFromTime(child?.dropoff_area_labels, dropoffAreas, entry.dropoff_time);

  const resolveDirection = (direction: 'pickup' | 'dropoff'): TransportSpec => {
    const areas = direction === 'pickup' ? pickupAreas : dropoffAreas;
    const mark = direction === 'pickup' ? pickupMark : dropoffMark;
    const entryTime = normTime(direction === 'pickup' ? entry.pickup_time : entry.dropoff_time);
    const area = mark ? findArea(areas, mark) : undefined;
    const markTime = area?.time ?? null;
    const markAddr = area?.address ?? null;

    if (direction === 'pickup') {
      return {
        areaLabel: mark ?? null,
        /* entry 優先。entry に時刻が無いときは mark の基準時刻にフォールバック */
        time: entryTime ?? markTime,
        location: markAddr,
      };
    }
    return {
      areaLabel: mark ?? null,
      time: entryTime ?? markTime,
      /* 送り側は最終フォールバックに児童の自宅住所を使う */
      location: markAddr ?? child?.home_address ?? null,
    };
  };

  return {
    pickup: resolveDirection('pickup'),
    dropoff: resolveDirection('dropoff'),
  };
}
