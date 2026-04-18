import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { sendInviteEmail } from '@/lib/email/sendInviteEmail';
import { generateInviteLink } from '@/lib/email/generateInviteLink';
import type { StaffRole, EmploymentType } from '@/types';

/**
 * POST /api/staff/invite
 * admin のみ: 新規職員を招待
 *
 * フロー:
 *   1. public.staff に行を insert（user_id は null）
 *   2. admin.auth.admin.generateLink で招待リンクを生成（メール送信はしない）
 *      既にメールが auth.users にある場合は magiclink にフォールバック
 *   3. Resend で自前テンプレートの招待メールを送信
 *   4. staff.last_invited_at を更新
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
    pickup_transport_areas?: string[];
    dropoff_transport_areas?: string[];
    qualifications?: string[];
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
      /* Phase 30: AreaLabel.id 配列として受け入れ（重複排除はクライアント側で実施済み想定） */
      transport_areas: Array.isArray(body.transport_areas) ? body.transport_areas : [],
      /* Phase 27-D: 未指定時は transport_areas にフォールバック */
      pickup_transport_areas: Array.isArray(body.pickup_transport_areas)
        ? body.pickup_transport_areas
        : (Array.isArray(body.transport_areas) ? body.transport_areas : []),
      dropoff_transport_areas: Array.isArray(body.dropoff_transport_areas)
        ? body.dropoff_transport_areas
        : (Array.isArray(body.transport_areas) ? body.transport_areas : []),
      qualifications: body.qualifications ?? [],
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `職員の追加に失敗しました: ${insertError.message}` },
      { status: 500 }
    );
  }

  /* 2. テナント名を取得（メール本文用） */
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('name')
    .eq('id', inviter.tenant_id)
    .maybeSingle();
  const tenantName = tenantRow?.name ?? '事業所';

  /* 3. 招待リンクを生成（メール送信はしない）→ Resend で送信
     Phase 26: Supabase invite は implicit flow（hash fragment）で返すため、
     hash 処理用の /auth/confirm で受け、初回パスワード設定画面へ誘導 */
  const siteUrl = request.nextUrl.origin;
  const redirectTo = `${siteUrl}/auth/confirm?next=/auth/set-password`;

  const linkResult = await generateInviteLink(admin, {
    email: normalizedEmail,
    redirectTo,
    tenantId: inviter.tenant_id,
    staffId: staffRow.id,
  });

  if (!linkResult.ok) {
    return NextResponse.json(
      {
        warning: `職員は追加しましたが、招待リンクの生成に失敗しました: ${linkResult.error}`,
        staff: staffRow,
      },
      { status: 200 }
    );
  }

  /* 4. Resend で送信 */
  const mailResult = await sendInviteEmail({
    to: normalizedEmail,
    staffName: name,
    tenantName,
    actionLink: linkResult.actionLink,
    siteUrl,
  });

  if (!mailResult.ok) {
    return NextResponse.json(
      {
        warning: `職員は追加しましたが、メール送信に失敗しました: ${mailResult.error}`,
        staff: staffRow,
      },
      { status: 200 }
    );
  }

  /* 5. last_invited_at を更新（クールダウン判定用） */
  await admin
    .from('staff')
    .update({ last_invited_at: new Date().toISOString() })
    .eq('id', staffRow.id);

  return NextResponse.json({ staff: staffRow, invited: true });
}
