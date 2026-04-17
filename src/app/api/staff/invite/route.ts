import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import type { StaffRole, EmploymentType } from '@/types';

/**
 * POST /api/staff/invite
 * admin のみ: 新規職員を招待
 *
 * body: {
 *   name: string
 *   email: string
 *   role: StaffRole
 *   employment_type?: EmploymentType
 *   is_qualified?: boolean
 *   default_start_time?: string
 *   default_end_time?: string
 *   transport_areas?: string[]
 * }
 *
 * 1. public.staff に行を insert（user_id は null）
 * 2. Supabase admin API で招待メール送信
 * 3. 職員がリンクからパスワード設定 → 0005 トリガーで staff.user_id が自動リンク
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;
  const { staff: inviter } = gate;

  let body: {
    name: string;
    email: string;
    role: StaffRole;
    employment_type?: EmploymentType;
    is_qualified?: boolean;
    default_start_time?: string | null;
    default_end_time?: string | null;
    transport_areas?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
  }

  const { name, email, role } = body;
  if (!name || !email || !role) {
    return NextResponse.json(
      { error: '氏名・メール・ロールは必須です' },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = createAdminClient();

  /* 1. staff 行を insert（user_id は null） */
  const { data: staffRow, error: insertError } = await admin
    .from('staff')
    .insert({
      tenant_id: inviter.tenant_id,
      name,
      email: normalizedEmail,
      role,
      employment_type: body.employment_type ?? 'part_time',
      is_qualified: body.is_qualified ?? false,
      default_start_time: body.default_start_time ?? null,
      default_end_time: body.default_end_time ?? null,
      transport_areas: body.transport_areas ?? [],
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `職員の追加に失敗しました: ${insertError.message}` },
      { status: 500 }
    );
  }

  /* 2. 招待メール送信 */
  const origin = request.nextUrl.origin;
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${origin}/auth/callback?next=/dashboard`,
    data: {
      tenant_id: inviter.tenant_id,
      staff_id: staffRow.id,
    },
  });

  if (inviteError) {
    /* 招待失敗時は staff 行を残す（既に email が Auth にある可能性があるので手動紐付け可能） */
    return NextResponse.json(
      {
        warning: `職員は追加しましたが、招待メール送信に失敗しました: ${inviteError.message}`,
        staff: staffRow,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ staff: staffRow, invited: true });
}
