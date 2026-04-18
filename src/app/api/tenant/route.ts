import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import type { AreaLabel, TenantSettings } from '@/types';

/**
 * GET /api/tenant   - 自テナントの情報取得（同テナント全員可）
 * PATCH /api/tenant - テナント情報更新（admin のみ）
 */

/**
 * Phase 30: AreaLabel 配列に id を必ず付与する defensive sanitize。
 * クライアントが id を渡してきた場合は尊重、無ければサーバー側で採番する。
 * これによって「id 未付与のままテナント設定が保存され、児童側 labels 解決が破綻する」事故を防ぐ。
 */
function sanitizeAreaLabelsWithId(input: unknown): AreaLabel[] | null {
  if (!Array.isArray(input)) return null;
  const out: AreaLabel[] = [];
  for (const v of input) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const emoji = typeof r.emoji === 'string' ? r.emoji : '';
    const name = typeof r.name === 'string' ? r.name : '';
    if (!emoji && !name) continue;
    const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : randomUUID();
    const item: AreaLabel = { id, emoji, name };
    if (typeof r.time === 'string' && r.time.length > 0) item.time = r.time;
    if (typeof r.address === 'string' && r.address.length > 0) item.address = r.address;
    out.push(item);
  }
  return out;
}

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
  if (body.settings && typeof body.settings === 'object') {
    /* Phase 30: settings.pickup_areas / dropoff_areas / transport_areas に id を defensive 補完 */
    const settings = { ...body.settings } as TenantSettings & Record<string, unknown>;
    const pickup = sanitizeAreaLabelsWithId(settings.pickup_areas);
    const dropoff = sanitizeAreaLabelsWithId(settings.dropoff_areas);
    const transport = sanitizeAreaLabelsWithId(settings.transport_areas);
    if (pickup) settings.pickup_areas = pickup;
    if (dropoff) settings.dropoff_areas = dropoff;
    if (transport) settings.transport_areas = transport;
    payload.settings = settings;
  }

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
