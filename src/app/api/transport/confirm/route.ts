import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/transport/confirm
 * 送迎表確定API
 *
 * TODO: Supabase連携後にDB更新（is_confirmed: true）に切り替え
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, month } = body as { tenantId: string; month: string };

    if (!tenantId || !month) {
      return NextResponse.json({ error: 'tenantId, month は必須です' }, { status: 400 });
    }

    // TODO: Supabase連携
    // transport_assignmentsのis_confirmedをtrueに更新

    return NextResponse.json({ confirmed: true, month });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送迎表確定中にエラーが発生しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
