import { DEMO_STORAGE_KEY } from './flag';
import { buildSeedState, type DemoState, DEMO_SEED_VERSION } from './seedData';

/**
 * デモ状態の永続化レイヤ。
 * sessionStorage に JSON で 1 キー保存する。タブを閉じれば消える。
 *
 * - load(): 既存があれば返す。version mismatch なら捨てて seed。
 * - save(): JSON.stringify して保存。容量超過時はリセットして再 seed。
 * - reset(): 完全初期化。
 *
 * 主要操作はメモリ上の DemoState を直接書き換え、最後に save() を呼ぶ流れ。
 */

let memoryCache: DemoState | null = null;

function readRaw(): DemoState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed?.meta?.seed_version !== DEMO_SEED_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(state: DemoState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* QuotaExceededError 等。デモなのでリセットして再保存を試みる。 */
    try {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}

export function loadDemoState(): DemoState {
  if (memoryCache) return memoryCache;
  const existing = readRaw();
  if (existing) {
    memoryCache = existing;
    return existing;
  }
  const seeded = buildSeedState();
  memoryCache = seeded;
  writeRaw(seeded);
  return seeded;
}

export function saveDemoState(state: DemoState): void {
  memoryCache = state;
  writeRaw(state);
}

/** 操作型のヘルパ: state を mutate してから save する */
export function mutateDemoState(mutator: (s: DemoState) => void): DemoState {
  const s = loadDemoState();
  mutator(s);
  saveDemoState(s);
  return s;
}

export function resetDemoState(): void {
  memoryCache = null;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}

/** デモ初期化を強制（ボタン「リセット」用） */
export function reseedDemoState(): DemoState {
  const fresh = buildSeedState();
  saveDemoState(fresh);
  return fresh;
}

/** ID 採番。ユニークなら何でもよいので簡易な乱数 + timestamp で十分。 */
export function genId(prefix = 'demo'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
