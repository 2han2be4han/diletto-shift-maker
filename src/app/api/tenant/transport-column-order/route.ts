import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import type { TenantSettings, TransportColumnKey } from '@/types';
import { DEFAULT_TRANSPORT_COLUMN_ORDER } from '@/types';

/**
 * POST /api/tenant/transport-column-order
 *   送迎表（/transport）の列表示順をテナント単位で保存する。
 *   /api/tenant PATCH は admin 限定だが、列順は UI 操作の延長なので editor も許可。
 *   body: { order: TransportColumnKey[] }
 *
 *   既存 settings を壊さないように「既存をマージ → transport_column_order のみ書き換え」する。
 */

const KNOWN_KEYS: TransportColumnKey[] = [
  'pickup_time',
  'pickup_location',
  'pickup_staff',
  'dropoff_time',
  'dropoff_location',
  'dropoff_staff',
];

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  let body: { order?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
  }

  const rawOrder = Array.isArray(body.order) ? body.order : [];
  /* 既知キー以外を除き、欠けているキーを末尾に補完してから保存（クライアント信頼のみに頼らない） */
  const filtered = rawOrder.filter(
    (k): k is TransportColumnKey => typeof k === 'string' && (KNOWN_KEYS as string[]).includes(k),
  );
  const missing = KNOWN_KEYS.filter((k) => !filtered.includes(k));
  const order: TransportColumnKey[] = [...filtered, ...missing];

  const supabase = await createClient();
  /* 既存 settings を取得してマージ保存。
     （order だけ update すると JSONB の他キーが消えるため） */
  const { data: current, error: readErr } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', gate.staff.tenant_id)
    .maybeSingle();
  if (readErr || !current) {
    return NextResponse.json({ error: 'テナント取得に失敗しました' }, { status: 500 });
  }

  const nextSettings: TenantSettings = {
    ...(current.settings ?? {}),
    transport_column_order: order,
  };

  const { error: updateErr } = await supabase
    .from('tenants')
    .update({ settings: nextSettings })
    .eq('id', gate.staff.tenant_id);

  if (updateErr) {
    return NextResponse.json(
      { error: `列順の保存に失敗しました: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ order });
}

export async function GET() {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', gate.staff.tenant_id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ order: DEFAULT_TRANSPORT_COLUMN_ORDER });
  }
  const s: TenantSettings = data.settings ?? {};
  return NextResponse.json({
    order: s.transport_column_order ?? DEFAULT_TRANSPORT_COLUMN_ORDER,
  });
}
