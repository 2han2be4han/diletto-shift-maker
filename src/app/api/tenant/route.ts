import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import type { TenantSettings } from '@/types';

/**
 * GET /api/tenant   - 自テナントの情報取得（同テナント全員可）
 * PATCH /api/tenant - テナント情報更新（admin のみ）
 */

export async function GET() {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, status, settings, created_at')
    .eq('id', gate.staff.tenant_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'テナント情報を取得できませんでした' }, { status: 500 });
  }
  return NextResponse.json({ tenant: data });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;

  let body: { name?: string; settings?: TenantSettings };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
  }

  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (typeof body.name === 'string') payload.name = body.name;
  if (body.settings && typeof body.settings === 'object') payload.settings = body.settings;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(payload)
    .eq('id', gate.staff.tenant_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ tenant: data });
}
