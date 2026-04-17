import { NextRequest } from 'next/server';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuthenticated } from '@/lib/auth/requireRole';
import type {
  ChildRow,
  ChildTransportPatternRow,
  ScheduleEntryRow,
  ShiftAssignmentRow,
  StaffRow,
  TransportAssignmentRow,
} from '@/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/output/daily/pdf?date=YYYY-MM-DD
 *
 * Phase 25-D: 日次出力をPDFで返す。全ログイン済み職員アクセス可。
 * attendance_status='absent' の児童は送迎から除外。
 */

type Slot = {
  time: string;
  direction: 'pickup' | 'dropoff';
  areaLabel: string | null;
  location: string | null;
  childNames: string[];
  staffNames: string[];
  isUnassigned: boolean;
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 10,
    color: '#666',
    marginBottom: 12,
  },
  body: {
    flexDirection: 'row',
    gap: 16,
  },
  leftCol: { flex: 1 },
  rightCol: { width: 160 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    borderBottom: '1 solid #ccc',
    paddingBottom: 2,
  },
  slot: {
    marginBottom: 6,
    padding: 6,
    border: '1 solid #ccc',
    borderRadius: 4,
  },
  slotUnassigned: {
    borderColor: '#9b3333',
    backgroundColor: '#faeaea',
  },
  slotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timeCol: { width: 50 },
  time: { fontSize: 14, fontWeight: 700 },
  timeLabel: { fontSize: 8, color: '#888' },
  infoCol: { flex: 1 },
  areaLine: { fontSize: 9, color: '#444', marginBottom: 2 },
  childLine: { fontSize: 10, fontWeight: 700 },
  staffLine: { fontSize: 9, color: '#333', marginTop: 2 },
  unassignedText: { color: '#9b3333', fontWeight: 700 },
  staffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    paddingVertical: 2,
    borderBottom: '0.5 dashed #ccc',
  },
});

function fmtTime(t: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export async function GET(request: NextRequest) {
  const gate = await requireAuthenticated();
  if (!gate.ok) return gate.response;

  const date = request.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response('date パラメータが不正です', { status: 400 });
  }

  const supabase = await createClient();
  const [sRes, cRes, pRes, eRes, aRes, tRes] = await Promise.all([
    supabase.from('staff').select('*').eq('is_active', true),
    supabase.from('children').select('*'),
    supabase.from('child_transport_patterns').select('*'),
    supabase.from('schedule_entries').select('*').eq('date', date),
    supabase.from('shift_assignments').select('*').eq('date', date),
    supabase
      .from('transport_assignments')
      .select('*, schedule_entries!inner(date)')
      .eq('schedule_entries.date', date),
  ]);

  const staff = (sRes.data as StaffRow[]) ?? [];
  const children = (cRes.data as ChildRow[]) ?? [];
  const patterns = (pRes.data as ChildTransportPatternRow[]) ?? [];
  const entries = (eRes.data as ScheduleEntryRow[]) ?? [];
  const shifts = (aRes.data as ShiftAssignmentRow[]) ?? [];
  const transportAssignments =
    (tRes.data as (TransportAssignmentRow & { schedule_entries?: unknown })[]) ?? [];

  const childById = new Map(children.map((c) => [c.id, c]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const patternById = new Map(patterns.map((p) => [p.id, p]));
  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  /* スロット組み立て */
  const rawSlots: Slot[] = [];
  for (const ta of transportAssignments) {
    const entry = entryById.get(ta.schedule_entry_id);
    if (!entry || entry.attendance_status === 'absent') continue;
    const child = childById.get(entry.child_id);
    if (!child) continue;
    const pattern = entry.pattern_id ? patternById.get(entry.pattern_id) : null;

    if (entry.pickup_time && entry.pickup_method === 'pickup') {
      rawSlots.push({
        time: fmtTime(entry.pickup_time),
        direction: 'pickup',
        areaLabel: pattern?.pickup_area_label ?? null,
        location: pattern?.pickup_location ?? null,
        childNames: [child.name],
        staffNames: ta.pickup_staff_ids.map((id) => staffNameById.get(id) ?? '?'),
        isUnassigned: ta.is_unassigned || ta.pickup_staff_ids.length === 0,
      });
    }
    if (entry.dropoff_time && entry.dropoff_method === 'dropoff') {
      rawSlots.push({
        time: fmtTime(entry.dropoff_time),
        direction: 'dropoff',
        areaLabel: pattern?.dropoff_area_label ?? null,
        location: pattern?.dropoff_location ?? child.home_address,
        childNames: [child.name],
        staffNames: ta.dropoff_staff_ids.map((id) => staffNameById.get(id) ?? '?'),
        isUnassigned: ta.is_unassigned || ta.dropoff_staff_ids.length === 0,
      });
    }
  }

  /* 同一時刻・方向・エリアでグルーピング */
  const grouped = new Map<string, Slot>();
  for (const s of rawSlots) {
    const key = `${s.time}|${s.direction}|${s.areaLabel ?? ''}|${s.location ?? ''}`;
    const exist = grouped.get(key);
    if (exist) {
      exist.childNames.push(...s.childNames);
      exist.staffNames = Array.from(new Set([...exist.staffNames, ...s.staffNames]));
      exist.isUnassigned = exist.isUnassigned || s.isUnassigned;
    } else {
      grouped.set(key, { ...s, childNames: [...s.childNames] });
    }
  }
  const slots = Array.from(grouped.values()).sort((a, b) =>
    a.time < b.time ? -1 : a.time > b.time ? 1 : a.direction === 'pickup' ? -1 : 1,
  );

  const onDuty = shifts
    .filter((sa) => sa.assignment_type === 'normal' && sa.start_time && sa.end_time)
    .map((sa) => ({
      name: staffNameById.get(sa.staff_id) ?? '?',
      start: fmtTime(sa.start_time),
      end: fmtTime(sa.end_time),
    }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));

  const dateObj = new Date(date);
  const dateLabel = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 (${['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]})`;

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.header }, dateLabel),
      React.createElement(
        Text,
        { style: styles.subHeader },
        `送迎 ${slots.length}便 / 出勤 ${onDuty.length}名${
          slots.filter((s) => s.isUnassigned).length > 0
            ? ` / ⚠ 未割当 ${slots.filter((s) => s.isUnassigned).length}件`
            : ''
        }`,
      ),
      React.createElement(
        View,
        { style: styles.body },
        /* Left column: transport */
        React.createElement(
          View,
          { style: styles.leftCol },
          React.createElement(Text, { style: styles.sectionTitle }, '送迎予定'),
          ...slots.map((s, i) =>
            React.createElement(
              View,
              {
                key: i,
                style: [styles.slot, ...(s.isUnassigned ? [styles.slotUnassigned] : [])],
              },
              React.createElement(
                View,
                { style: styles.slotRow },
                React.createElement(
                  View,
                  { style: styles.timeCol },
                  React.createElement(Text, { style: styles.time }, s.time),
                  React.createElement(
                    Text,
                    { style: styles.timeLabel },
                    s.direction === 'pickup' ? '迎' : '送',
                  ),
                ),
                React.createElement(
                  View,
                  { style: styles.infoCol },
                  s.areaLabel || s.location
                    ? React.createElement(
                        Text,
                        { style: styles.areaLine },
                        `${s.areaLabel ?? ''} ${s.location ?? ''}`.trim(),
                      )
                    : null,
                  React.createElement(
                    Text,
                    { style: styles.childLine },
                    s.childNames.join(' / '),
                  ),
                  React.createElement(
                    Text,
                    {
                      style: [
                        styles.staffLine,
                        ...(s.isUnassigned ? [styles.unassignedText] : []),
                      ],
                    },
                    s.isUnassigned
                      ? '⚠ 担当未割当'
                      : `担当: ${s.staffNames.length > 0 ? s.staffNames.join(' / ') : '—'}`,
                  ),
                ),
              ),
            ),
          ),
        ),
        /* Right column: staff on duty */
        React.createElement(
          View,
          { style: styles.rightCol },
          React.createElement(Text, { style: styles.sectionTitle }, '本日の出勤'),
          ...onDuty.map((s, i) =>
            React.createElement(
              View,
              { key: i, style: styles.staffRow },
              React.createElement(Text, null, s.name),
              React.createElement(Text, { style: { color: '#666' } }, `${s.start}〜${s.end}`),
            ),
          ),
          onDuty.length === 0
            ? React.createElement(
                Text,
                { style: { fontSize: 9, color: '#999' } },
                '出勤者なし',
              )
            : null,
        ),
      ),
    ),
  );

  const buffer = await renderToBuffer(doc);
  const uint8 = new Uint8Array(buffer);

  return new Response(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="daily_${date}.pdf"`,
    },
  });
}
