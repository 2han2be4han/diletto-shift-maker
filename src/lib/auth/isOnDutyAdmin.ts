import { createClient } from '@/lib/supabase/server';
import type { AuthenticatedStaff } from '@/types';

/**
 * 当該 staff が「現在出勤中の admin」かを判定。
 *
 * 条件:
 *   - staff.role === 'admin'
 *   - 今日の shift_assignments で assignment_type='normal' の行がある
 *   - 現在時刻 (tenant timezone は未設定のため Asia/Tokyo 前提) が
 *     start_time 〜 end_time の範囲内
 *
 * Phase 25-B-4: シフト変更申請の承認操作は onDuty admin に限定される。
 * on-duty でない admin は「情報参照」のみで、承認ボタンは非活性。
 */
export async function isOnDutyAdmin(
  staff: AuthenticatedStaff,
  now: Date = new Date(),
): Promise<boolean> {
  if (staff.role !== 'admin') return false;

  const supabase = await createClient();

  /* JST の「今日」と「現在時刻 (HH:MM:SS)」 */
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const y = jstNow.getFullYear();
  const m = String(jstNow.getMonth() + 1).padStart(2, '0');
  const d = String(jstNow.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  const hh = String(jstNow.getHours()).padStart(2, '0');
  const mm = String(jstNow.getMinutes()).padStart(2, '0');
  const nowHms = `${hh}:${mm}:00`;

  const { data, error } = await supabase
    .from('shift_assignments')
    .select('start_time, end_time')
    .eq('staff_id', staff.id)
    .eq('date', today)
    .eq('assignment_type', 'normal')
    .limit(1);

  if (error || !data || data.length === 0) return false;

  const row = data[0];
  if (!row.start_time || !row.end_time) return false;

  return row.start_time <= nowHms && nowHms <= row.end_time;
}
