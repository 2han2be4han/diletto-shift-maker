import { addDays, format, isAfter, isBefore, parseISO, subDays } from 'date-fns';
import { StaffRole } from '@/types';

/**
 * 閲覧者・編集者に対する参照可能範囲 (from, to) を yyyy-MM-dd で返す。
 * 管理者の場合は { from: null, to: null } を返す。
 */
export function getScheduleAllowedRange(role: StaffRole): { from: string | null; to: string | null } {
  if (role === 'admin') return { from: null, to: null };
  const today = new Date();
  
  /* 過去2日前から、将来7日後まで */
  const fromDate = subDays(today, 2);
  const toDate = addDays(today, 7);
  
  return {
    from: format(fromDate, 'yyyy-MM-dd'),
    to: format(toDate, 'yyyy-MM-dd'),
  };
}

/**
 * 指定された日付が制限範囲外（過去すぎる、または未来すぎる）か判定する。
 */
export function isDateOutOfRange(dateStr: string, role: StaffRole): boolean {
  const range = getScheduleAllowedRange(role);
  if (!range.from || !range.to) return false;
  
  const d = dateStr;
  return d < range.from || d > range.to;
}

/**
 * API パラメータの from/to を権限に応じて強制的に範囲内に収める。
 */
export function capRange(from: string | null, to: string | null, role: StaffRole): { from: string | null; to: string | null } {
  const range = getScheduleAllowedRange(role);
  if (!range.from || !range.to) return { from, to };

  let cappedFrom = from;
  let cappedTo = to;

  /* from が制限より前（古い）なら切り上げる */
  if (!from || from < range.from) {
    cappedFrom = range.from;
  }
  
  /* to が制限より後（未来）なら切り下げる */
  if (!to || to > range.to) {
    cappedTo = range.to;
  }
  
  /* 逆転防止（念のため） */
  if (cappedFrom && cappedTo && cappedFrom > cappedTo) {
    cappedTo = cappedFrom;
  }

  return { from: cappedFrom, to: cappedTo };
}
