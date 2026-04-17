import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuthenticated } from '@/lib/auth/requireRole';
import type {
  ShiftAssignmentType,
  ShiftChangeRequestPayload,
  ShiftChangeRequestType,
} from '@/types';

/**
 * GET  /api/shift-change-requests?status=pending&from=...&to=...
 *   同テナントのシフト変更申請一覧（RLS で tenant 絞り込み）
 *
 * POST /api/shift-change-requests
 *   body: { staff_id?, target_date, change_type, requested_payload, reason? }
 *   Phase 25: viewer は自分の staff_id のみ可。editor/admin は他人分も可。
 */
const VALID_CHANGE_TYPES: ShiftChangeRequestType[] = ['time', 'leave', 'type_change'];
const VALID_ASSIGNMENT_TYPES: ShiftAssignmentType[] = [
  'normal',
  'public_holiday',
  'paid_leave',
  'off',
];

function validatePayload(
  change_type: ShiftChangeRequestType,
  payload: unknown,
): { ok: true; payload: ShiftChangeRequestPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'requested_payload が不正です' };
  }
  const p = payload as Record<string, unknown>;

  if (change_type === 'time') {
    if (typeof p.start_time !== 'string' || typeof p.end_time !== 'string') {
      return { ok: false, error: 'time 変更には start_time と end_time が必要です' };
    }
    return { ok: true, payload: { start_time: p.start_time, end_time: p.end_time } };
  }

  /* leave / type_change */
  if (
    typeof p.assignment_type !== 'string' ||
    !VALID_ASSIGNMENT_TYPES.includes(p.assignment_type as ShiftAssignmentType)
  ) {
    return { ok: false, error: 'assignment_type が不正です' };
  }
  return {
    ok: true,
    payload: {
      assignment_type: p.assignment_type as ShiftAssignmentType,
      start_time: typeof p.start_time === 'string' ? p.start_time : null,
      end_time: typeof p.end_time === 'string' ? p.end_time : null,
    },
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAuthenticated();
  if (!gate.ok) return gate.response;

  const status = request.nextUrl.searchParams.get('status');
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  const staffId = request.nextUrl.searchParams.get('staff_id');

  const supabase = await createClient();
  let q = supabase
    .from('shift_change_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) q = q.eq('status', status);
  if (from) q = q.gte('target_date', from);
  if (to) q = q.lte('target_date', to);
  if (staffId) q = q.eq('staff_id', staffId);

  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireAuthenticated();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON が不正です' }, { status: 400 });

  const { target_date, change_type, requested_payload, reason } = body;
  if (!target_date || typeof target_date !== 'string') {
    return NextResponse.json({ error: 'target_date は必須です' }, { status: 400 });
  }
  if (!VALID_CHANGE_TYPES.includes(change_type)) {
    return NextResponse.json({ error: 'change_type が不正です' }, { status: 400 });
  }

  const validated = validatePayload(change_type, requested_payload);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  /* viewer は自分の staff_id のみ。editor/admin は他人分も可 */
  const canActOnOthers = gate.staff.role === 'admin' || gate.staff.role === 'editor';
  const staff_id = canActOnOthers && body.staff_id ? body.staff_id : gate.staff.id;

  const supabase = await createClient();

  /* snapshot_before: 既存 shift_assignments 取得（あれば） */
  const { data: existingShift } = await supabase
    .from('shift_assignments')
    .select('id, staff_id, date, start_time, end_time, assignment_type, is_confirmed')
    .eq('staff_id', staff_id)
    .eq('date', target_date)
    .limit(1);

  const { data, error } = await supabase
    .from('shift_change_requests')
    .insert({
      tenant_id: gate.staff.tenant_id,
      staff_id,
      target_date,
      change_type,
      requested_payload: validated.payload,
      snapshot_before: existingShift?.[0] ?? null,
      reason: reason ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}
