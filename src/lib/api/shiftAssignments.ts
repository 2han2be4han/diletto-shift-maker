/**
 * Phase 65: シフト保存の共通ヘルパー。
 * /shift と /transport の両方からこの関数を経由してシフトを保存することで、
 * segment_order の計算ロジックをサーバ側に一元化する（クライアント計算の分散を排除）。
 *
 * 1 日まるごと置換するシンプルなインターフェース:
 *   replaceShiftDay(staffId, date, segments, isConfirmed)
 * → サーバ側で (staff_id, date) の既存全セグメントを削除し、segments を
 *    segment_order = 0..N で再採番して INSERT する。
 */

import type { ShiftAssignmentType } from '@/types';

export type ShiftSegmentInput = {
  start_time: string | null;
  end_time: string | null;
  assignment_type: ShiftAssignmentType;
  note?: string | null;
};

export type ReplaceShiftDayResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 1 日まるごと置換。
 * - segments が空配列なら、その日の全セグメントを削除（完全に空に戻す）
 * - segments が 1 件以上なら、(staff_id, date) の既存を消してから segment_order=0..N で再採番 INSERT
 */
export async function replaceShiftDay(
  staffId: string,
  date: string,
  segments: ShiftSegmentInput[],
  isConfirmed: boolean,
): Promise<ReplaceShiftDayResult> {
  try {
    const res = await fetch('/api/shift-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'replaceForDay',
        staff_id: staffId,
        date,
        segments,
        is_confirmed: isConfirmed,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? 'シフトの保存に失敗しました' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'シフトの保存に失敗しました' };
  }
}
